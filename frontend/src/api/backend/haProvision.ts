import * as api from "./base";

export interface SSHTarget {
	host: string;
	username: string;
	password?: string;
	privateKey?: string;
}

export interface ProvisionParams {
	dbTarget: SSHTarget;
	nodeTarget: SSHTarget;
	primaryTarget?: SSHTarget;
	dbAddress: string;
	primaryAddress: string;
	nodeAddress: string;
	vip: string;
	iface?: string;
	vrid?: number;
}

export async function startHAProvision(data: ProvisionParams): Promise<{ started: boolean }> {
	return await api.post({
		url: "/ha/provision",
		data,
	});
}

export interface ProvisionStep {
	name: string;
	status: string;
	log: string;
}

export interface ProvisionJob {
	running: boolean;
	done: boolean;
	error: string | null;
	steps: ProvisionStep[];
}

export async function getHAProvisionStatus(): Promise<ProvisionJob> {
	return await api.get({
		url: "/ha/provision-status",
	});
}
