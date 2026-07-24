import crypto from "node:crypto";
import fs from "node:fs";
import db from "../db.js";
import { configGet } from "../lib/config.js";
import { encryptSecret } from "../lib/secret-store.js";
import { sshExec, sshTest } from "../lib/ssh.js";
import { global as logger } from "../logger.js";
import { copySqliteToPostgres } from "./db-migrate-data.js";

const DEFAULT_IMAGE = process.env.NEXPROXY_IMAGE || "ghcr.io/bonderaustria/nexproxy:latest";
const CERT_EXPORT = "/srv/nexproxy-certs";

/**
 * The host-side keepalived health-check script — pure health probe only. VIP
 * ground truth must NOT be written here: this script only runs while
 * keepalived is running, but Force Failover deliberately STOPS keepalived on
 * a node, which would freeze any state written here at its last value
 * forever (exactly the bug where a stopped node keeps reporting "master").
 * See buildVipWatchUnit for the independent watcher that fixes this.
 */
export const buildCheckScript = () => `#!/bin/sh
curl -sf -m2 -o /dev/null http://127.0.0.1:80/ || exit 1
curl -s -m2 -o /dev/null -w "%{http_code}" http://127.0.0.1:81/api/ | grep -qE "^(200|401)$" || exit 1
exit 0
`;

/**
 * VIP ground-truth watcher: a systemd service, INDEPENDENT of keepalived, that
 * checks `ip addr` every 2s and writes the result into the shared /data
 * volume. Runs regardless of whether keepalived is up, stopped, or crashed —
 * so a node that was deliberately failed over correctly reports "backup"
 * instead of freezing at its last state.
 */
export const buildVipWatchUnit = (vip, iface) => `[Unit]
Description=NexProxy VIP ground-truth watcher (independent of keepalived)
After=network.target

[Service]
Type=simple
Restart=always
RestartSec=2
ExecStart=/bin/sh -c 'while true; do if ip addr show ${iface} 2>/dev/null | grep -q "${vip}"; then echo master > /opt/nexproxy/data/.ha-vip-state; else echo backup > /opt/nexproxy/data/.ha-vip-state; fi; sleep 2; done'

[Install]
WantedBy=multi-user.target
`;

// Singleton job state the GUI polls via GET /api/ha/provision-status
let job = { running: false, done: false, error: null, steps: [] };

const resetJob = () => {
	job = { running: false, done: false, error: null, steps: [] };
};

