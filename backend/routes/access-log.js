import express from "express";
import internalAccessLog from "../internal/access-log.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { isEnterprise } from "../lib/license.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

// The whole access log is an Enterprise feature.
router.use((req, res, next) => {
	if (req.method === "OPTIONS") return next();
	if (!isEnterprise()) {
		return res.status(403).send({
			error: { code: 403, message: "Enterprise-Lizenz erforderlich — das Zugriffsprotokoll ist eine Enterprise-Funktion." },
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
			res.status(200).send(await internalAccessLog.query(req.query));
		} catch (error) {
			next(error);
		}
	});

router
	.route("/stats")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res, next) => {
		try {
			res.status(200).send(await internalAccessLog.stats());
		} catch (error) {
			next(error);
		}
	});

router
	.route("/config")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get(async (_req, res) => {
		res.status(200).send({ retention_days: await internalAccessLog.getRetention() });
	})
	.put(async (req, res) => {
		const days = await internalAccessLog.setRetention((req.body || {}).retention_days);
		res.status(200).send({ retention_days: days });
	});

// Live stream (Server-Sent Events). The frontend reads it via fetch so the
// Authorization header can be sent.
router.get("/stream", jwtdecode(), (req, res) => {
	res.set({
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		Connection: "keep-alive",
		"X-Accel-Buffering": "no",
	});
	if (typeof res.flushHeaders === "function") res.flushHeaders();
	res.write(": connected\n\n");
	internalAccessLog.subscribe(res);
	const keepAlive = setInterval(() => {
		try {
			res.write(": ping\n\n");
		} catch (_e) {
			/* ignore */
		}
	}, 25000);
	req.on("close", () => {
		clearInterval(keepAlive);
		internalAccessLog.unsubscribe(res);
	});
});

export default router;
