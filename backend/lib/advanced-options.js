/**
 * Catalogue of the nginx directives that can be configured through the form,
 * plus the code that turns stored values into actual configuration.
 *
 * This file is the single source of truth: the frontend renders its form from
 * the same catalogue (served by GET /api/nginx/advanced-options), so a field and
 * the directive it writes cannot drift apart.
 *
 * Two scopes exist, and the difference matters:
 *
 *   server  — written inside the host's own server block. Safe: a mistake can
 *             only break this one host, and nginx -t catches it first.
 *   http    — written into a separate file that nginx includes at http level.
 *             Rate-limit and cache zones MUST live there; nginx refuses
 *             limit_req_zone inside a server block. The file is per host so a
 *             broken zone still only affects the host that defined it.
 */

const KB = 1024;

/**
 * @typedef {Object} OptionSpec
 * @property {string}  key        Key in the stored JSON
 * @property {string}  group      Grouping for the form
 * @property {string}  label      Field label
 * @property {string}  type       "size" | "duration" | "boolean" | "number" | "text" | "pairs" | "select"
 * @property {string}  [unit]     Unit shown next to the field
 * @property {*}       [nginxDefault] What nginx does when the field is empty
 * @property {string}  help       Tooltip: what it does, and which failure it fixes
 * @property {string}  scope      "server" | "http"
 * @property {string[]} directives Directive names this field writes — used for conflict detection
 */

