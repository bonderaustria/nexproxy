import { migrate as logger } from "../logger.js";

const migrateName = "create_jwt_keys";

/**
 * Migrate — shared JWT signing key for HA clusters, so a session stays valid
 * across all nodes (no re-login after a failover).
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.createTable("jwt_keys", (table) => {
			table.increments().primary();
			table.text("priv_key").notNullable();
			table.text("pub_key").notNullable();
		})
		.then(() => {
			logger.info(`[${migrateName}] jwt_keys Table created`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTable("jwt_keys").then(() => {
		logger.info(`[${migrateName}] jwt_keys Table dropped`);
	});
};

export { up, down };
