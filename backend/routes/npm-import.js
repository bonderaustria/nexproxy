import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import express from "express";
import internalNpmImport from "../internal/npm-import.js";
import jwtdecode from "../lib/express/jwt-decode.js";
import { debug, express as logger } from "../logger.js";

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

const buildTarget = (b) => ({
	host: b.host,
	port: b.port ? Number(b.port) : 22,
	username: b.username || "root",
	password: b.password || undefined,
	privateKey: b.private_key || undefined,
});

/**
 * POST /api/npm-import/preview — connect and count rows, without importing anything.
 */
router
	.route("/preview")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res, next) => {
		try {
			const counts = await internalNpmImport.preview(buildTarget(req.body || {}));
			res.status(200).send(counts);
		} catch (error) {
			debug(logger, `${req.method.toUpperCase()} ${req.path}: ${error}`);
			res.status(400).send({ error: { code: 400, message: error.message } });
		}
	});

/**
 * POST /api/npm-import/run — start a live SSH-based import (fire and forget).
 */
router
	.route("/run")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res) => {
		if (internalNpmImport.getJob().running) {
			return res.status(409).send({ error: { code: 409, message: "Import läuft bereits" } });
		}
		internalNpmImport.runFromSsh(buildTarget(req.body || {}));
		res.status(202).send({ started: true });
	});

/**
 * POST /api/npm-import/upload — start an import from an uploaded .sqlite file
 * (no SSH needed; certificates are not transferred this way).
 */
router
	.route("/upload")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.post(async (req, res) => {
		if (internalNpmImport.getJob().running) {
			return res.status(409).send({ error: { code: 409, message: "Import läuft bereits" } });
		}
		const file = req.files?.database;
		if (!file) {
			return res.status(400).send({ error: { code: 400, message: "Keine Datei hochgeladen (Feld 'database')" } });
		}
		const tmp = path.join(os.tmpdir(), `npm-import-upload-${Date.now()}.sqlite`);
		fs.writeFileSync(tmp, file.data);
		internalNpmImport.runFromUpload(tmp);
		res.status(202).send({ started: true });
	});

/**
 * GET /api/npm-import/status — poll progress of the running/last import.
 */
router
	.route("/status")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())
	.get((_req, res) => {
		res.status(200).send(internalNpmImport.getJob());
	});

export default router;
