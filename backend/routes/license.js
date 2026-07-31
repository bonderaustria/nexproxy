import express from "express";
import { applyCrlDocument, clearLicense, getLicenseInfo, loadLicense, refreshCrl, setLicense } from "../lib/license.js";
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

router
	.route("/crl/refresh")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	/**
	 * POST /api/license/crl/refresh — fetch the published revocation list now
	 * instead of waiting for the six-hour cycle. Used after activating a licence
	 * and by the "check now" button.
	 */
	.post(async (_req, res) => {
		const payload = await refreshCrl();
		if (!payload) {
			return res.status(502).send({
				error: { code: 502, message: "Sperrliste konnte nicht abgerufen werden. Die zuletzt bekannte Liste gilt weiter." },
			});
		}
		res.status(200).send({ serial: payload.serial, revoked: payload.revoked.length, license: getLicenseInfo() });
	});

router
	.route("/crl/import")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	/**
	 * POST /api/license/crl/import { document } — manually apply a revocation
	 * list. For installations with no outbound internet access, where the
	 * operator transfers the signed file by hand. The signature and the
	 * monotonic serial are checked exactly as they are for a fetched list, so
	 * this path is no weaker than the automatic one.
	 */
	.post(async (req, res) => {
		try {
			const payload = await applyCrlDocument((req.body || {}).document, "manual-import");
			await loadLicense();
			res.status(200).send({ serial: payload.serial, revoked: payload.revoked.length, license: getLicenseInfo() });
		} catch (error) {
			res.status(400).send({ error: { code: 400, message: error.message } });
		}
	});

export default router;
