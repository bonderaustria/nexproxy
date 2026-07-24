import * as api from "./base";

export interface UpstreamServer {
	id?: number;
	host: string;
	port: number;
	weight: number;
	status?: "online" | "offline" | "unknown";
}

export interface Upstream {
	id: number;
	name: string;
	method: "round_robin" | "least_conn";
	servers: UpstreamServer[];
}

export async function getUpstreams(): Promise<Upstream[]> {
	return await api.get({ url: "/upstreams" });
}

export async function createUpstream(data: {
	name: string;
	method: string;
	servers: UpstreamServer[];
}): Promise<Upstream> {
	return await api.post({ url: "/upstreams", data });
}

export async function updateUpstream(
	id: number,
	data: { name: string; method: string; servers: UpstreamServer[] },
): Promise<Upstream> {
	return await api.put({ url: `/upstreams/${id}`, data });
}

export async function deleteUpstream(id: number): Promise<{ deleted: boolean }> {
	return await api.del({ url: `/upstreams/${id}` });
}
