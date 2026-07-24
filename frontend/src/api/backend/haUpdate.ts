import * as api from "./base";

export async function updateHANode(nodeName: string): Promise<{ started: boolean; node: string }> {
	return await api.post({
		url: "/ha/update-node",
		data: { nodeName },
	});
}

export async function forceHAFailover(): Promise<{ failedOverFrom: string }> {
	return await api.post({
		url: "/ha/force-failover",
	});
}
