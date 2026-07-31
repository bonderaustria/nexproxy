import { exec } from "node:child_process";
import fs from "node:fs";
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
 * Whether nginx is actually running.
 *
 * Reads the pid file and confirms the process exists in /proc. Deliberately not
 * `pgrep` or `ps`: neither is present in the production image, so those would
 * always throw and report "not running" — a failure of the check would be
 * indistinguishable from a genuine outage, which is the worst kind of health
 * indicator. /proc always exists on Linux.
 */
async function nginxRunning() {
	const pidFiles = [];
	// The authoritative location is nginx's own `pid` directive — guessing common
	// paths misses the image's actual /run/nginx/nginx.pid.
	try {
		const conf = fs.readFileSync("/etc/nginx/nginx.conf", "utf8");
		const match = conf.match(/^\s*pid\s+([^;]+);/m);
		if (match) pidFiles.push(match[1].trim());
	} catch (_e) {
		/* fall back to the usual suspects below */
	}
	pidFiles.push("/run/nginx/nginx.pid", "/run/nginx.pid", "/var/run/nginx.pid");

	for (const file of pidFiles) {
		try {
			const pid = Number(fs.readFileSync(file, "utf8").trim());
			if (pid > 0 && fs.existsSync(`/proc/${pid}`)) return true;
		} catch (_e) {
			/* try the next location */
		}
	}
	return false;
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
