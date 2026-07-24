import crypto from "node:crypto";
import db from "../db.js";
import { encryptSecret } from "../lib/secret-store.js";
import { sshExec, sshTest } from "../lib/ssh.js";
import { global as logger } from "../logger.js";

const DEFAULT_IMAGE = process.env.NEXPROXY_IMAGE || "ghcr.io/bonderaustria/nexproxy:latest";
const CERT_EXPORT = "/srv/nexproxy-certs";

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
			await run(p.dbTarget, "apt-get update -qq && apt-get install -y -qq postgresql nfs-kernel-server");
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
			// NFS export for shared certificates
			await run(
				p.dbTarget,
				`mkdir -p ${CERT_EXPORT}/letsencrypt; chown -R 100000:100000 ${CERT_EXPORT}; ` +
					`grep -q "${CERT_EXPORT}" /etc/exports || echo "${CERT_EXPORT} ${p.primaryAddress}(rw,sync,no_subtree_check,no_root_squash) ${p.nodeAddress}(rw,sync,no_subtree_check,no_root_squash)" >> /etc/exports; ` +
					"exportfs -ra; systemctl enable --now nfs-kernel-server",
			);
			s2.append("NFS-Freigabe für gemeinsame Zertifikate erstellt");
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
			s4.append("Zweiter Node läuft als Backup");
			s4.ok();

			// 5) Optionally reconfigure the primary host (master) automatically
			if (p.primaryTarget) {
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
					nfsHost: p.dbAddress,
				});
				s5.append("Primär-Host neu gestartet, zeigt jetzt auf die gemeinsame DB");
				s5.ok();
			}

			job.done = true;
		} catch (err) {
			logger.error(`[HA-Provision] failed: ${err.message}`);
			job.error = err.message;
			const last = job.steps[job.steps.length - 1];
			if (last && last.status === "running") last.fail(err.message);
		} finally {
			job.running = false;
		}
	},

	/**
	 * Install docker, mount the shared cert NFS, deploy NexProxy and configure
	 * keepalived on a single host.
	 */
	setupNode: async (target, c) => {
		// Docker + NFS client
		await run(
			target,
			"apt-get update -qq && apt-get install -y -qq curl ca-certificates nfs-common keepalived; " +
				"command -v docker >/dev/null 2>&1 || { curl -fsSL https://get.docker.com | sh; }; " +
				"systemctl enable --now docker",
		);
		// Mount shared certs
		await run(
			target,
			`mkdir -p ${CERT_EXPORT}/letsencrypt; ` +
				`grep -q "${c.nfsHost}:${CERT_EXPORT}" /etc/fstab || echo "${c.nfsHost}:${CERT_EXPORT} ${CERT_EXPORT} nfs defaults 0 0" >> /etc/fstab; ` +
				`mountpoint -q ${CERT_EXPORT} || mount ${CERT_EXPORT}`,
		);
		// Deploy NexProxy
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
      - ${CERT_EXPORT}/letsencrypt:/etc/letsencrypt
      - /opt/nexproxy/data:/data
`;
		await run(
			target,
			`mkdir -p /opt/nexproxy; cat > /opt/nexproxy/docker-compose.yml <<'COMPOSE'\n${compose}COMPOSE\n` +
				"cd /opt/nexproxy && docker compose pull && docker compose up -d",
		);
		// keepalived
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
    authentication { auth_type PASS
        auth_pass ${c.authPass} }
    virtual_ipaddress { ${c.vip}/24 }
    track_script { chk_nexproxy }
}
`;
		const check = `#!/bin/sh
curl -sf -m2 -o /dev/null http://127.0.0.1:80/ || exit 1
curl -s -m2 -o /dev/null -w "%{http_code}" http://127.0.0.1:81/api/ | grep -qE "^(200|401)$" || exit 1
exit 0
`;
		await run(
			target,
			`cat > /etc/keepalived/check_nexproxy.sh <<'CHK'\n${check}CHK\nchmod +x /etc/keepalived/check_nexproxy.sh; ` +
				`cat > /etc/keepalived/keepalived.conf <<'KA'\n${keepalived}KA\n` +
				"systemctl enable keepalived; systemctl restart keepalived",
		);
	},
};

export default internalHaProvision;
