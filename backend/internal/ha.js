import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import db from "../db.js";
import { configGet } from "../lib/config.js";
import { global as logger } from "../logger.js";
import pjson from "../package.json" with { type: "json" };

const HEARTBEAT_INTERVAL = 10 * 1000; // 10s
const ONLINE_WINDOW = 30 * 1000; // a node is "online" if seen within 30s

// Whether THIS node currently holds the floating IP. Updated by keepalived via
// the notify script hitting /api/ha/vip-notify.
let localHasVip = false;

/**
 * This node's identity. Set NODE_NAME (and optionally NODE_ADDRESS / HA_ROLE)
 * per node via the compose environment. Without NODE_NAME the instance is a
 * standalone node named after its hostname.
 */
// Stable node id persisted in /data so container restarts reuse the same row
// instead of registering a new one under a random container hostname.
const NODE_ID_FILE = `${process.env.NODE_ID_DIR || "/data"}/.nexproxy-node-id`;
const stableId = () => {
	try {
		if (fs.existsSync(NODE_ID_FILE)) {
			return fs.readFileSync(NODE_ID_FILE, "utf8").trim();
		}
		const id = `node-${crypto.randomBytes(4).toString("hex")}`;
		fs.writeFileSync(NODE_ID_FILE, id);
		return id;
	} catch (_e) {
		return os.hostname();
	}
};

const selfName = () => process.env.NODE_NAME || stableId();

const selfAddress = () => {
	if (process.env.NODE_ADDRESS) {
		return process.env.NODE_ADDRESS;
	}
	const nets = os.networkInterfaces();
	for (const name of Object.keys(nets)) {
		for (const net of nets[name] || []) {
			if (net.family === "IPv4" && !net.internal) {
				return net.address;
			}
		}
	}
	return "";
};

const selfRole = () => process.env.HA_ROLE || "standalone";

