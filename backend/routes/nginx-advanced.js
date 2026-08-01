import { exec } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import express from "express";
import advancedOptions from "../lib/advanced-options.js";
import jwtdecode from "../lib/express/jwt-decode.js";

const execAsync = promisify(exec);

const router = express.Router({
	caseSensitive: true,
	strict: true,
	mergeParams: true,
});

router
	.route("/advanced-options")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	/**
	 * GET /api/nginx/advanced-options
	 *
	 * The field catalogue: groups, fields, units, defaults and the help text for
	 * each. The frontend renders its form from this, so a field and the directive
	 * it writes cannot drift apart.
	 */
	.get((_req, res) => {
		res.status(200).send(advancedOptions.getSpec());
	});

router
	.route("/advanced-options/test")
	.options((_, res) => res.sendStatus(204))
	.all(jwtdecode())

	/**
	 * POST /api/nginx/advanced-options/test { options, advancedConfig }
	 *
	 * Renders the directives into a throwaway server block and runs nginx -t
	 * against it. Without this, the first sign of a bad value is the host being
	 * disabled after saving, with the reason buried in host.meta.
	 *
	 * Also reports directives set in both the form and the free text: nginx takes
	 * the later one, so the free text silently wins and the form shows a value
	 * that is not in effect.
	 */
	.post(async (req, res) => {
		const body = req.body || {};
		const options = body.options || {};
		const advancedConfig = body.advancedConfig || "";

		const conflicts = advancedOptions.findConflicts(options, advancedConfig);

		// A fixed id keeps the temporary zone names out of the way of real hosts.
		const TEST_ID = "test0";
		const zones = advancedOptions.renderZones(options, TEST_ID);
		const server = advancedOptions.renderServer(options, TEST_ID);

		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "nexproxy-cfgtest-"));
		const file = path.join(dir, "test.conf");

		// Without a matching `user` directive nginx falls back to its compiled-in
		// default, which does not exist in this image: every test would then fail
		// with getpwnam() even when the configuration is perfectly fine. Taking the
		// line from the real configuration keeps the test honest.
		let userLine = "";
		try {
			const realConf = fs.readFileSync("/etc/nginx/nginx.conf", "utf8");
			const match = realConf.match(/^\s*user\s+[^;]+;/m);
			if (match) userLine = match[0].trim();
		} catch (_e) {
			/* fall through — nginx may still be fine without it */
		}

		// A complete but minimal http block: the zones have to be declared outside
		// the server block, exactly as they are in the real configuration.
		const config = [
			userLine,
			"events { worker_connections 64; }",
			"http {",
			zones,
			"  server {",
			"    listen 127.0.0.1:59999;",
			"    server_name nexproxy-config-test;",
			server,
			advancedConfig,
			"    location / { return 204; }",
			"  }",
			"}",
			"",
		].join("\n");

		try {
			fs.writeFileSync(file, config, { encoding: "utf8" });
			// -c uses our file instead of the real configuration, so this cannot
			// disturb the running nginx. -p keeps relative paths inside the temp dir.
			await execAsync(`nginx -t -c ${file} -p ${dir}`, { timeout: 10000 });
			res.status(200).send({ ok: true, conflicts, preview: `${server}\n${advancedConfig}`.trim() });
		} catch (err) {
			// nginx writes its findings to stderr, including the harmless complaint
			// about the log file that every containerised run produces.
			const raw = `${err.stderr || ""}${err.stdout || ""}` || err.message;
			const lines = raw
				.split("\n")
				.filter((l) => l.trim() && !l.includes("/var/log/nginx/error.log") && !l.includes("nginx: [alert]"))
				.map((l) => l.replace(new RegExp(file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"), "config"));
			res.status(200).send({
				ok: false,
				error: lines.join("\n") || "nginx rejected the configuration.",
				conflicts,
				preview: `${server}\n${advancedConfig}`.trim(),
			});
		} finally {
			try {
				fs.rmSync(dir, { recursive: true, force: true });
			} catch (_e) {
				/* temp dir cleanup is best effort */
			}
		}
	});

export default router;
