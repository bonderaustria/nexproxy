import * as api from "./base";

export interface SystemHealthResponse {
	cpuPct: number;
	memPct: number;
	/** null when the disk usage could not be determined — render nothing rather than a made-up number. */
	diskPct: number | null;
	nginxRunning: boolean;
	uptimeDays: number;
	uptimeSeconds: number;
}

export async function getSystemHealth(): Promise<SystemHealthResponse> {
	return await api.get({
		url: "/system-health",
	});
}