/** Fields that write plain directives into the server block. */
const SERVER_OPTIONS = [
	// ── Sizes and timeouts ────────────────────────────────────────────────
	{
		key: "clientMaxBodySize",
		group: "limits",
		label: "Maximum request body size",
		type: "size",
		unit: "MB",
		nginxDefault: "1 MB",
		help: "Largest request nginx accepts, which in practice means the largest file that can be uploaded. Uploads above the limit fail with 413 Request Entity Too Large — this is the single most common reason uploads break behind a proxy. Set it to the largest file your application should accept. 0 disables the check entirely.",
		scope: "server",
		directives: ["client_max_body_size"],
		render: (v) => `client_max_body_size ${Number(v) === 0 ? "0" : `${Number(v)}m`};`,
	},
	{
		key: "proxyReadTimeout",
		group: "limits",
		label: "Read timeout",
		type: "duration",
		unit: "s",
		nginxDefault: "60 s",
		help: "How long nginx waits between two reads from your application before giving up with 504 Gateway Timeout. Raise it for long-running requests such as reports, exports or imports. Note that this is the gap between reads, not the total duration of the request.",
		scope: "server",
		directives: ["proxy_read_timeout"],
		render: (v) => `proxy_read_timeout ${Number(v)}s;`,
	},
	{
		key: "proxySendTimeout",
		group: "limits",
		label: "Send timeout",
		type: "duration",
		unit: "s",
		nginxDefault: "60 s",
		help: "How long nginx waits while sending a request to your application. Relevant for large uploads on slow backends.",
		scope: "server",
		directives: ["proxy_send_timeout"],
		render: (v) => `proxy_send_timeout ${Number(v)}s;`,
	},
	{
		key: "proxyConnectTimeout",
		group: "limits",
		label: "Connect timeout",
		type: "duration",
		unit: "s",
		nginxDefault: "60 s",
		help: "How long nginx waits for the connection to your application to be established. Cannot exceed 75 seconds. Lower values make a dead backend fail fast instead of leaving visitors waiting.",
		scope: "server",
		directives: ["proxy_connect_timeout"],
		render: (v) => `proxy_connect_timeout ${Math.min(75, Number(v))}s;`,
	},
	{
		key: "sendTimeout",
		group: "limits",
		label: "Client send timeout",
		type: "duration",
		unit: "s",
		nginxDefault: "60 s",
		help: "How long nginx waits for the visitor's browser to accept data before closing the connection. Only relevant for very slow clients.",
		scope: "server",
		directives: ["send_timeout"],
		render: (v) => `send_timeout ${Number(v)}s;`,
	},

	// ── Buffering ─────────────────────────────────────────────────────────
	{
		key: "proxyBuffering",
		group: "buffering",
		label: "Response buffering",
		type: "boolean",
		nginxDefault: "on",
		help: "With buffering on, nginx collects the response from your application before passing it to the visitor. Turn it OFF for live output: server-sent events, streaming logs, progress bars and chat all appear stuck otherwise, because nginx holds the data back until the buffer is full.",
		scope: "server",
		directives: ["proxy_buffering"],
		render: (v) => `proxy_buffering ${v ? "on" : "off"};`,
	},
	{
		key: "proxyRequestBuffering",
		group: "buffering",
		label: "Request buffering",
		type: "boolean",
		nginxDefault: "on",
		help: "With request buffering on, nginx reads the entire upload before contacting your application. Turn it OFF for very large uploads so they stream straight through instead of landing on the proxy's disk first.",
		scope: "server",
		directives: ["proxy_request_buffering"],
		render: (v) => `proxy_request_buffering ${v ? "on" : "off"};`,
	},
	{
		key: "proxyBufferSize",
		group: "buffering",
		label: "Buffer size for response headers",
		type: "size",
		unit: "KB",
		nginxDefault: "4 or 8 KB",
		help: "Space reserved for the first part of the response, which holds the headers. Raise it when applications send unusually large headers — a common symptom is 502 Bad Gateway with \"upstream sent too big header\" in the error log.",
		scope: "server",
		directives: ["proxy_buffer_size", "proxy_busy_buffers_size"],
		render: (v) => `proxy_buffer_size ${Number(v)}k;\n  proxy_busy_buffers_size ${Number(v) * 2}k;`,
	},

	// ── Compression ───────────────────────────────────────────────────────
	{
		key: "gzip",
		group: "compression",
		label: "Compress responses (gzip)",
		type: "boolean",
		nginxDefault: "off for proxied responses",
		help: "Compresses text responses before sending them, which noticeably speeds up HTML, CSS, JavaScript and JSON over slow connections. Leave it off if your application already compresses, otherwise the work is done twice.",
		scope: "server",
		directives: ["gzip", "gzip_types", "gzip_min_length", "gzip_proxied"],
		render: (v) =>
			v
				? [
						"gzip on;",
						"  gzip_proxied any;",
						"  gzip_min_length 1024;",
						"  gzip_types text/plain text/css text/xml application/json application/javascript application/xml+rss image/svg+xml;",
					].join("\n")
				: "gzip off;",
	},

	// ── Headers ───────────────────────────────────────────────────────────
	{
		key: "requestHeaders",
		group: "headers",
		label: "Additional request headers",
		type: "pairs",
		help: "Headers nginx adds when talking to your application. Useful when an application expects a specific header, for example to know it is running behind a proxy.",
		scope: "server",
		directives: ["proxy_set_header"],
		render: (pairs) =>
			Object.entries(pairs || {})
				.filter(([name]) => name.trim())
				.map(([name, value]) => `proxy_set_header ${name.trim()} "${String(value).replace(/"/g, '\\"')}";`)
				.join("\n  "),
	},
	{
		key: "responseHeaders",
		group: "headers",
		label: "Additional response headers",
		type: "pairs",
		help: "Headers nginx adds to the response sent to visitors. Note that these apply to responses your application produces as well as to error pages.",
		scope: "server",
		directives: ["add_header"],
		render: (pairs) =>
			Object.entries(pairs || {})
				.filter(([name]) => name.trim())
				.map(([name, value]) => `add_header ${name.trim()} "${String(value).replace(/"/g, '\\"')}" always;`)
				.join("\n  "),
	},
	{
		key: "hideHeaders",
		group: "headers",
		label: "Hide response headers",
		type: "text",
		help: "Comma-separated list of headers to strip from your application's response before it reaches visitors. Commonly used for Server and X-Powered-By, which reveal software versions.",
		scope: "server",
		directives: ["proxy_hide_header"],
		render: (v) =>
			String(v)
				.split(",")
				.map((h) => h.trim())
				.filter(Boolean)
				.map((h) => `proxy_hide_header ${h};`)
				.join("\n  "),
	},
	{
		key: "securityHeaders",
		group: "headers",
		label: "Common security headers",
		type: "boolean",
		nginxDefault: "off",
		help: "Adds X-Content-Type-Options, X-Frame-Options and Referrer-Policy with conservative values. X-Frame-Options blocks embedding in frames — turn this off if the site is meant to be embedded somewhere. Deliberately does NOT include a Content-Security-Policy: a wrong CSP breaks applications more reliably than any other header, so that one belongs in the free-text field where you control it.",
		scope: "server",
		directives: ["add_header"],
		render: (v) =>
			v
				? [
						'add_header X-Content-Type-Options "nosniff" always;',
						'  add_header X-Frame-Options "SAMEORIGIN" always;',
						'  add_header Referrer-Policy "strict-origin-when-cross-origin" always;',
					].join("\n")
				: "",
	},
];

