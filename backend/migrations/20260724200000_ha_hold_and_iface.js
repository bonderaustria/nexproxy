import { migrate as logger } from "../logger.js";

const migrateName = "ha_hold_and_iface";

/**
 * Migrate — adds:
 * - ha_node.hold_until: after Force Failover, the old active node is forced to
 *   stay standby for a fixed window (shown as a countdown), then auto-reclaims
 *   the VIP if nobody clicked "Update" in that time.
 * - ha_config.iface: the network interface used for the VIP, needed so a later
 *   "Update" can redeploy the host-side health-check script.
 *
 * @param   {Object} knex
 * @returns {Promise}
 */
const up = (knex) => {
	logger.info(`[${migrateName}] Migrating Up...`);
	return knex.schema
		.alterTable("ha_node", (table) => {
			table.bigInteger("hold_until").notNullable().defaultTo(0);
		})
		.then(() =>
			knex.schema.alterTable("ha_config", (table) => {
				table.string("iface").notNullable().defaultTo("eth0");
			}),
		)
		.then(() => {
			logger.info(`[${migrateName}] ha_node.hold_until + ha_config.iface added`);
		});
};

const down = (knex) => {
	logger.info(`[${migrateName}] Migrating Down...`);
	return knex.schema
		.alterTable("ha_node", (table) => {
			table.dropColumn("hold_until");
		})
		.then(() =>
			knex.schema.alterTable("ha_config", (table) => {
				table.dropColumn("iface");
			}),
		)
		.then(() => {
			logger.info(`[${migrateName}] rollback complete`);
		});
};

export { up, down };
