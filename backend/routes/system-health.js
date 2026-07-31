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

const readNum = (file) => {
	try {
		const raw = fs.readFileSync(file, "utf8").trim();
		if (raw === "max") return null; // cgroup v2: kein Limit gesetzt
		const n = Number(raw);
		return Number.isFinite(n) ? n : null;
	} catch (_e) {
		return null;
	}
};

/**
 * Memory of THIS container, not of the host.
 *
 * os.totalmem()/os.freemem() read /proc/meminfo, and inside a container that is
 * the host's memory — a 2 GB node would report the host's 31 GB, which is worse
 * than showing nothing because an operator would trust the free space. The
 * cgroup files describe the container's actual limit; the os.* values are only
 * the last resort for a bare-metal install.
 */
function memory() {
	const total =
		readNum("/sys/fs/cgroup/memory.max") ?? // cgroup v2
		readNum("/sys/fs/cgroup/memory/memory.limit_in_bytes") ?? // cgroup v1
		os.totalmem();
	let used = readNum("/sys/fs/cgroup/memory.current") ?? readNum("/sys/fs/cgroup/memory/memory.usage_in_bytes");

	if (used === null) {
		used = os.totalmem() - os.freemem();
	}
	// Ein absurd hohes cgroup-Limit bedeutet "unbegrenzt" — dann ist der
	// physische Speicher die ehrlichere Obergrenze.
	const effectiveTotal = total > os.totalmem() ? os.totalmem() : total;
	return {
		memPct: effectiveTotal ? Math.min(100, Math.round((used / effectiveTotal) * 100)) : 0,
		memUsedBytes: used,
		memTotalBytes: effectiveTotal,
	};
}

/** Kerne, die diesem Container tatsaechlich zur Verfuegung stehen. */
function cpuCores() {
	try {
		const raw = fs.readFileSync("/sys/fs/cgroup/cpu.max", "utf8").trim().split(/\s+/);
		const quota = raw[0] === "max" ? null : Number(raw[0]);
		const period = Number(raw[1]);
		if (quota && period) return Math.max(1, Math.round(quota / period));
	} catch (_e) {
		/* kein cgroup-v2-Limit */
	}
	return os.cpus()?.length || 1;
}

/**
 * CPU usage of THIS container over a short sample window.
 *
 * os.loadavg() is the host's load — identical on every node of a cluster that
 * shares a hypervisor, which is exactly the symptom that gave this away. The
 * cgroup counter cpu.stat/usage_usec is per container; two readings 200 ms apart
 * give the current usage. The dashboard polls every 30 s, so the extra 200 ms
 * per request are irrelevant.
 */
async function cpuPercent(cores) {
	const usage = () => {
		try {
			const stat = fs.readFileSync("/sys/fs/cgroup/cpu.stat", "utf8");
			const match = stat.match(/usage_usec\s+(\d+)/);
			return match ? Number(match[1]) : null;
		} catch (_e) {
			return null;
		}
	};

	const first = usage();
	if (first === null) {
		// Kein cgroup v2 — dann bleibt nur der Load des Wirts, klar begrenzt.
		return Math.min(100, Math.round((os.loadavg()[0] / cores) * 100));
	}
	const windowMs = 200;
	await new Promise((r) => setTimeout(r, windowMs));
	const second = usage();
	if (second === null || second < first) return 0;

	const usedUsec = second - first;
	const availableUsec = windowMs * 1000 * cores;
	return Math.min(100, Math.round((usedUsec / availableUsec) * 100));
}

/**
 * Disk usage of the data volume. `df` is used rather than a package because it
 * is present in the container image and avoids a dependency for one number.
 * Returns null when it cannot be determined, so the GUI can hide the row instead
 * of showing a fabricated value.
 */
async function disk() {
	try {
		// -P erzwingt das POSIX-Format (eine Zeile je Dateisystem), -k Bloecke zu
		// 1 KiB — ohne beides variiert die Ausgabe je nach Umgebung.
		const { stdout } = await execAsync("df -Pk /data 2>/dev/null || df -Pk /", { timeout: 4000 });
		const line = stdout.trim().split("\n").pop() || "";
		// Filesystem  1024-blocks  Used  Available  Capacity  Mounted
		const cols = line.split(/\s+/);
		const totalKb = Number(cols[1]);
		const usedKb = Number(cols[2]);
		if (!Number.isFinite(totalKb) || !Number.isFinite(usedKb) || totalKb <= 0) return null;
		return {
			diskPct: Math.round((usedKb / totalKb) * 100),
			diskUsedBytes: usedKb * 1024,
			diskTotalBytes: totalKb * 1024,
		};
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
			const cores = cpuCores();
			const [diskInfo, nginx, cpuPct] = await Promise.all([disk(), nginxRunning(), cpuPercent(cores)]);
			res.status(200).send({
				cpuPct,
				// Absolute Werte neben den Prozenten: "49 %" sagt nichts darueber
				// aus, ob das 2 GB oder 60 GB sind.
				cpuCores: cores,
				...memory(),
				diskPct: diskInfo ? diskInfo.diskPct : null,
				diskUsedBytes: diskInfo ? diskInfo.diskUsedBytes : null,
				diskTotalBytes: diskInfo ? diskInfo.diskTotalBytes : null,
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
