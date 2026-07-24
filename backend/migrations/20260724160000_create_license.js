import { migrate as logger } from "../logger.js";

const migrateName = "create_license";

/**
 * Migrate — single-row table holding the enterprise license key.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.createTable("license", (table) => {
			table.increments().primary();
			table.text("license_key").notNullable().defaultTo("");
			table.bigInteger("modified_on").notNullable().defaultTo(0);
		})
		.then(() => knex("license").insert({ id: 1 }))
		.then(() => {
			logger.info(`[${migrateName}] license Table created`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTable("license").then(() => {
		logger.info(`[${migrateName}] license Table dropped`);
	});
};

export { up, down };
