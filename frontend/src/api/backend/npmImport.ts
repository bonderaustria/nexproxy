import * as api from "./base";

export interface NpmImportTarget {
	host: string;
	port?: number;
	username: string;
	password?: string;
	privateKey?: string;
}

export interface NpmImportPreview {
	users: number;
	certificates: number;
	accessLists: number;
	proxyHosts: number;
	redirectionHosts: number;
	deadHosts: number;
	streams: number;
}

export interface NpmImportStep {
	name: string;
	status: string;
	log: string;
}

export interface NpmImportJob {
	running: boolean;
	done: boolean;
	error: string | null;
	steps: NpmImportStep[];
	summary: Record<string, number> | null;
}

export async function previewNpmImport(target: NpmImportTarget): Promise<NpmImportPreview> {
	return await api.post({ url: "/npm-import/preview", data: target });
}

export async function startNpmImportSsh(target: NpmImportTarget): Promise<{ started: boolean }> {
	return await api.post({ url: "/npm-import/run", data: target });
}

export async function startNpmImportUpload(file: File): Promise<{ started: boolean }> {
	const form = new FormData();
	form.append("database", file);
	return await api.post({ url: "/npm-import/upload", data: form });
}

export async function getNpmImportStatus(): Promise<NpmImportJob> {
	return await api.get({ url: "/npm-import/status" });
}
