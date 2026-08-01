import { global as logger } from "../logger.js";

/**
 * Live traffic figures for the dashboard, read from nginx's stub_status.
 *
 * Sampling happens here, once a second, rather than on request: the requests
 * per second figure is a delta between two readings, so it needs a stable
 * interval. If every browser tab computed its own delta, the number would jump
 * around depending on how long that tab had been open, and two tabs would show
 * different values for the same moment.
 *
 * The history is kept server-side for the same reason — a freshly opened
 * dashboard shows the same curve as one that has been open for an hour, instead
 * of starting from an empty chart.
 */

const STATUS_URL = process.env.NEXPROXY_STATUS_URL || "http://127.0.0.1:9081/stub_status";
const SAMPLE_MS = 1000;
/** Five minutes at one sample per second. */
const HISTORY_LENGTH = 300;

let previous = null; // { requests, at }
const history = []; // [{ t, rps, active }]
let current = {
	requestsPerSecond: 0,
	activeConnections: 0,
	reading: 0,
	writing: 0,
	waiting: 0,
	available: false,
};
let timer = null;

/**
 * stub_status output looks like this:
 *
 *   Active connections: 3
 *   server accepts handled requests
 *    17 17 21
 *   Reading: 0 Writing: 1 Waiting: 2
 */
const parse = (text) => {
	const active = Number(/Active connections:\s*(\d+)/.exec(text)?.[1] ?? 0);
	const counters = /^\s*(\d+)\s+(\d+)\s+(\d+)\s*$/m.exec(text);
	const rw = /Reading:\s*(\d+)\s+Writing:\s*(\d+)\s+Waiting:\s*(\d+)/.exec(text);
	return {
		active,
		accepts: Number(counters?.[1] ?? 0),
		handled: Number(counters?.[2] ?? 0),
		requests: Number(counters?.[3] ?? 0),
		reading: Number(rw?.[1] ?? 0),
		writing: Number(rw?.[2] ?? 0),
		waiting: Number(rw?.[3] ?? 0),
	};
};

const sample = async () => {
	try {
		const res = await fetch(STATUS_URL, { signal: AbortSignal.timeout(2000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const stats = parse(await res.text());
		const now = Date.now();

		let rps = 0;
		if (previous) {
			const seconds = (now - previous.at) / 1000;
			// An nginx reload resets the counters. A negative delta means exactly
			// that, and reporting it as a huge negative rate would be nonsense.
			const delta = stats.requests - previous.requests;
			rps = seconds > 0 && delta >= 0 ? delta / seconds : 0;
		}
		previous = { requests: stats.requests, at: now };

		current = {
			requestsPerSecond: Math.round(rps * 10) / 10,
			activeConnections: stats.active,
			reading: stats.reading,
			writing: stats.writing,
			waiting: stats.waiting,
			available: true,
		};

		history.push({ t: now, rps: current.requestsPerSecond, active: stats.active });
		if (history.length > HISTORY_LENGTH) history.splice(0, history.length - HISTORY_LENGTH);
	} catch (err) {
		// Losing the status endpoint must not be loud: it is a dashboard nicety,
		// not a health signal. The flag lets the GUI say so instead of showing a
		// zero that looks like real silence.
		if (current.available) {
			logger.error(`[Traffic] stub_status not reachable: ${err.message}`);
		}
		current = { ...current, available: false };
	}
};

const internalTraffic = {
	start: () => {
		if (timer) return;
		sample().catch(() => {});
		timer = setInterval(() => sample().catch(() => {}), SAMPLE_MS);
		logger.info("[Traffic] Sampling nginx status every second");
	},

	get: () => ({
		...current,
		// Only the last two minutes travel to the browser; the rest is kept for
		// future use but would only bloat a once-a-second response.
		history: history.slice(-120).map((h) => ({ t: h.t, rps: h.rps, active: h.active })),
	}),
};

export default internalTraffic;
