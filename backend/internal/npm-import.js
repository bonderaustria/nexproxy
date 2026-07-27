import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import knexLib from "knex";
import db from "../db.js";
import { isPostgres } from "../lib/config.js";
import { sshDownloadDir, sshDownloadFile, sshReadlink, sshRemoteExists, sshTest } from "../lib/ssh.js";
import { global as logger } from "../logger.js";
import internalNginx from "./nginx.js";
import deadHostModel from "../models/dead_host.js";
import proxyHostModel from "../models/proxy_host.js";
import redirectionHostModel from "../models/redirection_host.js";
import streamModel from "../models/stream.js";

const REMOTE_SQLITE_PATH = "/data/database.sqlite";

// Tables copied, in FK-safe order. Same schema as the original Nginx Proxy
// Manager (NexProxy is a fork) — this is what makes the import possible at all.
const IMPORT_TABLES = [
	"user",
	"auth",
	"user_permission",
	"certificate",
	"access_list",
	"access_list_auth",
	"access_list_client",
	"proxy_host",
	"redirection_host",
	"dead_host",
	"stream",
];

const JSON_COLUMNS = {
	user: ["roles"],
	auth: ["meta"],
	certificate: ["domain_names", "meta"],
	access_list: ["meta"],
	access_list_auth: ["meta"],
	access_list_client: ["meta"],
	proxy_host: ["domain_names", "meta"],
	redirection_host: ["domain_names", "meta"],
	dead_host: ["domain_names", "meta"],
	stream: ["meta"],
};

const HEADLINE_TABLES = {
	users: "user",
	certificates: "certificate",
	accessLists: "access_list",
	proxyHosts: "proxy_host",
	redirectionHosts: "redirection_host",
	deadHosts: "dead_host",
	streams: "stream",
};

let job = { running: false, done: false, error: null, steps: [], summary: null };

const resetJob = () => {
	job = { running: false, done: false, error: null, steps: [], summary: null };
};

const step = (name) => {
	const s = { name, status: "running", log: "" };
	job.steps.push(s);
	logger.info(`[NPM-Import] ${name} ...`);
	return {
		append: (line) => {
			s.log += `${line}\n`;
		},
		ok: () => {
			s.status = "ok";
		},
		fail: (msg) => {
			s.status = "error";
			s.log += `${msg}\n`;
		},
	};
};

function openTempSqlite(localPath) {
	return knexLib({ client: "sqlite3", connection: { filename: localPath }, useNullAsDefault: true });
}

async function countHeadline(srcKnex) {
	const counts = {};
	for (const [label, table] of Object.entries(HEADLINE_TABLES)) {
		try {
			const row = await srcKnex(table).where("is_deleted", 0).count("* as c").first();
			counts[label] = Number(row?.c || 0);
		} catch (_e) {
			counts[label] = 0; // table missing on very old versions — treat as none
		}
	}
	return counts;
}

/**
 * Copy one table's rows into our own DB, remapping owner/user/access-list/
 * certificate references to their NEWLY assigned ids (the target may already
 * have its own data — we never assume an empty database).
 */
async function copyTableWithRemap(srcKnex, tableName, maps, sourceKey) {
	const rows = await srcKnex(tableName).select();
	const idMap = {};
	const jsonCols = JSON_COLUMNS[tableName] || [];
	let inserted = 0;
	let reused = 0;

	for (const row of rows) {
		const oldId = row.id;

		// Already imported from this exact source before? Reuse the mapping
		// instead of inserting a duplicate row.
		const existing = await db()("npm_import_log")
			.where({ source_key: sourceKey, table_name: tableName, source_row_id: oldId })
			.first();
		if (existing) {
			idMap[oldId] = existing.target_row_id;
			reused++;
			continue;
		}

		const newRow = { ...row };
		delete newRow.id;

		if ("owner_user_id" in newRow && maps.user[newRow.owner_user_id] !== undefined) {
			newRow.owner_user_id = maps.user[newRow.owner_user_id];
		}
		if ("user_id" in newRow && maps.user[newRow.user_id] !== undefined) {
			newRow.user_id = maps.user[newRow.user_id];
		}
		if ("access_list_id" in newRow && newRow.access_list_id && maps.access_list[newRow.access_list_id] !== undefined) {
			newRow.access_list_id = maps.access_list[newRow.access_list_id];
		}
		if ("certificate_id" in newRow && newRow.certificate_id && maps.certificate[newRow.certificate_id] !== undefined) {
			newRow.certificate_id = maps.certificate[newRow.certificate_id];
		}
		if ("upstream_id" in newRow) {
			newRow.upstream_id = null; // NexProxy-only concept — never carried over
		}
		// json/jsonb columns need an actual JSON-text STRING as the insert
		// parameter — we're going through raw knex (not an Objection model,
		// which would normally serialize this for us), so we must do it
		// ourselves. SQLite already stores/returns these as JSON text; only
		// re-stringify if some driver handed us an already-parsed object.
		for (const col of jsonCols) {
			if (newRow[col] !== null && newRow[col] !== undefined && typeof newRow[col] !== "string") {
				newRow[col] = JSON.stringify(newRow[col]);
			}
		}

		let newId;
		if (isPostgres()) {
			const ret = await db()(tableName).insert(newRow).returning("id");
			newId = typeof ret[0] === "object" ? ret[0].id : ret[0];
		} else {
			const ret = await db()(tableName).insert(newRow);
			newId = ret[0];
		}
		idMap[oldId] = newId;
		inserted++;

		await db()("npm_import_log").insert({
			source_key: sourceKey,
			table_name: tableName,
			source_row_id: oldId,
			target_row_id: newId,
			imported_on: Date.now(),
		});
	}
	return { idMap, inserted, reused, rows };
}

