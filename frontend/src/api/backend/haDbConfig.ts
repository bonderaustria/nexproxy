import * as api from "./base";

export interface HADbConfig {
	dbHost: string;
	dbPort: number;
	dbName: string;
	dbUser: string;
	dbPassword: string;
	vip: string;
	provisioned: boolean;
}

export async function getHADbConfig(): Promise<HADbConfig> {
	return await api.get({
		url: "/ha/db-config",
	});
}

export async function updateHADbConfig(data: Partial<HADbConfig>): Promise<{ saved: boolean }> {
	return await api.put({
		url: "/ha/db-config",
		data,
	});
}
