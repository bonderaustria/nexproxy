import db from "../db.js";
import { getPrivateKey, getPublicKey, setKeys } from "../lib/config.js";
import { global as logger } from "../logger.js";

/**
 * In an HA cluster every node signs/verifies JWTs with its OWN local key by
 * default, so a session becomes invalid on the node you get failed over to.
 *
 * This adopts one shared signing key across the whole cluster (stored in the
 * shared database): the first node to run this after joining publishes its
 * key as canonical; every other node (including this one on later boots)
 * adopts it. Standalone instances are left untouched.
 *
 * Note: nodes that already had sessions signed with their OLD per-node key
 * will need a one-time re-login after this key is adopted.
 */
export async function syncJwtKeys() {
	const role = process.env.HA_ROLE || "standalone";
	if (role === "standalone") return;

	try {
		const row = await db()("jwt_keys").where({ id: 1 }).first();
		if (row?.priv_key && row?.pub_key) {
			setKeys({ key: row.priv_key, pub: row.pub_key });
			logger.info("[JWT] Adopted shared cluster signing key");
			return;
		}
		await db()("jwt_keys")
			.insert({ id: 1, priv_key: getPrivateKey(), pub_key: getPublicKey() })
			.onConflict("id")
			.ignore();
		// Re-read: if another node won the race to insert first, adopt its key instead.
		const winner = await db()("jwt_keys").where({ id: 1 }).first();
		if (winner?.priv_key && winner.priv_key !== getPrivateKey()) {
			setKeys({ key: winner.priv_key, pub: winner.pub_key });
			logger.info("[JWT] Adopted shared cluster signing key (published by another node)");
		} else {
			logger.info("[JWT] Published this node's signing key as the cluster key");
		}
	} catch (err) {
		logger.error(`[JWT] sync failed: ${err.message}`);
	}
}
