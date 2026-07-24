import errs from "../lib/error.js";
import internalNginx from "./nginx.js";
import internalHostMonitor from "./host-monitor.js";
import UpstreamModel from "../models/upstream.js";
import UpstreamServerModel from "../models/upstream_server.js";
import ProxyHostModel from "../models/proxy_host.js";

/**
 * Build the data object handed to the `upstream.conf` nginx template,
 * merging in live health status so an unreachable target is actually taken
 * out of rotation (`down`), not just shown as unhealthy in the UI.
 */
const buildNginxData = (upstream) => ({
	id: upstream.id,
	name: upstream.name,
	method: upstream.method,
	servers: (upstream.servers || [])
		.filter((s) => s.enabled)
		.map((s) => ({
			host: s.host,
			port: s.port,
			weight: s.weight || 1,
			down: internalHostMonitor.getUpstreamServerStatus(s.id) === "offline",
		})),
});

const internalUpstream = {
	/**
	 * @param {Object} access
	 * @returns {Promise}
	 */
	getAll: (_access) => {
		return UpstreamModel.query()
			.where("is_deleted", 0)
			.withGraphFetched("servers")
			.orderBy("name")
			.then((rows) =>
				rows.map((u) => ({
					...u,
					servers: (u.servers || []).map((s) => ({
						...s,
						status: internalHostMonitor.getUpstreamServerStatus(s.id),
					})),
				})),
			);
	},

	/**
	 * @param {Object} access
	 * @param {Object} data - { name, method, servers: [{host, port, weight}] }
	 * @returns {Promise}
	 */
	create: async (access, data) => {
		if (!data.servers || !data.servers.length) {
			throw new errs.ValidationError("At least one backend target is required");
		}
		const row = await UpstreamModel.query().insertAndFetch({
			name: data.name,
			method: data.method === "least_conn" ? "least_conn" : "round_robin",
			owner_user_id: access.token.getUserId(1),
		});
		await UpstreamServerModel.query().insert(
			data.servers.map((s) => ({
				upstream_id: row.id,
				host: s.host,
				port: s.port,
				weight: s.weight || 1,
				enabled: 1,
			})),
		);
		const full = await UpstreamModel.query().where("id", row.id).withGraphFetched("servers").first();
		await internalNginx.generateConfig("upstream", buildNginxData(full));
		await internalNginx.reload();
		return full;
	},

	/**
	 * @param {Object} access
	 * @param {Object} data - { id, name, method, servers }
	 * @returns {Promise}
	 */
	update: async (access, data) => {
		const existing = await UpstreamModel.query().where({ id: data.id, is_deleted: 0 }).first();
		if (!existing) {
			throw new errs.ItemNotFoundError(data.id);
		}
		await UpstreamModel.query()
			.where("id", data.id)
			.patch({
				name: data.name,
				method: data.method === "least_conn" ? "least_conn" : "round_robin",
			});

		if (data.servers) {
			await UpstreamServerModel.query().where("upstream_id", data.id).del();
			if (data.servers.length) {
				await UpstreamServerModel.query().insert(
					data.servers.map((s) => ({
						upstream_id: data.id,
						host: s.host,
						port: s.port,
						weight: s.weight || 1,
						enabled: 1,
					})),
				);
			}
		}

		const full = await UpstreamModel.query().where("id", data.id).withGraphFetched("servers").first();
		await internalNginx.generateConfig("upstream", buildNginxData(full));
		await internalNginx.reload();
		return full;
	},

	/**
	 * @param {Object} access
	 * @param {Object} data - { id }
	 * @returns {Promise}
	 */
	delete: async (access, data) => {
		const inUse = await ProxyHostModel.query().where({ upstream_id: data.id, is_deleted: 0 }).first();
		if (inUse) {
			throw new errs.ValidationError(
				"This load balancer is still used by a proxy host. Switch that host to a single target first.",
			);
		}
		await UpstreamServerModel.query().where("upstream_id", data.id).del();
		await UpstreamModel.query().where("id", data.id).patch({ is_deleted: 1 });
		await internalNginx.deleteConfig("upstream", { id: data.id });
		await internalNginx.reload();
		return true;
	},
};

export default internalUpstream;
