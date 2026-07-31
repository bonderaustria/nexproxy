import * as api from "./base";

export interface SystemHealthResponse {
	cpuPct: number;
	/** Kerne, die diesem Container zustehen — nicht die des Wirts. */
	cpuCores: number;
	memPct: number;
	memUsedBytes: number;
	memTotalBytes: number;
	/** null, wenn die Belegung nicht ermittelt werden konnte — dann lieber nichts anzeigen als einen erfundenen Wert. */
	diskPct: number | null;
	diskUsedBytes: number | null;
	diskTotalBytes: number | null;
	nginxRunning: boolean;
	uptimeDays: number;
	uptimeSeconds: number;
}

export async function getSystemHealth(): Promise<SystemHealthResponse> {
	return await api.get({
		url: "/system-health",
	});
}
