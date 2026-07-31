import { migrate as logger } from "../logger.js";

const migrateName = "create_license_crl";

/**
 * Migrate — cache for the signed licence revocation list (CRL).
 *
 * Lives in the database rather than on disk so that in an HA cluster every node
 * shares the same view: one node fetching the list is enough, and a node that
 * was offline during a fetch still sees the current state on the shared
 * Postgres instead of silently trusting a stale local copy.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.createTable("license_crl", (table) => {
			table.increments().primary();
			// Monotonic counter from the publisher. A list with a lower serial than
			// the cached one is a rollback attempt and gets rejected.
			table.integer("serial").notNullable().defaultTo(0);
			table.bigInteger("issued_at").notNullable().defaultTo(0);
			// The verified payload, stored as received.
			table.text("payload").notNullable().defaultTo("");
			// When we last successfully verified a list — drives the staleness hint.
			table.bigInteger("fetched_at").notNullable().defaultTo(0);
			table.string("source").notNullable().defaultTo("");
		})
		.then(() => {
			logger.info(`[${migrateName}] license_crl Table created`);
			return knex("license_crl").insert({ id: 1, serial: 0, issued_at: 0, payload: "", fetched_at: 0, source: "" });
		})
		.then(() => {
			logger.info(`[${migrateName}] license_crl seeded`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTable("license_crl").then(() => {
		logger.info(`[${migrateName}] license_crl Table dropped`);
	});
};

export { up, down };
