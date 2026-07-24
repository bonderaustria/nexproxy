import { Client } from "ssh2";

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
