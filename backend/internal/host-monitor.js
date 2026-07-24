import net from "node:net";
import db from "../db.js";
import UpstreamModel from "../models/upstream.js";
import { global as logger } from "../logger.js";
import internalNginx from "./nginx.js";

const CHECK_INTERVAL = 45 * 1000; // re-check every 45s
const CONNECT_TIMEOUT = 4000;

// In-memory status keyed by `${type}:${id}` -> { type, id, status, latency, checkedOn }
let statusMap = {};

// Last "which servers are down" signature written to nginx per upstream id,
// so we only regenerate + reload when a target actually flips state.
const lastDownSignature = new Map();

/**
 * TCP reachability check against host:port.
 * @returns {Promise<{ ok: boolean, latency: number }>}
 */
const tcpCheck = (host, port) =>
	new Promise((resolve) => {
		const start = Date.now();
		const sock = new net.Socket();
		let settled = false;
		const finish = (ok) => {
			if (settled) return;
			settled = true;
			sock.destroy();
			resolve({ ok, latency: Date.now() - start });
		};
		sock.setTimeout(CONNECT_TIMEOUT);
		sock.once("connect", () => finish(true));
		sock.once("timeout", () => finish(false));
		sock.once("error", () => finish(false));
		try {
			sock.connect(port, host);
		} catch (_e) {
			finish(false);
		}
	});

const internalHostMonitor = {
	check: async () => {
		try {
			const next = {};
			const proxyHosts = await db()("proxy_host")
				.where({ enabled: 1, is_deleted: 0 })
				.select("id", "forward_host", "forward_port");
			const streams = await db()("stream")
				.where({ enabled: 1, is_deleted: 0 })
				.select("id", "forwarding_host", "forwarding_port");
			const upstreamServers = await db()("upstream_server")
				.where({ enabled: 1, is_deleted: 0 })
				.select("id", "upstream_id", "host", "port");

			await Promise.all([
				...proxyHosts.map(async (h) => {
					const r = await tcpCheck(h.forward_host, h.forward_port);
					next[`proxy:${h.id}`] = {
						type: "proxy",
						id: h.id,
						status: r.ok ? "online" : "offline",
						latency: r.latency,
						checkedOn: Date.now(),
					};
				}),
				...streams.map(async (s) => {
					const r = await tcpCheck(s.forwarding_host, s.forwarding_port);
					next[`stream:${s.id}`] = {
						type: "stream",
						id: s.id,
						status: r.ok ? "online" : "offline",
						latency: r.latency,
						checkedOn: Date.now(),
					};
				}),
				...upstreamServers.map(async (s) => {
					const r = await tcpCheck(s.host, s.port);
					next[`upstream_server:${s.id}`] = {
						type: "upstream_server",
						id: s.id,
						upstreamId: s.upstream_id,
						status: r.ok ? "online" : "offline",
						latency: r.latency,
						checkedOn: Date.now(),
					};
				}),
			]);

			statusMap = next;
			await internalHostMonitor.reconcileUpstreams(upstreamServers);
		} catch (err) {
			logger.error(`[HostMonitor] check failed: ${err.message}`);
		}
	},

	/**
	 * Actually take unreachable targets out of rotation: regenerate + reload the
	 * nginx upstream config for any load balancer whose down/up set changed.
	 */
	reconcileUpstreams: async (upstreamServers) => {
		const byUpstream = new Map();
		for (const s of upstreamServers) {
			if (!byUpstream.has(s.upstream_id)) byUpstream.set(s.upstream_id, []);
			byUpstream.get(s.upstream_id).push(s);
		}
		if (!byUpstream.size) return;

		const upstreams = await UpstreamModel.query()
			.whereIn("id", [...byUpstream.keys()])
			.where("is_deleted", 0)
			.withGraphFetched("servers");

		for (const u of upstreams) {
			const servers = (u.servers || [])
				.filter((s) => s.enabled)
				.map((s) => ({
					host: s.host,
					port: s.port,
					weight: s.weight || 1,
					down: internalHostMonitor.getUpstreamServerStatus(s.id) === "offline",
				}));
			const signature = servers.map((s) => `${s.host}:${s.port}=${s.down ? "down" : "up"}`).join(",");
			if (lastDownSignature.get(u.id) === signature) continue;

			lastDownSignature.set(u.id, signature);
			try {
				await internalNginx.generateConfig("upstream", { id: u.id, name: u.name, method: u.method, servers });
				await internalNginx.reload();
				logger.info(`[HostMonitor] Upstream ${u.id} (${u.name}) rotation updated: ${signature}`);
			} catch (err) {
				logger.error(`[HostMonitor] Failed to reconcile upstream ${u.id}: ${err.message}`);
			}
		}
	},

	getStatus: () => Object.values(statusMap),
	getUpstreamServerStatus: (serverId) => statusMap[`upstream_server:${serverId}`]?.status || "unknown",

	/**
	 * Summary counts used by the dashboard.
	 */
	getSummary: () => {
		const all = Object.values(statusMap).filter((s) => s.type !== "upstream_server");
		const online = all.filter((s) => s.status === "online").length;
		const offline = all.filter((s) => s.status === "offline").length;
		return { total: all.length, online, offline };
	},

	initTimer: () => {
		setTimeout(internalHostMonitor.check, 5000); // first run shortly after boot
		setInterval(internalHostMonitor.check, CHECK_INTERVAL);
		logger.info("[HostMonitor] Health monitor started");
	},
};

export default internalHostMonitor;
