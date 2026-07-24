import { migrate as logger } from "../logger.js";

const migrateName = "create_ha_config";

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
		.createTable("ha_config", (table) => {
			table.increments().primary();
			table.string("db_host").notNullable().defaultTo("");
			table.integer("db_port").notNullable().defaultTo(5432);
			table.string("db_name").notNullable().defaultTo("npm");
			table.string("db_user").notNullable().defaultTo("npm");
			table.text("db_password_enc").notNullable().defaultTo("");
			table.string("vip").notNullable().defaultTo("");
			table.tinyint("provisioned").notNullable().defaultTo(0);
			table.bigInteger("modified_on").notNullable().defaultTo(0);
		})
		.then(() => knex("ha_config").insert({ id: 1 }))
		.then(() => {
			logger.info(`[${migrateName}] ha_config Table created`);
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
	return knex.schema.dropTable("ha_config").then(() => {
		logger.info(`[${migrateName}] ha_config Table dropped`);
	});
};

export { up, down };