const step = (name) => {
	const s = { name, status: "running", log: "" };
	job.steps.push(s);
	logger.info(`[HA-Provision] ${name} ...`);
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

const genPassword = () => crypto.randomBytes(18).toString("base64").replace(/[^a-zA-Z0-9]/g, "").slice(0, 20);

const run = async (target, cmd) => {
	const res = await sshExec(target, `export PATH=/usr/sbin:/usr/bin:/sbin:/bin DEBIAN_FRONTEND=noninteractive; ${cmd}`);
	if (res.code !== 0) {
		throw new Error(`command failed (${res.code}): ${res.output.slice(-500)}`);
	}
	return res.output;
};

const internalHaProvision = {
	getJob: () => job,

	/**
	 * Persist (encrypted) SSH access for a node so the cluster can later perform
	 * one-click rolling updates and force-failover.
	 */
	saveNodeSsh: async (nodeName, target, address) => {
		if (!target) return;
		const row = {
			node_name: nodeName,
			host: address || target.host,
			port: target.port || 22,
			username: target.username || "root",
			password_enc: encryptSecret(target.password || ""),
			private_key_enc: encryptSecret(target.privateKey || ""),
		};
		await db()("ha_node_ssh").insert(row).onConflict("node_name").merge(row);
	},

	/**
	 * Full auto-provision: set up PostgreSQL + shared cert NFS on the DB host,
	 * deploy a backup NexProxy node, and configure keepalived on both.
	 *
	 * @param {Object} p
	 * @param {Object} p.dbTarget    - SSH target for the database host
	 * @param {Object} p.nodeTarget  - SSH target for the second node host
	 * @param {Object} [p.primaryTarget] - optional SSH target for the primary host
	 * @param {string} p.dbAddress   - IP of the DB host (for clients)
	 * @param {string} p.primaryAddress - IP of the primary node
	 * @param {string} p.nodeAddress - IP of the second node
	 * @param {string} p.vip         - floating IP
	 * @param {string} [p.iface]     - network interface (default eth0)
	 * @param {number} [p.vrid]      - VRRP router id (default 51)
	 */
	provision: async (p) => {
		resetJob();
		job.running = true;
		const iface = p.iface || "eth0";
		const vrid = p.vrid || 51;
		const authPass = genPassword().slice(0, 12);
		const dbPassword = genPassword();
		// Encrypt everything in this run with the SHARED database password key so
		// every cluster node can decrypt it later (see lib/secret-store.js).
		process.env.DB_POSTGRES_PASSWORD = dbPassword;
		const dbName = p.dbName || "npm";
		const dbUser = p.dbUser || "npm";
		const image = p.image || DEFAULT_IMAGE;

		try {
			// 1) Connectivity
			const s1 = step("SSH-Verbindungen prüfen");
			if (!(await sshTest(p.dbTarget))) throw new Error("SSH zum DB-Host fehlgeschlagen");
			s1.append("DB-Host erreichbar");
			if (!(await sshTest(p.nodeTarget))) throw new Error("SSH zum zweiten Node fehlgeschlagen");
			s1.append("Zweiter Node erreichbar");
			if (p.primaryTarget) {
				if (!(await sshTest(p.primaryTarget))) throw new Error("SSH zum Primär-Host fehlgeschlagen");
				s1.append("Primär-Host erreichbar");
			}
			s1.ok();

			// 2) PostgreSQL + NFS on the DB host
			const s2 = step("Datenbank (PostgreSQL) einrichten");
			await run(p.dbTarget, "apt-get update -qq && apt-get install -y -qq postgresql");
			const pgver = (await run(p.dbTarget, "ls /etc/postgresql/")).trim().split(/\s+/)[0];
			s2.append(`PostgreSQL ${pgver} installiert`);
			await run(
				p.dbTarget,
				`CONF=/etc/postgresql/${pgver}/main; sed -i "s/^#\\?listen_addresses.*/listen_addresses = '*'/" $CONF/postgresql.conf; ` +
					`grep -q nexproxy-ha $CONF/pg_hba.conf || { echo "# nexproxy-ha" >> $CONF/pg_hba.conf; ` +
					`echo "host ${dbName} ${dbUser} ${p.primaryAddress}/32 scram-sha-256" >> $CONF/pg_hba.conf; ` +
					`echo "host ${dbName} ${dbUser} ${p.nodeAddress}/32 scram-sha-256" >> $CONF/pg_hba.conf; }; ` +
					"systemctl restart postgresql",
			);
			await run(
				p.dbTarget,
				`runuser -u postgres -- psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${dbUser}'" | grep -q 1 || ` +
					`runuser -u postgres -- psql -c "CREATE USER ${dbUser} WITH PASSWORD '${dbPassword}';"; ` +
					`runuser -u postgres -- psql -tc "SELECT 1 FROM pg_database WHERE datname='${dbName}'" | grep -q 1 || ` +
					`runuser -u postgres -- psql -c "CREATE DATABASE ${dbName} OWNER ${dbUser};"`,
			);
			// Ensure password matches (in case user existed)
			await run(p.dbTarget, `runuser -u postgres -- psql -c "ALTER USER ${dbUser} WITH PASSWORD '${dbPassword}';"`);
			s2.append(`Datenbank "${dbName}" und Benutzer "${dbUser}" angelegt`);
			s2.ok();

			// 3) Persist DB config (password encrypted)
			const s3 = step("Zugangsdaten speichern");
			await db()("ha_config")
				.where({ id: 1 })
				.update({
					db_host: p.dbAddress,
					db_port: 5432,
					db_name: dbName,
					db_user: dbUser,
					db_password_enc: encryptSecret(dbPassword),
					vip: p.vip,
					iface,
					provisioned: 1,
					modified_on: Date.now(),
				});
			s3.append("DB-Zugangsdaten verschlüsselt gespeichert");
			s3.ok();

			// 4) Provision the second node (backup)
			const s4 = step("Zweiten Node aufsetzen (Docker + NexProxy + keepalived)");
			await internalHaProvision.setupNode(p.nodeTarget, {
				nodeName: "nexproxy-b",
				role: "backup",
				priority: 100,
				address: p.nodeAddress,
				dbHost: p.dbAddress,
				dbUser,
				dbPassword,
				dbName,
				vip: p.vip,
				iface,
				vrid,
				authPass,
				image,
				nfsHost: p.dbAddress,
			});
			await internalHaProvision.saveNodeSsh("nexproxy-b", p.nodeTarget, p.nodeAddress);
			s4.append("Zweiter Node läuft als Backup");
			s4.ok();

			if (p.primaryTarget) {
				// 4b) Carry the ENTIRE existing configuration into PostgreSQL so
				//     nothing is lost (the "add HA after years" case).
				const s4b = step("Bestehende Konfiguration in die gemeinsame DB übernehmen");
				await internalHaProvision.waitForApi(`http://${p.nodeAddress}:81/api/`, 120000);
				s4b.append("Schema auf der neuen Datenbank bereit");
				try {
					const dbCfg = configGet("database");
					const sqliteFile = dbCfg?.knex?.connection?.filename;
					if (sqliteFile && fs.existsSync(sqliteFile)) {
						// Temporarily elevate npm so the copy can disable FK triggers
						// (SET session_replication_role is superuser-only), then revoke.
						await run(p.dbTarget, `runuser -u postgres -- psql -c "ALTER USER ${dbUser} WITH SUPERUSER"`);
						try {
							const copied = await copySqliteToPostgres({
								sqliteFile,
								pg: { host: p.dbAddress, port: 5432, user: dbUser, password: dbPassword, database: dbName },
							});
							s4b.append(`Übernommen: ${copied.join(", ") || "keine Daten"}`);
						} finally {
							await run(
								p.dbTarget,
								`runuser -u postgres -- psql -c "ALTER USER ${dbUser} WITH NOSUPERUSER"`,
							).catch(() => {});
						}
					} else {
						s4b.append("Primär läuft nicht auf SQLite — kein Datenimport nötig.");
					}
				} catch (e) {
					throw new Error(`Datenübernahme fehlgeschlagen: ${e.message}`);
				}
				s4b.ok();

				// 5) Reconfigure the primary as master — DETACHED so the container
				//    restart doesn't kill this orchestrator mid-way.
				const s5 = step("Primär-Host als Master konfigurieren");
				await internalHaProvision.setupNode(p.primaryTarget, {
					nodeName: "nexproxy-a",
					role: "master",
					priority: 150,
					address: p.primaryAddress,
					dbHost: p.dbAddress,
					dbUser,
					dbPassword,
					dbName,
					vip: p.vip,
					iface,
					vrid,
					authPass,
					image,
					detach: true,
				});
				await internalHaProvision.saveNodeSsh("nexproxy-a", p.primaryTarget, p.primaryAddress);
				s5.append("Umstellung auf gemeinsame DB + Master-keepalived eingeplant (läuft entkoppelt zu Ende).");
				s5.ok();
			}

			job.done = true;
		} catch (err) {
			logger.error(`[HA-Provision] failed: ${err.message}`);
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
	 * Wait until a NexProxy API answers (used to know the second node finished
	 * running the DB migrations before we copy data into it).
	 */
	waitForApi: async (url, timeoutMs) => {
		const start = Date.now();
		while (Date.now() - start < timeoutMs) {
			try {
				const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
				if (res.ok || res.status === 401) return true;
			} catch (_e) {
				/* not ready yet */
			}
			await new Promise((r) => setTimeout(r, 3000));
		}
		throw new Error("Zeitüberschreitung: zweite Node nicht erreichbar");
	},

	/**
	 * Install docker + keepalived, deploy NexProxy and configure keepalived on a
	 * single host. All state-writing steps are file-only until the final apply.
	 *
	 * When `c.detach` is true the apply (which restarts the container running the
	 * orchestrator) is handed to systemd-run so it survives the restart — this is
	 * essential for the primary reconfiguring itself.
	 */
	setupNode: async (target, c) => {
		// 1) Docker + keepalived (safe: does not touch the running container)
		await run(
			target,
			"apt-get update -qq && apt-get install -y -qq curl ca-certificates keepalived; " +
				"command -v docker >/dev/null 2>&1 || { curl -fsSL https://get.docker.com | sh; }; " +
				"systemctl enable --now docker",
		);
		// 2) Registry login for private images (token provided via env on the primary)
		const regUser = process.env.NEXPROXY_REGISTRY_USER;
		const regToken = process.env.NEXPROXY_REGISTRY_TOKEN;
		if (c.image.startsWith("ghcr.io") && regToken) {
			await run(target, `echo '${regToken}' | docker login ghcr.io -u ${regUser || "x"} --password-stdin`);
		}

		// 3) Write all config files (no restart yet)
		const compose = `services:
  app:
    image: ${c.image}
    restart: unless-stopped
    environment:
      NODE_NAME: "${c.nodeName}"
      HA_ROLE: "${c.role}"
      HA_VIP: "${c.vip}"
      NODE_ADDRESS: "${c.address}"
      DB_POSTGRES_HOST: "${c.dbHost}"
      DB_POSTGRES_PORT: "5432"
      DB_POSTGRES_USER: "${c.dbUser}"
      DB_POSTGRES_PASSWORD: "${c.dbPassword}"
      DB_POSTGRES_NAME: "${c.dbName}"
    ports:
      - "80:80"
      - "81:81"
      - "443:443"
    volumes:
      - ./letsencrypt:/etc/letsencrypt
      - ./data:/data
`;
		const check = buildCheckScript();
		const vipWatchUnit = buildVipWatchUnit(c.vip, c.iface);
		// keepalived notify -> tells NexProxy which node really holds the VIP
		const notify = `#!/bin/sh
curl -s -m2 "http://127.0.0.1:81/api/ha/vip-notify?state=$1" >/dev/null 2>&1 || true
`;
		const keepalived = `vrrp_script chk_nexproxy {
    script "/etc/keepalived/check_nexproxy.sh"
    interval 2
    fall 2
    rise 2
    weight -60
}
vrrp_instance NEXPROXY_VIP {
    state ${c.role === "master" ? "MASTER" : "BACKUP"}
    interface ${c.iface}
    virtual_router_id ${c.vrid}
    priority ${c.priority}
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass ${c.authPass}
    }
    virtual_ipaddress {
        ${c.vip}/24
    }
    track_script {
        chk_nexproxy
    }
    notify_master "/etc/keepalived/nexproxy-notify.sh master"
    notify_backup "/etc/keepalived/nexproxy-notify.sh backup"
    notify_fault "/etc/keepalived/nexproxy-notify.sh fault"
}
`;
		await run(
			target,
			`mkdir -p /opt/nexproxy; cat > /opt/nexproxy/docker-compose.yml <<'COMPOSE'\n${compose}COMPOSE\n` +
				`cat > /etc/keepalived/check_nexproxy.sh <<'CHK'\n${check}CHK\nchmod +x /etc/keepalived/check_nexproxy.sh; ` +
				`cat > /etc/keepalived/nexproxy-notify.sh <<'NOTE'\n${notify}NOTE\nchmod +x /etc/keepalived/nexproxy-notify.sh; ` +
				`cat > /etc/keepalived/keepalived.conf <<'KA'\n${keepalived}KA\nsystemctl enable keepalived; ` +
				`cat > /etc/systemd/system/nexproxy-vip-watch.service <<'UNIT'\n${vipWatchUnit}UNIT\n` +
				"systemctl daemon-reload && systemctl enable --now nexproxy-vip-watch",
		);

		// 4) Apply: start container + (re)start keepalived
		const applyCmd =
			"cd /opt/nexproxy && docker compose pull && docker compose up -d && systemctl restart keepalived";
		if (c.detach) {
			// Detached so it survives restarting the container the orchestrator runs in.
			await run(
				target,
				`systemd-run --collect --unit=nexproxy-ha-apply-$(date +%s) /bin/sh -c 'sleep 3; ${applyCmd}'`,
			);
		} else {
			await run(target, applyCmd);
		}
	},
};

export default internalHaProvision;
