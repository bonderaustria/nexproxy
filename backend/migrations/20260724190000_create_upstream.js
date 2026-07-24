import { migrate as logger } from "../logger.js";

const migrateName = "create_upstream";

/**
 * Migrate — load balancing: upstreams (a named pool + balancing method) with
 * multiple backend targets, referenced optionally by a proxy_host.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.createTable("upstream", (table) => {
			table.increments().primary();
			table.dateTime("created_on").notNullable();
			table.dateTime("modified_on").notNullable();
			table.integer("owner_user_id").notNullable().unsigned();
			table.integer("is_deleted").notNullable().unsigned().defaultTo(0);
			table.string("name").notNullable();
			table.string("method").notNullable().defaultTo("round_robin"); // round_robin | least_conn
		})
		.then(() =>
			knex.schema.createTable("upstream_server", (table) => {
				table.increments().primary();
				table.integer("upstream_id").unsigned().notNullable();
				table.integer("is_deleted").notNullable().unsigned().defaultTo(0);
				table.string("host").notNullable();
				table.integer("port").unsigned().notNullable();
				table.integer("weight").unsigned().notNullable().defaultTo(1);
				table.integer("enabled").notNullable().unsigned().defaultTo(1);
			}),
		)
		.then(() =>
			knex.schema.alterTable("proxy_host", (table) => {
				table.integer("upstream_id").unsigned().nullable().defaultTo(null);
			}),
		)
		.then(() => {
			logger.info(`[${migrateName}] upstream + upstream_server created, proxy_host.upstream_id added`);
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
	return knex.schema
		.alterTable("proxy_host", (table) => {
			table.dropColumn("upstream_id");
		})
		.then(() => knex.schema.dropTable("upstream_server"))
		.then(() => knex.schema.dropTable("upstream"))
		.then(() => {
			logger.info(`[${migrateName}] upstream tables dropped`);
		});
};

export { up, down };