async function importLetsEncryptCert(target, oldCertId, newCertId) {
	const remoteLiveDir = `/etc/letsencrypt/live/npm-${oldCertId}`;
	const localLiveDir = `/etc/letsencrypt/live/npm-${newCertId}`;
	let copied = 0;
	for (const file of ["fullchain.pem", "privkey.pem", "chain.pem", "cert.pem"]) {
		const remoteFile = `${remoteLiveDir}/${file}`;
		try {
			const resolved = await sshReadlink(target, remoteFile);
			await sshDownloadFile(target, resolved || remoteFile, path.join(localLiveDir, file));
			copied++;
		} catch (_e) {
			/* this file may not exist for this cert — skip */
		}
	}
	return copied > 0;
}

async function importCustomCert(target, oldCertId, newCertId) {
	const remoteDir = `/data/custom_ssl/npm-${oldCertId}`;
	if (!(await sshRemoteExists(target, remoteDir))) return false;
	const n = await sshDownloadDir(target, remoteDir, `/data/custom_ssl/npm-${newCertId}`);
	return n > 0;
}

const internalNpmImport = {
	getJob: () => job,

	/**
	 * Connect, pull just the database (not certs), and return row counts for a
	 * before-you-commit preview. Does not write anything.
	 */
	preview: async (target) => {
		if (!(await sshTest(target))) {
			throw new Error("SSH-Verbindung fehlgeschlagen");
		}
		if (!(await sshRemoteExists(target, REMOTE_SQLITE_PATH))) {
			throw new Error(
				`Keine SQLite-Datenbank unter ${REMOTE_SQLITE_PATH} gefunden. MySQL/Postgres-Quellinstanzen werden aktuell nicht unterstützt.`,
			);
		}
		const tmp = path.join(os.tmpdir(), `npm-import-preview-${Date.now()}.sqlite`);
		await sshDownloadFile(target, REMOTE_SQLITE_PATH, tmp);
		const srcKnex = openTempSqlite(tmp);
		try {
			return await countHeadline(srcKnex);
		} finally {
			await srcKnex.destroy();
			fs.unlink(tmp, () => {});
		}
	},

	/**
	 * Full import from a live SSH-reachable NPM/NexProxy instance: database +
	 * certificates, with ids remapped so it merges safely into an
	 * already-in-use target instead of assuming an empty database.
	 */
	runFromSsh: async (target) => {
		resetJob();
		job.running = true;
		try {
			const s1 = step("SSH-Verbindung prüfen");
			if (!(await sshTest(target))) throw new Error("SSH-Verbindung fehlgeschlagen");
			s1.ok();

			const s2 = step("Datenbank herunterladen");
			const tmp = path.join(os.tmpdir(), `npm-import-${Date.now()}.sqlite`);
			await sshDownloadFile(target, REMOTE_SQLITE_PATH, tmp);
			s2.append(`Heruntergeladen nach ${tmp}`);
			s2.ok();

			const summary = await internalNpmImport.importFromSqliteFile(tmp, {
				certTarget: target,
				sourceKey: `ssh:${target.host}:${target.port || 22}`,
			});
			fs.unlink(tmp, () => {});

			job.summary = summary;
			job.done = true;
		} catch (err) {
			logger.error(`[NPM-Import] failed: ${err.message}`);
			job.error = err.message;
			const last = job.steps[job.steps.length - 1];
			if (last && last.status === "running") {
				last.status = "error";
				last.log += `${err.message}\n`;
			}
		} finally {
			job.running = false;
		}
	},

	/**
	 * Import from an uploaded .sqlite file — the "no SSH access / portable
	 * bundle" path. No certificate transfer (nothing to SSH into); the admin
	 * copies /etc/letsencrypt manually or re-issues via NexProxy afterwards.
	 */
	runFromUpload: async (localSqlitePath) => {
		resetJob();
		job.running = true;
		try {
			const hash = crypto.createHash("sha256").update(fs.readFileSync(localSqlitePath)).digest("hex").slice(0, 16);
			const summary = await internalNpmImport.importFromSqliteFile(localSqlitePath, { sourceKey: `upload:${hash}` });
			fs.unlink(localSqlitePath, () => {});
			job.summary = summary;
			job.done = true;
		} catch (err) {
			logger.error(`[NPM-Import] upload import failed: ${err.message}`);
			job.error = err.message;
			const last = job.steps[job.steps.length - 1];
			if (last && last.status === "running") {
				last.status = "error";
				last.log += `${err.message}\n`;
			}
		} finally {
			job.running = false;
		}
	},

	/**
	 * Import from an already-local sqlite file (either just downloaded via SSH,
	 * or uploaded directly by the admin — the "no SSH access" / bundle path).
	 * If `certTarget` is given, certificate files are pulled from that SSH
	 * target too; otherwise only the database is imported.
	 */
	importFromSqliteFile: async (sqlitePath, { certTarget, sourceKey } = {}) => {
		const srcKnex = openTempSqlite(sqlitePath);
		try {
			const s3 = step("Daten importieren");
			const maps = { user: {}, access_list: {}, certificate: {} };
			const newIds = { proxy_host: [], redirection_host: [], dead_host: [], stream: [] };
			const counts = {};
			let certRows = [];

			for (const table of IMPORT_TABLES) {
				let result;
				try {
					result = await copyTableWithRemap(srcKnex, table, maps, sourceKey);
				} catch (err) {
					s3.append(`${table}: übersprungen (${err.message})`);
					continue;
				}
				if (table === "user") maps.user = result.idMap;
				if (table === "access_list") maps.access_list = result.idMap;
				if (table === "certificate") {
					maps.certificate = result.idMap;
					certRows = result.rows;
				}
				if (table in newIds) newIds[table] = Object.values(result.idMap);
				counts[table] = result.inserted;
				s3.append(
					result.reused
						? `${table}: ${result.inserted} übernommen, ${result.reused} bereits importiert (übersprungen)`
						: `${table}: ${result.inserted} übernommen`,
				);
			}
			s3.ok();

			if (certTarget && certRows.length) {
				const s4 = step("Zertifikate übernehmen");
				let certsCopied = 0;
				for (const row of certRows) {
					const newId = maps.certificate[row.id];
					if (!newId) continue;
					try {
						const ok =
							row.provider === "letsencrypt"
								? await importLetsEncryptCert(certTarget, row.id, newId)
								: await importCustomCert(certTarget, row.id, newId);
						if (ok) certsCopied++;
					} catch (err) {
						s4.append(`Zertifikat ${row.id}: ${err.message}`);
					}
				}
				s4.append(`${certsCopied} von ${certRows.length} Zertifikatsdateien übernommen`);
				s4.ok();
			}

			const s5 = step("Nginx-Konfiguration erzeugen");
			// Fetch rows directly via the model rather than through the normal
			// Access-gated internal .get() helpers: this is a system-initiated bulk
			// operation with no real user token, and Access's "internal access"
			// bypass only shortcuts can() to `true` — it does NOT set
			// permission_visibility, so the row queries would still (wrongly)
			// filter by owner_user_id and find nothing.
			const fetchRow = async (model, id, expand) => {
				const query = model.query().where("is_deleted", 0).andWhere("id", id).allowGraph(model.defaultAllowGraph).first();
				if (expand) query.withGraphFetched(`[${expand.join(", ")}]`);
				const row = await query;
				if (!row) throw new Error("Not Found");
				return row;
			};

			let configured = 0;
			const regenerate = async (ids, model, hostType, expand) => {
				for (const id of ids) {
					try {
						const row = await fetchRow(model, id, expand);
						await internalNginx.configure(model, hostType, row);
						configured++;
					} catch (err) {
						s5.append(`#${id}: ${err.message}`);
					}
				}
			};
			try {
				await regenerate(newIds.proxy_host, proxyHostModel, "proxy_host", ["certificate", "access_list.[clients,items]"]);
				await regenerate(newIds.redirection_host, redirectionHostModel, "redirection_host", ["certificate"]);
				await regenerate(newIds.dead_host, deadHostModel, "dead_host", ["certificate"]);
				await regenerate(newIds.stream, streamModel, "stream", undefined);
				await internalNginx.reload();
				s5.append(`${configured} Host-Konfigurationen erzeugt, Nginx neu geladen`);
			} catch (err) {
				s5.append(`Warnung: ${err.message}`);
			}
			s5.ok();

			return counts;
		} finally {
			await srcKnex.destroy();
		}
	},
};

export default internalNpmImport;
