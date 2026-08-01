import { migrate as logger } from "../logger.js";

const migrateName = "proxy_host_advanced_options";

/**
 * Migrate — form-based advanced nginx options per proxy host.
 *
 * Stored as JSON rather than one column per directive: the catalogue in
 * lib/advanced-options.js will keep growing, and every new field would
 * otherwise mean another migration. Validation lives in the API schema.
 *
 * The existing free-text `advanced_config` stays untouched. It is rendered
 * after these options, so it deliberately wins on conflict — it remains the
 * escape hatch for anything the form does not cover.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.table("proxy_host", (table) => {
			table.json("advanced_options").notNullable().defaultTo("{}");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host.advanced_options added`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema
		.table("proxy_host", (table) => {
			table.dropColumn("advanced_options");
		})
		.then(() => {
			logger.info(`[${migrateName}] proxy_host.advanced_options dropped`);
		});
};

export { up, down };
