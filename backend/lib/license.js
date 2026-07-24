import crypto from "node:crypto";
import db from "../db.js";
import { global as logger } from "../logger.js";

// Public key — verifies license keys signed with the (private) issuing key.
// A license key is: base64url(payloadJSON) + "." + base64url(ed25519-signature).
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAQNX96/1hjuPX2zDypIi3F0tBkGQZnp7zWCAwmptya5Y=
-----END PUBLIC KEY-----`;

let cache = { enterprise: false, licensedTo: null, email: null, expires: null };

/**
 * Verify a license key. Returns the payload on success, null otherwise.
 */
export function verifyLicenseKey(key) {
	try {
		const [payloadB64, sigB64] = String(key || "").trim().split(".");
		if (!payloadB64 || !sigB64) return null;
		const payload = Buffer.from(payloadB64, "base64url");
		const sig = Buffer.from(sigB64, "base64url");
		const ok = crypto.verify(null, payload, PUBLIC_KEY, sig);
		if (!ok) return null;
		const data = JSON.parse(payload.toString("utf8"));
		if (data.expires && Date.now() > Number(data.expires)) return null;
		return data;
	} catch (_e) {
		return null;
	}
}

/**
 * Load the stored license from the DB and refresh the cache.
 */
export async function loadLicense() {
	try {
		const row = await db()("license").where({ id: 1 }).first();
		const data = row?.license_key ? verifyLicenseKey(row.license_key) : null;
		cache = data
			? { enterprise: true, licensedTo: data.name || null, email: data.email || null, expires: data.expires || null }
			: { enterprise: false, licensedTo: null, email: null, expires: null };
	} catch (_e) {
		cache = { enterprise: false, licensedTo: null, email: null, expires: null };
	}
	return cache;
}

export const isEnterprise = () => cache.enterprise;
export const getLicenseInfo = () => cache;

/**
 * Store and activate a license key (validates first).
 */
export async function setLicense(key) {
	const data = verifyLicenseKey(key);
	if (!data) {
		throw new Error("Ungültiger oder abgelaufener Lizenzschlüssel.");
	}
	await db()("license").where({ id: 1 }).update({ license_key: String(key).trim(), modified_on: Date.now() });
	await loadLicense();
	logger.info(`[License] Enterprise activated for "${data.name || "?"}"`);
	return cache;
}

export async function clearLicense() {
	await db()("license").where({ id: 1 }).update({ license_key: "", modified_on: Date.now() });
	await loadLicense();
	return cache;
}
