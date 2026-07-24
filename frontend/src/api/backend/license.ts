import * as api from "./base";

export interface LicenseInfo {
	enterprise: boolean;
	licensedTo: string | null;
	email: string | null;
	expires: number | null;
}

export async function getLicense(): Promise<LicenseInfo> {
	return await api.get({ url: "/license" });
}

export async function setLicense(key: string): Promise<LicenseInfo> {
	return await api.post({ url: "/license", data: { key } });
}

export async function clearLicense(): Promise<LicenseInfo> {
	return await api.del({ url: "/license" });
}
