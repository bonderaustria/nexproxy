import knexLib from "knex";
import { global as logger } from "../logger.js";

// Runtime/HA tables that must NOT be copied (they belong to each cluster, not the user config).
const SKIP_TABLES = new Set([
	"knex_migrations",
	"knex_migrations_lock",
	"migrations",
	"migrations_lock",
	"ha_node",
	"ha_config",
]);
const CHUNK = 200;

/**
 * Copy all user configuration (proxy hosts, certificates, users, settings, …)
 * from a source SQLite database into an existing PostgreSQL schema.
 *
 * The target schema must already exist (the second node runs the migrations
 * when it boots against the fresh database). FK checks are disabled during the
 * copy and sequences are reset afterwards.
 *
 * @param {Object} args
 * @param {string} args.sqliteFile - path to the source SQLite file
 * @param {Object} args.pg - pg connection { host, port, user, password, database }
 * @returns {Promise<string[]>} list of "table:rowcount" that were copied
 */
export async function copySqliteToPostgres({ sqliteFile, pg }) {
	const src = knexLib({ client: "sqlite3", connection: { filename: sqliteFile }, useNullAsDefault: true });
	const tgt = knexLib({ client: "pg", connection: pg });
	const copied = [];

	try {
		const tblRows = await src.raw("SELECT name FROM sqlite_master WHERE type='table'");
		const tables = tblRows
			.map((r) => r.name)
			.filter((n) => !n.startsWith("sqlite_") && !SKIP_TABLES.has(n));

		await tgt.transaction(async (trx) => {
			await trx.raw("SET session_replication_role = replica");

			for (const t of tables) {
				const existsInTarget = await trx.schema.hasTable(t);
				if (!existsInTarget) continue;
				const rows = await src(t).select();
				await trx(t).del();
				for (let i = 0; i < rows.length; i += CHUNK) {
					await trx(t).insert(rows.slice(i, i + CHUNK));
				}
				copied.push(`${t}:${rows.length}`);
			}

			// Reset sequences so new inserts don't collide with copied ids.
			for (const t of tables) {
				try {
					await trx.raw(
						"SELECT setval(pg_get_serial_sequence(?, 'id'), COALESCE((SELECT MAX(id) FROM ??), 1), true)",
						[t, t],
					);
				} catch (_e) {
					// table has no id column / no sequence — ignore
				}
			}

			await trx.raw("SET session_replication_role = DEFAULT");
		});

		logger.info(`[DataMigrate] Copied ${copied.length} tables from SQLite to PostgreSQL`);
		return copied;
	} finally {
		await src.destroy();
		await tgt.destroy();
	}
}