/**
 * Fields that need a zone in the http context. These write two things: the zone
 * definition into the host's include file, and the directive that uses it into
 * the server block.
 */
const HTTP_OPTIONS = [
	{
		key: "rateLimit",
		group: "protection",
		label: "Rate limit",
		type: "number",
		unit: "req/s",
		nginxDefault: "no limit",
		help: "Limits how many requests one IP address may make per second. Excess requests are delayed, and rejected with 503 once the burst allowance is used up. Protects login forms and APIs from brute force and scraping. Careful with single-page apps: they can legitimately fire a dozen requests at once, so leave enough burst.",
		scope: "http",
		directives: ["limit_req", "limit_req_zone"],
	},
	{
		key: "rateLimitBurst",
		group: "protection",
		label: "Burst allowance",
		type: "number",
		unit: "requests",
		nginxDefault: "0",
		help: "How many requests above the rate may arrive in a spike before nginx starts rejecting. Loading a normal web page easily triggers ten or more requests at once — a burst that is too small makes ordinary browsing fail.",
		scope: "http",
		directives: ["limit_req"],
	},
	{
		key: "connectionLimit",
		group: "protection",
		label: "Concurrent connections per IP",
		type: "number",
		unit: "connections",
		nginxDefault: "no limit",
		help: "Limits how many connections a single IP may hold open at the same time. Helps against clients that open hundreds of connections. Browsers normally use six to eight per host, so do not go below that.",
		scope: "http",
		directives: ["limit_conn", "limit_conn_zone"],
	},
	{
		key: "cacheEnabled",
		group: "cache",
		label: "Cache responses",
		type: "boolean",
		nginxDefault: "off",
		help: "Stores responses from your application on the proxy and serves repeat requests from there. Takes load off the backend, but a cached page can be shown to the wrong person if the application does not set proper cache headers — never enable this for anything behind a login unless you know the application marks private responses as such.",
		scope: "http",
		directives: ["proxy_cache", "proxy_cache_path"],
	},
	{
		key: "cacheSizeMb",
		group: "cache",
		label: "Cache size",
		type: "size",
		unit: "MB",
		nginxDefault: "100 MB",
		help: "Disk space this host's cache may occupy. Once full, nginx discards the least recently used entries.",
		scope: "http",
		directives: ["proxy_cache_path"],
	},
	{
		key: "cacheValidSeconds",
		group: "cache",
		label: "Cache duration",
		type: "duration",
		unit: "s",
		nginxDefault: "60 s",
		help: "How long a successful response stays cached when the application does not send its own cache headers. Short values keep content fresh, long values take more load off the backend.",
		scope: "http",
		directives: ["proxy_cache_valid"],
	},
];

const ALL_OPTIONS = [...SERVER_OPTIONS, ...HTTP_OPTIONS];

const GROUPS = [
	{ key: "limits", label: "Sizes and timeouts", help: "The usual cause of failed uploads and 504 errors." },
	{ key: "buffering", label: "Buffering", help: "Relevant for streaming, live output and very large uploads." },
	{ key: "compression", label: "Compression" },
	{ key: "headers", label: "Headers" },
	{
		key: "protection",
		label: "Rate limiting",
		help: "Uses a zone in the http context, generated per host.",
	},
	{
		key: "cache",
		label: "Cache",
		help: "Uses a zone in the http context, generated per host. Read the note before enabling.",
	},
];

