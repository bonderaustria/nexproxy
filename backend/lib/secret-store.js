import crypto from "node:crypto";
import { getPrivateKey } from "./config.js";

/**
 * Derive a stable 32-byte key from the application's private key so secrets
 * (e.g. remote root passwords, DB password) can be stored encrypted at rest.
 */
const deriveKey = () => crypto.createHash("sha256").update(String(getPrivateKey())).digest();

/**
 * Encrypt a string with AES-256-GCM. Returns "iv:tag:cipher" (base64 parts).
 */
export const encryptSecret = (plain) => {
	if (plain === undefined || plain === null || plain === "") {
		return "";
	}
	const iv = crypto.randomBytes(12);
	const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
	const enc = Buffer.concat([cipher.update(String(plain), "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
};

/**
 * Decrypt a value produced by encryptSecret. Returns "" on any failure.
 */
export const decryptSecret = (payload) => {
	if (!payload || typeof payload !== "string" || !payload.includes(":")) {
		return "";
	}
	try {
		const [ivB64, tagB64, dataB64] = payload.split(":");
		const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), Buffer.from(ivB64, "base64"));
		decipher.setAuthTag(Buffer.from(tagB64, "base64"));
		const dec = Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]);
		return dec.toString("utf8");
	} catch (_e) {
		return "";
	}
};
