import { migrate as logger } from "../logger.js";

const migrateName = "create_ha_node_ssh";

/**
 * Migrate — store (encrypted) SSH access per node so the cluster can perform
 * one-click rolling updates and force-failover.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.createTable("ha_node_ssh", (table) => {
			table.increments().primary();
			table.string("node_name").notNullable();
			table.string("host").notNullable().defaultTo("");
			table.integer("port").notNullable().defaultTo(22);
			table.string("username").notNullable().defaultTo("root");
			table.text("password_enc").notNullable().defaultTo("");
			table.text("private_key_enc").notNullable().defaultTo("");
			table.unique(["node_name"]);
		})
		.then(() => {
			logger.info(`[${migrateName}] ha_node_ssh Table created`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTable("ha_node_ssh").then(() => {
		logger.info(`[${migrateName}] ha_node_ssh Table dropped`);
	});
};

export { up, down };
