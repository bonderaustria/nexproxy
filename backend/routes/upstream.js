import express from "express";
import internalUpstream from "../internal/upstream.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { isEnterprise } from "../lib/license.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// Load balancing (multiple backend targets per host) is Enterprise-only.
router.use((req, res, next) => {
	if (req.method === "OPTIONS") return next();
	if (!isEnterprise()) {
		return res.status(403).send({
			error: { code: 403, message: "Enterprise-Lizenz erforderlich — Load Balancing ist eine Enterprise-Funktion." },
		});
	}
	next();
});

router
	.route("/")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (req, res, next) => {
		try {
			res.status(200).send(await internalUpstream.getAll(res.locals.access));
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			next(error);
		}
	})
	.post(async (req, res, next) => {
		try {
			res.status(201).send(await internalUpstream.create(res.locals.access, req.body || {}));
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			res.status(error.status || 400).send({ error: { code: 400, message: error.message } });
		}
	});

router
	.route("/:id")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.put(async (req, res, next) => {
		try {
			const data = { ...(req.body || {}), id: Number.parseInt(req.params.id, 10) };
			res.status(200).send(await internalUpstream.update(res.locals.access, data));
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			res.status(error.status || 400).send({ error: { code: 400, message: error.message } });
		}
	})
	.delete(async (req, res, next) => {
		try {
			await internalUpstream.delete(res.locals.access, { id: Number.parseInt(req.params.id, 10) });
			res.status(200).send({ deleted: true });
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			res.status(error.status || 400).send({ error: { code: 400, message: error.message } });
		}
	});

export default router;
