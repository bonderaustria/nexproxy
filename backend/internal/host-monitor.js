import net from "node:net";
import db from "../db.js";
import { global as logger } from "../logger.js";

const CHECK_INTERVAL = 45 * 1000; // re-check every 45s
const CONNECT_TIMEOUT = 4000;

// In-memory status keyed by `${type}:${id}` -> { type, id, status, latency, checkedOn }
let statusMap = {};

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
			]);

			statusMap = next;
		} catch (err) {
			logger.error(`[HostMonitor] check failed: ${err.message}`);
		}
	},

	getStatus: () => Object.values(statusMap),

	/**
	 * Summary counts used by the dashboard.
	 */
	getSummary: () => {
		const all = Object.values(statusMap);
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
