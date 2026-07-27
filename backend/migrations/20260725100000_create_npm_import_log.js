import { migrate as logger } from "../logger.js";

const migrateName = "create_npm_import_log";

/**
 * Migrate — remembers which source rows (by source system + table + original
 * id) have already been imported, so re-running an import (accidental double
 * click, retry after a partial failure) never creates duplicates.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.createTable("npm_import_log", (table) => {
			table.increments().primary();
			table.string("source_key").notNullable();
			table.string("table_name").notNullable();
			table.integer("source_row_id").notNullable();
			table.integer("target_row_id").notNullable();
			table.bigInteger("imported_on").notNullable();
			table.unique(["source_key", "table_name", "source_row_id"]);
		})
		.then(() => {
			logger.info(`[${migrateName}] npm_import_log Table created`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema.dropTable("npm_import_log").then(() => {
		logger.info(`[${migrateName}] npm_import_log Table dropped`);
	});
};

export { up, down };
