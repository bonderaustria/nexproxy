// Objection Docs:
// http://vincit.github.io/objection.js/

import { Model } from "objection";
import db from "../db.js";
import { convertBoolFieldsToInt, convertIntFieldsToBool } from "../lib/helpers.js";
import now from "./now_helper.js";
import User from "./user.js";
import UpstreamServer from "./upstream_server.js";

Model.knex(db());

const boolFields = ["is_deleted"];

class Upstream extends Model {
	$beforeInsert() {
		this.created_on = now();
		this.modified_on = now();
	}

	$beforeUpdate() {
		this.modified_on = now();
	}

	$parseDatabaseJson(json) {
		const thisJson = super.$parseDatabaseJson(json);
		return convertIntFieldsToBool(thisJson, boolFields);
	}

	$formatDatabaseJson(json) {
		const thisJson = convertBoolFieldsToInt(json, boolFields);
		return super.$formatDatabaseJson(thisJson);
	}

	static get name() {
		return "Upstream";
	}

	static get tableName() {
		return "upstream";
	}

	static get relationMappings() {
		return {
			owner: {
				relation: Model.HasOneRelation,
				modelClass: User,
				join: {
					from: "upstream.owner_user_id",
					to: "user.id",
				},
				modify: (qb) => {
					qb.where("user.is_deleted", 0);
				},
			},
			servers: {
				relation: Model.HasManyRelation,
				modelClass: UpstreamServer,
				join: {
					from: "upstream.id",
					to: "upstream_server.upstream_id",
				},
				modify: (qb) => {
					qb.where("upstream_server.is_deleted", 0);
				},
			},
		};
	}
}

export default Upstream;
