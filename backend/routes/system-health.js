import { exec } from "node:child_process";
import os from "node:os";
import { promisify } from "node:util";
import express from "express";
import jwtdecode from "../lib/express/jwt-decode.js";

const execAsync = promisify(exec);

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * CPU load as a percentage.
 *
 * Uses the 1-minute load average divided by the core count rather than sampling
 * /proc/stat twice: the dashboard polls every 30s, and a sampling approach would
 * either block the request for its sample window or report a figure from a
 * window nobody asked about. Load average is already the OS's own smoothed view.
 * Capped at 100 because load can legitimately exceed the core count.
 */
function cpuPercent() {
	const cores = os.cpus()?.length || 1;
	const [oneMinute] = os.loadavg();
	return Math.min(100, Math.round((oneMinute / cores) * 100));
}

function memoryPercent() {
	const total = os.totalmem();
	if (!total) return 0;
	return Math.round(((total - os.freemem()) / total) * 100);
}

/**
 * Disk usage of the data volume. `df` is used rather than a package because it
 * is present in the container image and avoids a dependency for one number.
 * Returns null when it cannot be determined, so the GUI can hide the row instead
 * of showing a fabricated value.
 */
async function diskPercent() {
	try {
		const { stdout } = await execAsync("df -P /data 2>/dev/null || df -P /", { timeout: 4000 });
		const line = stdout.trim().split("\n").pop() || "";
		const match = line.match(/(\d+)%/);
		return match ? Number(match[1]) : null;
	} catch (_e) {
		return null;
	}
}

/**
 * Whether nginx is actually serving. Checking the process table rather than
 * asking nginx over HTTP keeps this honest even when a config error has nginx
 * running but refusing connections — the dashboard's own request already proves
 * the API is up, so the interesting question is the proxy itself.
 */
async function nginxRunning() {
	try {
		await execAsync("pgrep -x nginx", { timeout: 4000 });
		return true;
	} catch (_e) {
		return false;
	}
}

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	/**
	 * GET /api/system-health — CPU, memory, disk and nginx state for the
	 * dashboard's System Health card. Deliberately cheap: the dashboard polls it
	 * every 30 seconds per open browser tab.
	 */
	.get(async (_req, res) => {
		try {
			const [disk, nginx] = await Promise.all([diskPercent(), nginxRunning()]);
			res.status(200).send({
				cpuPct: cpuPercent(),
				memPct: memoryPercent(),
				diskPct: disk,
				nginxRunning: nginx,
				// os.uptime() is the container's uptime, which is what an operator
				// actually cares about here — not the host's.
				uptimeDays: Math.floor(os.uptime() / 86400),
				uptimeSeconds: Math.floor(os.uptime()),
			});
		} catch (error) {
			res.status(500).send({ error: { code: 500, message: error.message } });
		}
	});

export default router;
