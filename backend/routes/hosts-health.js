import express from "express";
import internalHostMonitor from "../internal/host-monitor.js";
import jwtdecode from "../lib/express/jwt-decode.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

/**
 * GET /api/hosts-health
 *
 * Reachability status of enabled proxy hosts and streams, plus a summary.
 */
router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res) => {
		res.status(200).send({
			summary: internalHostMonitor.getSummary(),
			hosts: internalHostMonitor.getStatus(),
		});
	});

export default router;
