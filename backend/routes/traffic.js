import express from "express";
import internalTraffic from "../internal/traffic.js";
import jwtdecode from "../lib/express/jwt-decode.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	/**
	 * GET /api/traffic — live request rate and connection counts.
	 *
	 * Returns the last sampled values plus the recent history. Sampling runs on a
	 * fixed one-second interval in the background, so this endpoint never blocks
	 * and every open dashboard sees the same numbers.
	 */
	.get((_req, res) => {
		res.status(200).send(internalTraffic.get());
	});

export default router;