/** The catalogue as served to the frontend — without the render functions. */
const getSpec = () => ({
	groups: GROUPS,
	options: ALL_OPTIONS.map(({ render, ...rest }) => rest),
});

const hasValue = (v) => v !== undefined && v !== null && v !== "" && !(typeof v === "object" && !Object.keys(v).length);

/**
 * Directives the form would write for the given values. Used to warn about
 * values that are also set in the free-text field, where nginx would silently
 * take the free-text one because it is rendered later.
 */
const directivesFor = (options) => {
	const out = new Set();
	for (const spec of ALL_OPTIONS) {
		if (hasValue(options?.[spec.key])) {
			for (const d of spec.directives) out.add(d);
		}
	}
	return [...out];
};

/**
 * Find directives that appear both in the form values and in the free-text
 * config. Returns the directive names, not line numbers — the point is to tell
 * the operator which setting is being overridden, not to parse nginx.
 */
const findConflicts = (options, advancedConfig) => {
	if (!advancedConfig) return [];
	const text = String(advancedConfig);
	return directivesFor(options).filter((d) => new RegExp(`(^|\\s)${d}\\s`, "m").test(text));
};

/** Directives for the server block. */
const renderServer = (options, hostId) => {
	if (!options) return "";
	const lines = [];
	for (const spec of SERVER_OPTIONS) {
		const value = options[spec.key];
		if (!hasValue(value)) continue;
		const rendered = spec.render(value);
		if (rendered) lines.push(`  ${rendered}`);
	}

	// The http-scoped features also need a directive inside the server block
	// that refers to the generated zone.
	if (hasValue(options.rateLimit)) {
		const burst = Number(options.rateLimitBurst || 0);
		lines.push(`  limit_req zone=nexproxy_rate_${hostId}${burst ? ` burst=${burst} nodelay` : ""};`);
	}
	if (hasValue(options.connectionLimit)) {
		lines.push(`  limit_conn nexproxy_conn_${hostId} ${Number(options.connectionLimit)};`);
	}
	if (options.cacheEnabled) {
		lines.push(`  proxy_cache nexproxy_cache_${hostId};`);
		lines.push(`  proxy_cache_valid 200 301 302 ${Number(options.cacheValidSeconds || 60)}s;`);
		// Without this header nobody can tell whether a response came from the
		// cache, which makes cache problems nearly impossible to diagnose.
		lines.push(`  add_header X-Cache-Status $upstream_cache_status always;`);
	}

	return lines.join("\n");
};

/**
 * The zone definitions for the http context. Returns an empty string when the
 * host needs none, in which case the include file is removed.
 */
const renderZones = (options, hostId) => {
	if (!options) return "";
	const lines = [];
	if (hasValue(options.rateLimit)) {
		lines.push(
			`limit_req_zone $binary_remote_addr zone=nexproxy_rate_${hostId}:10m rate=${Number(options.rateLimit)}r/s;`,
		);
	}
	if (hasValue(options.connectionLimit)) {
		lines.push(`limit_conn_zone $binary_remote_addr zone=nexproxy_conn_${hostId}:10m;`);
	}
	if (options.cacheEnabled) {
		const sizeMb = Number(options.cacheSizeMb || 100);
		lines.push(
			`proxy_cache_path /data/nginx/cache/proxy_host_${hostId} levels=1:2 keys_zone=nexproxy_cache_${hostId}:10m max_size=${sizeMb}m inactive=60m use_temp_path=off;`,
		);
	}
	return lines.length ? `${lines.join("\n")}\n` : "";
};

export default {
	getSpec,
	renderServer,
	renderZones,
	findConflicts,
	directivesFor,
	SERVER_OPTIONS,
	HTTP_OPTIONS,
	GROUPS,
	KB,
};
