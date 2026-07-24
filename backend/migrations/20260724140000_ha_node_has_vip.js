import { migrate as logger } from "../logger.js";

const migrateName = "ha_node_has_vip";

/**
 * Migrate — add has_vip so nodes can report the real VIP holder (keepalived notify).
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.alterTable("ha_node", (table) => {
			table.tinyint("has_vip").notNullable().defaultTo(0);
		})
		.then(() => {
			logger.info(`[${migrateName}] ha_node.has_vip added`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.alterTable("ha_node", (table) => {
		table.dropColumn("has_vip");
	});
};

export { up, down };