const internalHa = {
	/**
	 * Upsert this node's heartbeat row. Preserves the stored role on update so a
	 * role change (e.g. via env) only applies on first registration.
	 */
	heartbeat: async () => {
		try {
			const now = Date.now();
			await db()("ha_node")
				.insert({
					name: selfName(),
					address: selfAddress(),
					role: selfRole(),
					version: pjson.version,
					last_seen: now,
					has_vip: localHasVip ? 1 : 0,
				})
				.onConflict("name")
				.merge({
					address: selfAddress(),
					role: selfRole(),
					version: pjson.version,
					last_seen: now,
					has_vip: localHasVip ? 1 : 0,
				});
			// Prune dead nodes (replaced/removed containers offline for over an hour).
			await db()("ha_node")
				.where("last_seen", "<", now - 60 * 60 * 1000)
				.del();
		} catch (err) {
			logger.error(`[HA] heartbeat failed: ${err.message}`);
		}
	},

	startHeartbeat: () => {
		internalHa.heartbeat();
		setInterval(internalHa.heartbeat, HEARTBEAT_INTERVAL);
		logger.info(`[HA] Heartbeat started for node "${selfName()}"`);
	},

	/**
	 * Called by keepalived (via /api/ha/vip-notify) when this node enters
	 * MASTER/BACKUP/FAULT state, so the cluster status shows the real VIP holder.
	 */
	setVipState: (isMaster) => {
		localHasVip = !!isMaster;
		// push immediately so the UI reflects the change without waiting a full interval
		internalHa.heartbeat();
	},

	/**
	 * Cluster status: all known nodes with computed online state, plus the node
	 * currently expected to hold the floating IP, and defaults to pre-fill the
	 * "add node" wizard.
	 */
	getStatus: async () => {
		const rows = await db()("ha_node").select();
		const now = Date.now();

		const nodes = rows.map((n) => ({
			name: n.name,
			address: n.address,
			role: n.role,
			version: n.version,
			lastSeen: Number(n.last_seen),
			hasVip: !!n.has_vip,
			online: now - Number(n.last_seen) < ONLINE_WINDOW,
			isSelf: n.name === selfName(),
		}));

		const online = nodes.filter((n) => n.online);
		// Real VIP holder as reported by keepalived; fall back to a heuristic
		// (online master, else online backup) only if nothing has been reported yet.
		const activeNode =
			online.find((n) => n.hasVip)?.name ||
			online.find((n) => n.role === "master")?.name ||
			online.find((n) => n.role === "backup")?.name ||
			online[0]?.name ||
			null;

		let dbCfg = {};
		try {
			dbCfg = configGet("database") || {};
		} catch (_e) {
			dbCfg = {};
		}

		return {
			enabled: nodes.length > 1 || selfRole() !== "standalone",
			vip: process.env.HA_VIP || null,
			activeNode,
			self: selfName(),
			nodes,
			defaults: {
				dbHost: dbCfg.host || "",
				dbPort: dbCfg.port || 5432,
				dbName: dbCfg.name || "npm",
				dbUser: dbCfg.user || "npm",
				vip: process.env.HA_VIP || "",
			},
		};
	},

	/**
	 * Produce the ready-to-use config for adding a second node: a docker-compose
	 * file (pointing at the shared database + cert volume) and a keepalived
	 * config plus health-check script for the floating-IP failover.
	 */
	generateConfig: (p = {}) => {
		// The API client decamelizes request bodies, so keys arrive as snake_case.
		const nodeName = p.node_name || "nexproxy-b";
		const role = p.role === "master" ? "MASTER" : "BACKUP";
		const priority = p.priority || (role === "MASTER" ? 150 : 100);
		const iface = p.iface || "eth0";
		const vip = p.vip || "192.168.0.100";
		const vrid = p.vrid || 51;
		const authPass = p.auth_pass || "changeMe16chars";
		const dbHost = p.db_host || "";
		const dbPort = p.db_port || 5432;
		const dbName = p.db_name || "npm";
		const dbUser = p.db_user || "npm";
		const dbPassword = p.db_password || "<DB-PASSWORT>";
		const image = p.image || "ghcr.io/bonderaustria/nexproxy:latest";

		const compose = `services:
  app:
    image: ${image}
    restart: unless-stopped
    environment:
      NODE_NAME: "${nodeName}"
      HA_ROLE: "${role.toLowerCase()}"
      HA_VIP: "${vip}"
      DB_POSTGRES_HOST: "${dbHost}"
      DB_POSTGRES_PORT: "${dbPort}"
      DB_POSTGRES_USER: "${dbUser}"
      DB_POSTGRES_PASSWORD: "${dbPassword}"
      DB_POSTGRES_NAME: "${dbName}"
    ports:
      - "80:80"
      - "81:81"
      - "443:443"
    volumes:
      - /srv/nexproxy-shared/letsencrypt:/etc/letsencrypt
      - ./data:/data
`;

		const checkScript = `#!/bin/sh
# Health-Check: prueft ob NexProxy wirklich ausliefert (nicht nur laeuft)
curl -sf -m2 -o /dev/null http://127.0.0.1:80/ || exit 1
curl -s -m2 -o /dev/null -w "%{http_code}" http://127.0.0.1:81/api/ | grep -qE "^(200|401)$" || exit 1
exit 0
`;

		const keepalived = `vrrp_script chk_nexproxy {
    script "/etc/keepalived/check_nexproxy.sh"
    interval 2
    fall 2
    rise 2
    weight -60
}

vrrp_instance NEXPROXY_VIP {
    state ${role}
    interface ${iface}
    virtual_router_id ${vrid}
    priority ${priority}
    advert_int 1
    authentication {
        auth_type PASS
        auth_pass ${authPass}
    }
    virtual_ipaddress {
        ${vip}/24
    }
    track_script {
        chk_nexproxy
    }
}
`;

		return { compose, keepalived, checkScript };
	},
};

export default internalHa;
