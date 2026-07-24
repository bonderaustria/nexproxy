import express from "express";
import { clearLicense, getLicenseInfo, setLicense } from "../lib/license.js";
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
	 * GET /api/license — current enterprise licensing status
	 */
	.get((_req, res) => {
		res.status(200).send(getLicenseInfo());
	})

	/**
	 * POST /api/license { key } — activate an enterprise license
	 */
	.post(async (req, res) => {
		try {
			const info = await setLicense((req.body || {}).key);
			res.status(200).send(info);
		} catch (error) {
			res.status(400).send({ error: { code: 400, message: error.message } });
		}
	})

	/**
	 * DELETE /api/license — remove the license (back to free)
	 */
	.delete(async (_req, res) => {
		const info = await clearLicense();
		res.status(200).send(info);
	});

export default router;
