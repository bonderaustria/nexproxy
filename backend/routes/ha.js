import express from "express";
import internalHa from "../internal/ha.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

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

export default router;
