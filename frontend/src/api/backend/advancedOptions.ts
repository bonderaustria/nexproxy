import * as api from "./base";

export interface AdvancedOptionSpec {
	key: string;
	group: string;
	label: string;
	type: "size" | "duration" | "boolean" | "number" | "text" | "pairs" | "select";
	unit?: string;
	nginxDefault?: string;
	help: string;
	scope: "server" | "http";
	directives: string[];
}

export interface AdvancedOptionGroup {
	key: string;
	label: string;
	help?: string;
}

export interface AdvancedOptionsSpec {
	groups: AdvancedOptionGroup[];
	options: AdvancedOptionSpec[];
}

export interface AdvancedOptionsTestResult {
	ok: boolean;
	error?: string;
	/** Directives set in the form as well as in the free-text field. */
	conflicts: string[];
	/** The directives that would end up in the configuration. */
	preview: string;
}

/** The field catalogue. Lives in the backend so form and directive cannot drift apart. */
export async function getAdvancedOptionsSpec(): Promise<AdvancedOptionsSpec> {
	return await api.get({ url: "/nginx/advanced-options" });
}

/** Renders the values and runs nginx -t against them, without touching the live config. */
export async function testAdvancedOptions(
	options: Record<string, any>,
	advancedConfig: string,
): Promise<AdvancedOptionsTestResult> {
	return await api.post({
		url: "/nginx/advanced-options/test",
		data: { options, advancedConfig },
	});
}
