import express from "express";
import db from "../db.js";
import internalHa from "../internal/ha.js";
import internalHaProvision from "../internal/ha-provision.js";
import internalHaUpdate from "../internal/ha-update.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { decryptSecret, encryptSecret } from "../lib/secret-store.js";
import { debug, express as logger } from "../logger.js";

// The API client decamelizes request bodies; nested SSH targets arrive snake_case.
const mapTarget = (t) =>
	t && t.host
		? {
				host: t.host,
				port: t.port,
				username: t.username,
				password: t.password,
				privateKey: t.private_key,
				passphrase: t.passphrase,
			}
		: undefined;

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * /api/ha/status
 */
router
	.route("/status")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * GET /api/ha/status
	 *
	 * Current HA cluster status: nodes, online state and expected VIP holder.
	 */
	.get(async (req, res, next) => {
		try {
			const data = await internalHa.getStatus();
			res.status(200).send(data);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	});

/**
 * /api/ha/generate-config
 */
router
	.route("/generate-config")
	.options((_, res) => {
		res.sendStatus(204);
	})
	.all(jwtdecode())

	/**
	 * POST /api/ha/generate-config
	 *
	 * Generate the docker-compose + keepalived config for adding a node.
	 */
	.post(async (req, res, next) => {
		try {
			const data = internalHa.generateConfig(req.body || {});
			res.status(200).send(data);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	});

/**
 * POST /api/ha/provision  — start automatic HA setup (fire and forget)
 * GET  /api/ha/provision-status — poll progress
 */
router
	.route("/provision")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const b = req.body || {};
			if (internalHaProvision.getJob().running) {
				return res.status(409).send({ error: "Provisionierung läuft bereits" });
			}
			// Fire and forget; the GUI polls /provision-status.
			internalHaProvision.provision({
				dbTarget: mapTarget(b.db_target),
				nodeTarget: mapTarget(b.node_target),
				primaryTarget: mapTarget(b.primary_target),
				dbAddress: b.db_address,
				primaryAddress: b.primary_address,
				nodeAddress: b.node_address,
				vip: b.vip,
				iface: b.iface,
				vrid: b.vrid,
			});
			res.status(202).send({ started: true });
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	});

/**
 * GET /api/ha/vip-notify?state=master|backup|fault
 *
 * Called locally by keepalived's notify script (no auth) so the cluster status
 * reflects the real floating-IP holder.
 */
router
	.route("/vip-notify")
	.options((_, res) => res.sendStatus(204))
	.get((req, res) => {
		internalHa.setVipState((req.query.state || "").toLowerCase() === "master");
		res.status(200).send({ ok: true });
	});

router
	.route("/provision-status")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res) => {
		res.status(200).send(internalHaProvision.getJob());
	});

/**
 * GET/PUT /api/ha/db-config — view / edit the shared database credentials (admin)
 */
router
	.route("/db-config")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			const row = await db()("ha_config").where({ id: 1 }).first();
			res.status(200).send({
				db_host: row?.db_host || "",
				db_port: row?.db_port || 5432,
				db_name: row?.db_name || "npm",
				db_user: row?.db_user || "npm",
				db_password: decryptSecret(row?.db_password_enc),
				vip: row?.vip || "",
				provisioned: !!row?.provisioned,
			});
		} catch (error) {
			next(error);
		}
	})
	.put(async (req, res, next) => {
		try {
			const b = req.body || {};
			const update = {
				db_host: b.db_host,
				db_port: b.db_port,
				db_name: b.db_name,
				db_user: b.db_user,
				vip: b.vip,
				modified_on: Date.now(),
			};
			if (typeof b.db_password === "string" && b.db_password !== "") {
				update.db_password_enc = encryptSecret(b.db_password);
			}
			Object.keys(update).forEach((k) => update[k] === undefined && delete update[k]);
			await db()("ha_config").where({ id: 1 }).update(update);
			res.status(200).send({ saved: true });
		} catch (error) {
			next(error);
		}
	});

/**
 * POST /api/ha/update-node { node_name } — rolling update a node (standby only)
 * POST /api/ha/force-failover — move the VIP off the active node
 */
router
	.route("/update-node")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const data = await internalHaUpdate.updateNode((req.body || {}).node_name);
			res.status(200).send(data);
		} catch (error) {
			res.status(400).send({ error: { code: 400, message: error.message } });
		}
	});

router
	.route("/latest-version")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res) => {
		res.status(200).send({ latest: await internalHaUpdate.getLatestVersion() });
	});

router
	.route("/force-failover")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (_req, res) => {
		try {
			const data = await internalHaUpdate.forceFailover();
			res.status(200).send(data);
		} catch (error) {
			res.status(400).send({ error: { code: 400, message: error.message } });
		}
	});

export default router;
