import { migrate as logger } from "../logger.js";

const migrateName = "create_ha_node";

/**
 * Migrate
 *
 * @see http://knexjs.org/#Schema
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);

	return knex.schema
		.createTable("ha_node", (table) => {
			table.increments().primary();
			table.string("name").notNullable();
			table.string("address").notNullable().defaultTo("");
			table.string("role").notNullable().defaultTo("standalone");
			table.string("version").notNullable().defaultTo("");
			table.bigInteger("last_seen").notNullable().defaultTo(0);
			table.unique(["name"]);
		})
		.then(() => {
			logger.info(`[${migrateName}] ha_node Table created`);
		});
};

/**
 * Undo Migrate
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTable("ha_node").then(() => {
		logger.info(`[${migrateName}] ha_node Table dropped`);
	});
};

export { up, down };
