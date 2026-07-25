import fs from "node:fs";
import path from "node:path";
import { Client } from "ssh2";

const connectOptsFor = (target) => {
	const opts = {
		host: target.host,
		port: target.port || 22,
		username: target.username || "root",
		readyTimeout: 25000,
		algorithms: undefined,
	};
	if (target.privateKey) {
		opts.privateKey = target.privateKey;
		if (target.passphrase) opts.passphrase = target.passphrase;
	} else if (target.password) {
		opts.password = target.password;
	}
	return opts;
};

/**
 * Open an SFTP session and run a callback with it, always closing the
 * connection afterwards (success or failure).
 */
function withSftp(target, fn) {
	return new Promise((resolve, reject) => {
		const conn = new Client();
		conn
			.on("ready", () => {
				conn.sftp((err, sftp) => {
					if (err) {
						conn.end();
						return reject(err);
					}
					Promise.resolve(fn(sftp))
						.then((result) => {
							conn.end();
							resolve(result);
						})
						.catch((fnErr) => {
							conn.end();
							reject(fnErr);
						});
				});
			})
			.on("error", (err) => reject(err))
			.connect(connectOptsFor(target));
	});
}

/**
 * Download a single remote file to a local path.
 */
export function sshDownloadFile(target, remotePath, localPath) {
	return withSftp(
		target,
		(sftp) =>
			new Promise((resolve, reject) => {
				fs.mkdirSync(path.dirname(localPath), { recursive: true });
				sftp.fastGet(remotePath, localPath, (err) => {
					if (err) return reject(err);
					resolve(localPath);
				});
			}),
	);
}

/**
 * Resolve a remote symlink to its real target path (certbot's live/ dir is
 * symlinks into archive/ — we need the real file to download it).
 * @returns {Promise<string|null>} absolute resolved path, or null if not a symlink / missing
 */
export function sshReadlink(target, remotePath) {
	return withSftp(
		target,
		(sftp) =>
			new Promise((resolve) => {
				sftp.readlink(remotePath, (err, resolved) => {
					if (err || !resolved) return resolve(null);
					// Resolve relative symlink targets against the link's own directory.
					resolve(resolved.startsWith("/") ? resolved : path.posix.join(path.posix.dirname(remotePath), resolved));
				});
			}),
	);
}

/**
 * Check whether a remote path exists (file or directory).
 */
export function sshRemoteExists(target, remotePath) {
	return withSftp(
		target,
		(sftp) =>
			new Promise((resolve) => {
				sftp.stat(remotePath, (err) => resolve(!err));
			}),
	);
}

/**
 * Recursively download a remote directory to a local directory (best-effort:
 * skips files that fail rather than aborting the whole transfer, e.g. broken
 * symlinks under /etc/letsencrypt).
 */
export function sshDownloadDir(target, remoteDir, localDir) {
	return withSftp(target, async (sftp) => {
		const readdir = (dir) =>
			new Promise((resolve, reject) => {
				sftp.readdir(dir, (err, list) => (err ? reject(err) : resolve(list)));
			});
		const fastGet = (remote, local) =>
			new Promise((resolve) => {
				fs.mkdirSync(path.dirname(local), { recursive: true });
				sftp.fastGet(remote, local, (err) => resolve(!err));
			});

		let copied = 0;
		const walk = async (remote, local) => {
			let entries;
			try {
				entries = await readdir(remote);
			} catch (_e) {
				return; // unreadable dir — skip
			}
			for (const entry of entries) {
				const remotePath = `${remote}/${entry.filename}`;
				const localPath = path.join(local, entry.filename);
				if (entry.longname.startsWith("d")) {
					await walk(remotePath, localPath);
				} else if (entry.longname.startsWith("-")) {
					if (await fastGet(remotePath, localPath)) copied++;
				}
				// symlinks (l...) are skipped — fastGet doesn't follow them reliably
			}
		};
		await walk(remoteDir, localDir);
		return copied;
	});
}

/**
 * Open an SSH connection and run a single command.
 *
 * @param {Object} target - { host, port?, username, password?, privateKey? }
 * @param {string} command - shell command to run
 * @returns {Promise<{ code: number, output: string }>}
 */
export function sshExec(target, command) {
	return new Promise((resolve, reject) => {
		const conn = new Client();
		let output = "";

		const connectOpts = {
			host: target.host,
			port: target.port || 22,
			username: target.username || "root",
			readyTimeout: 25000,
			// allow older key exchange / host key algos commonly found on fresh Debian
			algorithms: undefined,
		};
		if (target.privateKey) {
			connectOpts.privateKey = target.privateKey;
			if (target.passphrase) connectOpts.passphrase = target.passphrase;
		} else if (target.password) {
			connectOpts.password = target.password;
		}

		conn
			.on("ready", () => {
				conn.exec(command, { pty: false }, (err, stream) => {
					if (err) {
						conn.end();
						return reject(err);
					}
					stream
						.on("close", (code) => {
							conn.end();
							resolve({ code: typeof code === "number" ? code : 0, output });
						})
						.on("data", (d) => {
							output += d.toString();
						})
						.stderr.on("data", (d) => {
							output += d.toString();
						});
				});
			})
			.on("error", (err) => reject(err))
			.connect(connectOpts);
	});
}

/**
 * Verify we can connect and run a trivial command.
 * @returns {Promise<boolean>}
 */
export async function sshTest(target) {
	const res = await sshExec(target, "echo nexproxy-ssh-ok");
	return res.output.includes("nexproxy-ssh-ok");
}
