import * as api from "./base";

export interface AccessLogEntry {
	id: number;
	nodeName: string;
	ts: number;
	ip: string;
	method: string;
	host: string;
	path: string;
	status: number;
}

export interface AccessLogResponse {
	rows: AccessLogEntry[];
	total: number;
	limit: number;
	offset: number;
}

export interface AccessLogStats {
	requests24h: number;
	uniqueIps: number;
	errors: number;
	blocked: number;
}

export async function getAccessLog(
	params: Record<string, string | number>,
): Promise<AccessLogResponse> {
	return await api.get({ url: "/access-log", params });
}

export async function getAccessLogStats(): Promise<AccessLogStats> {
	return await api.get({ url: "/access-log/stats" });
}

export async function getAccessLogRetention(): Promise<{ retentionDays: number }> {
	return await api.get({ url: "/access-log/config" });
}

export async function setAccessLogRetention(retentionDays: number): Promise<{ retentionDays: number }> {
	return await api.put({ url: "/access-log/config", data: { retentionDays } });
}
