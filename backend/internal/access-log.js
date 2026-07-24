import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import db from "../db.js";
import { global as logger } from "../logger.js";

const LOG_DIR = "/data/logs";
const INGEST_INTERVAL = 4 * 1000;
const PRUNE_INTERVAL = 60 * 60 * 1000;
const INSERT_CHUNK = 200;

// Matches the "proxy" nginx log format (see docker/rootfs .../log-proxy.conf):
// [time] cache upstream_status status - method scheme host "uri" [Client ip] ...
const LINE_RE = /^\[[^\]]+\]\s+\S+\s+\S+\s+(\d{3})\s+-\s+(\S+)\s+\S+\s+(\S+)\s+"([^"]*)"\s+\[Client\s+([^\]\s]+)/;

const nodeName = () => process.env.NODE_NAME || os.hostname();

const offsets = new Map();
const subscribers = new Set();

const parseLine = (line) => {
	const m = LINE_RE.exec(line);
	if (!m) return null;
	return {
		status: Number.parseInt(m[1], 10),
		method: m[2],
		host: m[3],
		path: m[4],
		ip: m[5],
	};
};

const internalAccessLog = {
	/**
	 * Read new lines from every proxy-host access log and store them.
	 */
	ingest: async () => {
		try {
			if (!fs.existsSync(LOG_DIR)) return;
			const files = fs
				.readdirSync(LOG_DIR)
				.filter((f) => /^(proxy-host|redirection-host|dead-host)-\d+_access\.log$/.test(f))
				.map((f) => path.join(LOG_DIR, f));

			const entries = [];
			const now = Date.now();
			const node = nodeName();

			for (const file of files) {
				let stat;
				try {
					stat = fs.statSync(file);
				} catch (_e) {
					continue;
				}
				let offset = offsets.has(file) ? offsets.get(file) : stat.size; // skip existing history on first sight
				if (stat.size < offset) offset = 0; // rotated / truncated
				if (stat.size <= offset) {
					offsets.set(file, stat.size);
					continue;
				}
				const fd = fs.openSync(file, "r");
				const buf = Buffer.alloc(stat.size - offset);
				fs.readSync(fd, buf, 0, buf.length, offset);
				fs.closeSync(fd);
				offsets.set(file, stat.size);

				for (const line of buf.toString("utf8").split("\n")) {
					if (!line.trim()) continue;
					const parsed = parseLine(line);
					if (parsed) entries.push({ node_name: node, ts: now, ...parsed });
				}
			}

			if (!entries.length) return;
			for (let i = 0; i < entries.length; i += INSERT_CHUNK) {
				await db()("access_log").insert(entries.slice(i, i + INSERT_CHUNK));
			}
			// push to live subscribers
			if (subscribers.size) {
				for (const entry of entries) {
					const payload = `data: ${JSON.stringify(entry)}\n\n`;
					for (const res of subscribers) {
						try {
							res.write(payload);
						} catch (_e) {
							subscribers.delete(res);
						}
					}
				}
			}
		} catch (err) {
			logger.error(`[AccessLog] ingest failed: ${err.message}`);
		}
	},

	prune: async () => {
		try {
			const cfg = await db()("access_log_config").where({ id: 1 }).first();
			const days = cfg?.retention_days || 30;
			await db()("access_log")
				.where("ts", "<", Date.now() - days * 24 * 60 * 60 * 1000)
				.del();
		} catch (err) {
			logger.error(`[AccessLog] prune failed: ${err.message}`);
		}
	},

	initTimer: () => {
		setInterval(internalAccessLog.ingest, INGEST_INTERVAL);
		setInterval(internalAccessLog.prune, PRUNE_INTERVAL);
		logger.info("[AccessLog] Ingestion started");
	},

	subscribe: (res) => {
		subscribers.add(res);
	},
	unsubscribe: (res) => {
		subscribers.delete(res);
	},

	/**
	 * Query stored entries with filters + pagination.
	 * @param {Object} f - { host, status, search, hours, limit, offset }
	 */
	query: async (f = {}) => {
		const base = db()("access_log");
		const applyFilters = (q) => {
			if (f.host) q.where("host", f.host);
			if (f.status === "error") q.where("status", ">=", 400);
			else if (f.status === "ok") q.where("status", "<", 400);
			else if (f.status) q.where("status", Number.parseInt(f.status, 10));
			if (f.hours) q.where("ts", ">=", Date.now() - Number(f.hours) * 60 * 60 * 1000);
			if (f.search) {
				const s = `%${f.search}%`;
				q.where((sub) => sub.whereILike("ip", s).orWhereILike("host", s).orWhereILike("path", s));
			}
			return q;
		};

		const limit = Math.min(Number(f.limit) || 50, 200);
		const offset = Number(f.offset) || 0;

		const rawRows = await applyFilters(base.clone())
			.select("id", "node_name", "ts", "ip", "method", "host", "path", "status")
			.orderBy("ts", "desc")
			.orderBy("id", "desc")
			.limit(limit)
			.offset(offset);

		// pg returns BIGINT columns (id, ts) as strings to avoid precision loss —
		// convert them back to numbers for the frontend (new Date(ts) needs a number).
		const rows = rawRows.map((r) => ({ ...r, id: Number(r.id), ts: Number(r.ts) }));

		const totalRow = await applyFilters(base.clone()).count("* as c").first();

		return { rows, total: Number(totalRow?.c || 0), limit, offset };
	},

	/**
	 * Dashboard-style stats over the last 24h.
	 */
	stats: async () => {
		const since = Date.now() - 24 * 60 * 60 * 1000;
		const w = () => db()("access_log").where("ts", ">=", since);
		const [total, unique, errors, blocked] = await Promise.all([
			w().count("* as c").first(),
			w().countDistinct("ip as c").first(),
			w().where("status", ">=", 400).count("* as c").first(),
			w().where("status", 403).count("* as c").first(),
		]);
		return {
			requests24h: Number(total?.c || 0),
			uniqueIps: Number(unique?.c || 0),
			errors: Number(errors?.c || 0),
			blocked: Number(blocked?.c || 0),
		};
	},

	getRetention: async () => {
		const cfg = await db()("access_log_config").where({ id: 1 }).first();
		return cfg?.retention_days || 30;
	},
	setRetention: async (days) => {
		const d = Math.max(1, Math.min(3650, Number(days) || 30));
		await db()("access_log_config").where({ id: 1 }).update({ retention_days: d });
		return d;
	},
};

export default internalAccessLog;
