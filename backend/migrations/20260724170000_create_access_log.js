import { migrate as logger } from "../logger.js";

const migrateName = "create_access_log";

/**
 * Migrate — structured access-log store (fed by the log parser) + retention config.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.createTable("access_log", (table) => {
			table.bigIncrements("id").primary();
			table.string("node_name").notNullable().defaultTo("");
			table.bigInteger("ts").notNullable().defaultTo(0);
			table.string("ip").notNullable().defaultTo("");
			table.string("method").notNullable().defaultTo("");
			table.string("host").notNullable().defaultTo("");
			table.text("path").notNullable().defaultTo("");
			table.integer("status").notNullable().defaultTo(0);
			table.index(["ts"]);
			table.index(["host"]);
			table.index(["status"]);
			table.index(["ip"]);
		})
		.then(() =>
			knex.schema.createTable("access_log_config", (table) => {
				table.increments().primary();
				table.integer("retention_days").notNullable().defaultTo(30);
			}),
		)
		.then(() => knex("access_log_config").insert({ id: 1 }))
		.then(() => {
			logger.info(`[${migrateName}] access_log + access_log_config created`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema
		.dropTable("access_log")
		.then(() => knex.schema.dropTable("access_log_config"))
		.then(() => {
			logger.info(`[${migrateName}] access_log tables dropped`);
		});
};

export { up, down };
