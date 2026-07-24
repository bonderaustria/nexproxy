import db from "../db.js";
import { decryptSecret } from "../lib/secret-store.js";
import { sshExec } from "../lib/ssh.js";
import { global as logger } from "../logger.js";
import internalHa from "./ha.js";

const IMAGE = process.env.NEXPROXY_IMAGE || "ghcr.io/bonderaustria/nexproxy:latest";

async function getNodeSsh(nodeName) {
	const row = await db()("ha_node_ssh").where({ node_name: nodeName }).first();
	if (!row) {
		throw new Error(`Keine SSH-Zugangsdaten für Node "${nodeName}" gespeichert`);
	}
	const password = decryptSecret(row.password_enc);
	const privateKey = decryptSecret(row.private_key_enc);
	return {
		host: row.host,
		port: row.port || 22,
		username: row.username || "root",
		password: password || undefined,
		privateKey: privateKey || undefined,
	};
}

const run = (target, cmd) => sshExec(target, `export PATH=/usr/sbin:/usr/bin:/sbin:/bin; ${cmd}`);

const cmpSemver = (a, b) => {
	const pa = String(a).split(".").map(Number);
	const pb = String(b).split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
	}
	return 0;
};

let versionCache = { value: null, ts: 0 };

/**
 * Query the container registry for the newest available version tag (the one a
 * node would receive on "Update"). Cached for 5 minutes.
 */
async function getLatestVersion() {
	if (versionCache.value && Date.now() - versionCache.ts < 5 * 60 * 1000) {
		return versionCache.value;
	}
	try {
		const user = process.env.NEXPROXY_REGISTRY_USER || "";
		const token = process.env.NEXPROXY_REGISTRY_TOKEN || "";
		const repo = IMAGE.split("/").slice(1).join("/").split(":")[0]; // e.g. bonderaustria/nexproxy
		const auth = Buffer.from(`${user}:${token}`).toString("base64");
		const tokRes = await fetch(`https://ghcr.io/token?scope=repository:${repo}:pull`, {
			headers: token ? { Authorization: `Basic ${auth}` } : {},
			signal: AbortSignal.timeout(6000),
		});
		const bearer = (await tokRes.json()).token;
		const tagsRes = await fetch(`https://ghcr.io/v2/${repo}/tags/list`, {
			headers: { Authorization: `Bearer ${bearer}` },
			signal: AbortSignal.timeout(6000),
		});
		const tags = (await tagsRes.json()).tags || [];
		const semvers = tags.filter((t) => /^\d+\.\d+\.\d+$/.test(t)).sort(cmpSemver);
		versionCache = { value: semvers[semvers.length - 1] || null, ts: Date.now() };
	} catch (err) {
		logger.error(`[HA-Update] latest-version check failed: ${err.message}`);
	}
	return versionCache.value;
}

const internalHaUpdate = {
	getLatestVersion,

	/**
	 * Pull the latest image and restart a node's container + keepalived. Runs
	 * detached so it survives restarting the very node it targets. The active
	 * (VIP-holding) node cannot be updated directly — force a failover first.
	 */
	updateNode: async (nodeName) => {
		const status = await internalHa.getStatus();
		if (nodeName === status.activeNode) {
			throw new Error(
				"Dieser Node ist aktiv (hält die VIP). Mach zuerst „Force Failover“ und update ihn dann.",
			);
		}
		const target = await getNodeSsh(nodeName);

		const regUser = process.env.NEXPROXY_REGISTRY_USER;
		const regToken = process.env.NEXPROXY_REGISTRY_TOKEN;
		const loginCmd =
			IMAGE.startsWith("ghcr.io") && regToken
				? `echo '${regToken}' | docker login ghcr.io -u ${regUser || "x"} --password-stdin >/dev/null 2>&1; `
				: "";
		const applyCmd = `${loginCmd}cd /opt/nexproxy && docker compose pull && docker compose up -d && systemctl restart keepalived`;

		await run(target, `systemd-run --collect --unit=nexproxy-update-$(date +%s) /bin/sh -c 'sleep 2; ${applyCmd}'`);
		logger.info(`[HA-Update] Update scheduled on ${nodeName}`);
		return { started: true, node: nodeName };
	},

	/**
	 * Move the floating IP away from the currently active node by stopping its
	 * keepalived. The standby takes over; the stopped node rejoins on its next
	 * update (which restarts keepalived and — being the master — reclaims the VIP).
	 */
	forceFailover: async () => {
		const status = await internalHa.getStatus();
		if (!status.activeNode) {
			throw new Error("Kein aktiver Node gefunden");
		}
		const target = await getNodeSsh(status.activeNode);
		await run(target, "systemctl stop keepalived");
		logger.info(`[HA-Update] Force failover: stopped keepalived on ${status.activeNode}`);
		return { failedOverFrom: status.activeNode };
	},
};

export default internalHaUpdate;
