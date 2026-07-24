import * as api from "./base";

export interface HAConfigParams {
	nodeName: string;
	role: string;
	iface: string;
	vip: string;
	vrid: number;
	authPass: string;
	dbHost: string;
	dbPort: number;
	dbName: string;
	dbUser: string;
	dbPassword?: string;
	image?: string;
}

export interface HAConfigResult {
	compose: string;
	keepalived: string;
	checkScript: string;
}

export async function generateHAConfig(data: HAConfigParams): Promise<HAConfigResult> {
	return await api.post({
		url: "/ha/generate-config",
		data,
	});
}
