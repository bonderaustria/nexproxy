import * as api from "./base";

export interface TrafficSample {
	t: number;
	rps: number;
	active: number;
}

export interface TrafficResponse {
	requestsPerSecond: number;
	activeConnections: number;
	reading: number;
	writing: number;
	waiting: number;
	/** False when nginx's status endpoint could not be read — the GUI says so rather than showing a misleading zero. */
	available: boolean;
	history: TrafficSample[];
}

export async function getTraffic(): Promise<TrafficResponse> {
	return await api.get({ url: "/traffic" });
}
