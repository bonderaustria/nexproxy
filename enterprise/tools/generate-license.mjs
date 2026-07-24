#!/usr/bin/env node
// Generate a NexProxy enterprise license key.
//
// Usage:
//   node generate-license.mjs <private-key.pem> "<Name>" "<email>" [days-valid]
//
// Example (free homelab key, no expiry):
//   node generate-license.mjs E:/nexproxy-license-private-key.pem "Max Mustermann" "max@example.com"
//
// The resulting key is what a user pastes into NexProxy → Einstellungen → Lizenz.
// Keep the private key secret — anyone with it can issue valid licenses.

import crypto from "node:crypto";
import fs from "node:fs";

const [privPath, name, email, days] = process.argv.slice(2);

if (!privPath || !name) {
	console.error('Usage: node generate-license.mjs <private-key.pem> "<Name>" "<email>" [days-valid]');
	process.exit(1);
}

const privateKey = crypto.createPrivateKey(fs.readFileSync(privPath));

const payloadObj = {
	name,
	email: email || "",
	issued: Date.now(),
};
if (days && Number(days) > 0) {
	payloadObj.expires = Date.now() + Number(days) * 24 * 60 * 60 * 1000;
}

const payload = Buffer.from(JSON.stringify(payloadObj));
const signature = crypto.sign(null, payload, privateKey);

const key = `${payload.toString("base64url")}.${signature.toString("base64url")}`;

console.log("\nLizenzschlüssel für:", name, email ? `<${email}>` : "");
console.log(payloadObj.expires ? `Gültig bis: ${new Date(payloadObj.expires).toISOString()}` : "Unbegrenzt gültig");
console.log("\n" + key + "\n");
