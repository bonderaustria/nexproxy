import crypto from "node:crypto";
import db from "../db.js";
import { global as logger } from "../logger.js";

// Public key — verifies license keys signed with the (private) issuing key.
// A license key is: base64url(payloadJSON) + "." + base64url(ed25519-signature).
// The revocation list is signed with the SAME key, so it needs no extra key
// distribution and an untrusted host may serve it.
const PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAQNX96/1hjuPX2zDypIi3F0tBkGQZnp7zWCAwmptya5Y=
-----END PUBLIC KEY-----`;

const CRL_URL =
	process.env.NEXPROXY_CRL_URL || "https://raw.githubusercontent.com/bonderaustria/nexproxy-crl/main/crl.json";
const CRL_INTERVAL_MS = 6 * 60 * 60 * 1000;
// Beyond this we still trust the cached list (fail-open), but tell the operator
// that the licence status could not be confirmed for a long time.
const CRL_STALE_MS = 30 * 24 * 60 * 60 * 1000;

const EMPTY = {
	enterprise: false,
	licensedTo: null,
	email: null,
	expires: null,
	revoked: false,
	revokeReason: null,
	revokeEffectiveAt: null,
	crlSerial: 0,
	crlFetchedAt: 0,
	crlStale: false,
};

let cache = { ...EMPTY };

/** SHA-256 over the whole key string — the only handle on pre-`id` licences. */
export const licenseKeyHash = (key) =>
	`sha256:${crypto.createHash("sha256").update(String(key || "").trim()).digest("hex")}`;

/**
 * Verify anything signed with the licensing key — licences and the CRL alike.
 * Returns the parsed payload, or null.
 */
function verifySigned(token) {
	try {
		const [payloadB64, sigB64] = String(token || "").trim().split(".");
		if (!payloadB64 || !sigB64) return null;
		const payload = Buffer.from(payloadB64, "base64url");
		const sig = Buffer.from(sigB64, "base64url");
		if (!crypto.verify(null, payload, PUBLIC_KEY, sig)) return null;
		return JSON.parse(payload.toString("utf8"));
	} catch (_e) {
		return null;
	}
}

/**
 * Verify a license key. Returns the payload on success, null otherwise.
 *
 * Behaviour deliberately unchanged: signature plus expiry only. Revocation is a
 * separate, asynchronous concern handled in loadLicense(), so this function
 * stays synchronous and works with no network at all.
 */
export function verifyLicenseKey(key) {
	const data = verifySigned(key);
	if (!data) return null;
	if (data.expires && Date.now() > Number(data.expires)) return null;
	return data;
}

// ── Revocation list ─────────────────────────────────────────────────────────

async function readCrlRow() {
	try {
		return await db()("license_crl").where({ id: 1 }).first();
	} catch (_e) {
		// Table missing (migration not run yet) must never break licence loading.
		return null;
	}
}

/**
 * Accept a CRL document — the published file's contents, or a manual upload for
 * installations without internet access. Returns the stored payload or throws
 * with a reason the GUI can display.
 */
export async function applyCrlDocument(text, source) {
	let doc;
	try {
		doc = typeof text === "string" ? JSON.parse(text) : text;
	} catch (_e) {
		throw new Error("Sperrliste ist kein gültiges JSON.");
	}
	// Only the signed token is authoritative. The readable `payload` next to it
	// is a convenience for humans and is ignored here on purpose — trusting it
	// would make the signature pointless.
	const payload = verifySigned(doc?.signed);
	if (!payload) throw new Error("Signatur der Sperrliste ist ungültig.");
	if (!Array.isArray(payload.revoked)) throw new Error("Sperrliste enthält kein revoked-Feld.");

	const row = await readCrlRow();
	const known = Number(row?.serial || 0);
	if (Number(payload.serial || 0) < known) {
		// Rollback attempt: an older list would silently un-revoke licences.
		throw new Error(`Sperrliste ist älter als die bekannte (serial ${payload.serial} < ${known}) und wird verworfen.`);
	}

	await db()("license_crl").where({ id: 1 }).update({
		serial: Number(payload.serial || 0),
		issued_at: Number(payload.issuedAt || 0),
		payload: JSON.stringify(payload),
		fetched_at: Date.now(),
		source: String(source || ""),
	});
	return payload;
}

/** Fetch the published list. Failures are logged and otherwise ignored. */
export async function refreshCrl() {
	try {
		const res = await fetch(CRL_URL, { signal: AbortSignal.timeout(15000) });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		const payload = await applyCrlDocument(await res.text(), CRL_URL);
		logger.info(`[License] CRL aktualisiert: serial ${payload.serial}, ${payload.revoked.length} Eintrag/Einträge`);
		await loadLicense();
		return payload;
	} catch (err) {
		// Fail-open: keep whatever we had. A revoked licence that cannot reach us
		// keeps working — the alternative (disabling on every network hiccup)
		// would take customers' proxies down for our convenience.
		logger.error(`[License] CRL-Abruf fehlgeschlagen: ${err.message}`);
		return null;
	}
}

/**
 * Find this licence in the cached list — by id for current licences, by key
 * hash for licences issued before payloads carried an id. Without the hash
 * fallback, older licences could never be revoked at all.
 */
function findRevocation(crlPayload, data, key) {
	if (!crlPayload?.revoked?.length) return null;
	const hash = licenseKeyHash(key);
	return crlPayload.revoked.find((r) => (data?.id && r.id === data.id) || (r.keyHash && r.keyHash === hash)) || null;
}

// ── Licence state ───────────────────────────────────────────────────────────

/**
 * Load the stored license from the DB and refresh the cache.
 */
export async function loadLicense() {
	try {
		const row = await db()("license").where({ id: 1 }).first();
		const key = row?.license_key || "";
		const data = key ? verifyLicenseKey(key) : null;
		if (!data) {
			cache = { ...EMPTY };
			return cache;
		}

		const crlRow = await readCrlRow();
		let crlPayload = null;
		try {
			crlPayload = crlRow?.payload ? JSON.parse(crlRow.payload) : null;
		} catch (_e) {
			crlPayload = null;
		}
		const fetchedAt = Number(crlRow?.fetched_at || 0);
		const revocation = findRevocation(crlPayload, data, key);
		// Grace window: until effectiveAt the installation only warns. This is the
		// safety net for a revocation issued by mistake — without it one wrong
		// click removes a customer's enterprise features instantly.
		const effectiveAt = revocation ? Number(revocation.effectiveAt || revocation.revokedAt || 0) : null;
		const enforced = revocation ? Date.now() >= effectiveAt : false;

		cache = {
			enterprise: !enforced,
			licensedTo: data.name || null,
			email: data.email || null,
			expires: data.expires || null,
			revoked: !!revocation,
			revokeReason: revocation?.reason || null,
			revokeEffectiveAt: effectiveAt,
			crlSerial: Number(crlRow?.serial || 0),
			crlFetchedAt: fetchedAt,
			// Never fetched counts as stale — otherwise a node that has never
			// reached the list looks perfectly healthy.
			crlStale: fetchedAt > 0 ? Date.now() - fetchedAt > CRL_STALE_MS : true,
		};
		if (enforced) {
			logger.error(
				`[License] Lizenz für "${data.name || "?"}" ist gesperrt (${revocation.reason}) — Enterprise deaktiviert.`,
			);
		}
	} catch (_e) {
		cache = { ...EMPTY };
	}
	return cache;
}

export const isEnterprise = () => cache.enterprise;
export const getLicenseInfo = () => cache;

/**
 * Periodically reload the license from the (shared) database so that activating
 * a license on any cluster node propagates to all nodes within ~30s, and pull
 * the revocation list on a much slower cadence.
 */
export function startLicenseRefresh() {
	setInterval(() => {
		loadLicense().catch(() => {
			/* keep last known state */
		});
	}, 30 * 1000);

	// Fetch once at startup so a fresh install is not unchecked for six hours,
	// then settle into the slow cadence.
	refreshCrl().catch(() => {});
	setInterval(() => {
		refreshCrl().catch(() => {});
	}, CRL_INTERVAL_MS);
}

/**
 * Store and activate a license key (validates first).
 */
export async function setLicense(key) {
	const data = verifyLicenseKey(key);
	if (!data) {
		throw new Error("Ungültiger oder abgelaufener Lizenzschlüssel.");
	}
	// Activating a key that is already listed is not an accident worth
	// cushioning — refuse outright, with no grace period.
	const crlRow = await readCrlRow();
	if (crlRow?.payload) {
		let listed = false;
		try {
			listed = !!findRevocation(JSON.parse(crlRow.payload), data, key);
		} catch (_e) {
			listed = false;
		}
		if (listed) throw new Error("Dieser Lizenzschlüssel wurde gesperrt.");
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
