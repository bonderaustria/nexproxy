import * as api from "./base";

export interface HANode {
	name: string;
	address: string;
	role: string;
	version: string;
	lastSeen: number;
	online: boolean;
	isSelf: boolean;
}

export interface HAStatusResponse {
	standalone?: boolean;
	enabled: boolean;
	vip: string | null;
	activeNode: string | null;
	self: string;
	nodes: HANode[];
	defaults: {
		dbHost: string;
		dbPort: number;
		dbName: string;
		dbUser: string;
		vip: string;
	};
}

export async function getHAStatus(): Promise<HAStatusResponse> {
	return await api.get({
		url: "/ha/status",
	});
}
