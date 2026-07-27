import db from "../db.js";
import { decryptSecret } from "../lib/secret-store.js";
import { sshExec } from "../lib/ssh.js";
import { global as logger } from "../logger.js";
import { buildCheckScript, buildVipWatchUnit } from "./ha-provision.js";
import internalHa from "./ha.js";

const IMAGE = process.env.NEXPROXY_IMAGE || "ghcr.io/bonderaustria/nexproxy:latest";
const FAILOVER_HOLD_MS = 60 * 1000; // grace window for "Update" before auto-reclaim
const REAPER_INTERVAL = 5 * 1000;

async function getHaConfig() {
	const row = await db()("ha_config").where({ id: 1 }).first();
	return { vip: row?.vip || "", iface: row?.iface || "eth0" };
}

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
	 * Tail the remote update log for a node so the GUI can show live progress
	 * of the "Update" action (which runs detached on the node itself).
	 */
	getUpdateLog: async (nodeName) => {
		const target = await getNodeSsh(nodeName);
		try {
			const out = await run(target, "tail -n 200 /opt/nexproxy/update.log 2>/dev/null || echo '(noch kein Update-Log)'");
			return { log: out };
		} catch (err) {
			return { log: `(Log konnte nicht gelesen werden: ${err.message})` };
		}
	},

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

		// Redeploy the health-check script + the independent VIP watcher so older
		// nodes pick up the current detection logic on every update, without
		// needing a full re-provision. The watcher runs regardless of keepalived's
		// own state — it's what fixes a stopped node freezing at a stale "master".
		try {
			const { vip, iface } = await getHaConfig();
			if (vip) {
				const check = buildCheckScript();
				const watchUnit = buildVipWatchUnit(vip, iface);
				await run(
					target,
					`cat > /etc/keepalived/check_nexproxy.sh <<'CHK'\n${check}CHK\nchmod +x /etc/keepalived/check_nexproxy.sh; ` +
						`cat > /etc/systemd/system/nexproxy-vip-watch.service <<'UNIT'\n${watchUnit}UNIT\n` +
						"systemctl daemon-reload && systemctl enable --now nexproxy-vip-watch && systemctl restart nexproxy-vip-watch",
				);
			}
		} catch (err) {
			logger.error(`[HA-Update] Could not redeploy check script/watcher on ${nodeName}: ${err.message}`);
		}

		const regUser = process.env.NEXPROXY_REGISTRY_USER;
		const regToken = process.env.NEXPROXY_REGISTRY_TOKEN;
		const loginCmd =
			IMAGE.startsWith("ghcr.io") && regToken
				? `echo '${regToken}' | docker login ghcr.io -u ${regUser || "x"} --password-stdin >/dev/null 2>&1; `
				: "";
		const applyCmd = `${loginCmd}cd /opt/nexproxy && docker compose pull && docker compose up -d && systemctl restart keepalived`;
		const logged = `{ ${applyCmd} ; } > /opt/nexproxy/update.log 2>&1`;

		await run(target, `echo "--- Update gestartet $(date -Iseconds) ---" > /opt/nexproxy/update.log; systemd-run --collect --unit=nexproxy-update-$(date +%s) /bin/sh -c 'sleep 2; ${logged}'`);
		// This node is intentionally back in the game — cancel any pending auto-reclaim hold.
		await db()("ha_node").where({ name: nodeName }).update({ hold_until: 0 });
		logger.info(`[HA-Update] Update scheduled on ${nodeName}`);
		return { started: true, node: nodeName };
	},

	/**
	 * Move the floating IP away from the currently active node by stopping its
	 * keepalived, and hold it there for FAILOVER_HOLD_MS so there's a guaranteed
	 * window to click "Update" on it. If nobody does, the hold-reaper restarts
	 * keepalived automatically once the window expires (this is also what keeps
	 * the cluster from getting stuck with the VIP down on both sides).
	 */
	forceFailover: async () => {
		const status = await internalHa.getStatus();
		if (!status.activeNode) {
			throw new Error("Kein aktiver Node gefunden");
		}
		const target = await getNodeSsh(status.activeNode);
		await run(target, "systemctl stop keepalived");
		await db()("ha_node").where({ name: status.activeNode }).update({ hold_until: Date.now() + FAILOVER_HOLD_MS });
		logger.info(`[HA-Update] Force failover: stopped keepalived on ${status.activeNode}, hold for ${FAILOVER_HOLD_MS}ms`);
		return { failedOverFrom: status.activeNode, holdMs: FAILOVER_HOLD_MS };
	},

	/**
	 * Find nodes whose failover hold has expired without an "Update" cancelling
	 * it, and bring their keepalived back up so the cluster can't get stuck with
	 * the VIP down everywhere (exactly the outage this whole mechanism prevents).
	 */
	reclaimExpiredHolds: async () => {
		const now = Date.now();
		const expired = await db()("ha_node").where("hold_until", ">", 0).andWhere("hold_until", "<", now).select("name");
		for (const { name } of expired) {
			// Atomically claim this row so concurrent reapers (multiple nodes can run
			// this timer) don't both try to act on the same expired hold.
			const claimed = await db()("ha_node")
				.where({ name })
				.andWhere("hold_until", ">", 0)
				.andWhere("hold_until", "<", now)
				.update({ hold_until: 0 });
			if (!claimed) continue;
			try {
				const target = await getNodeSsh(name);
				await run(target, "systemctl restart keepalived");
				logger.info(`[HA-Update] Hold expired on ${name} — keepalived restarted, VIP reclaim allowed`);
			} catch (err) {
				logger.error(`[HA-Update] Failed to reclaim hold on ${name}: ${err.message}`);
			}
		}
	},

	startHoldReaper: () => {
		setInterval(() => {
			internalHaUpdate.reclaimExpiredHolds().catch((err) => logger.error(`[HA-Update] reaper failed: ${err.message}`));
		}, REAPER_INTERVAL);
		logger.info("[HA-Update] Failover-hold reaper started");
	},
};

export default internalHaUpdate;
