import { useQuery } from "@tanstack/react-query";
import { useFormikContext } from "formik";
import { useState } from "react";
import {
	type AdvancedOptionSpec,
	type AdvancedOptionsTestResult,
	getAdvancedOptionsSpec,
	testAdvancedOptions,
} from "src/api/backend";
import styles from "./AdvancedOptionsFields.module.css";

/**
 * Ready-made combinations for the situations that come up again and again.
 * These are the cases people otherwise solve by pasting a snippet found in a
 * forum — with a preset they at least see which values are being set and why.
 */
const PRESETS: { label: string; help: string; values: Record<string, any> }[] = [
	{
		label: "Large uploads",
		help: "Raises the body size limit and lets uploads stream straight through instead of being buffered on the proxy first.",
		values: { clientMaxBodySize: 2048, proxyRequestBuffering: false, proxySendTimeout: 600, proxyReadTimeout: 600 },
	},
	{
		label: "Streaming / SSE",
		help: "Turns response buffering off so live output appears immediately, and raises the read timeout so a quiet connection is not dropped.",
		values: { proxyBuffering: false, proxyReadTimeout: 3600 },
	},
	{
		label: "Long-running requests",
		help: "For exports, reports and imports that take minutes to produce a response.",
		values: { proxyReadTimeout: 1800, proxySendTimeout: 1800 },
	},
	{
		label: "Public site",
		help: "Compression, common security headers and a moderate rate limit with enough burst for normal browsing.",
		values: { gzip: true, securityHeaders: true, rateLimit: 20, rateLimitBurst: 40 },
	},
];

const isSet = (v: any) =>
	v !== undefined && v !== null && v !== "" && !(typeof v === "object" && !Object.keys(v || {}).length);

function PairsEditor({ value, onChange }: { value: Record<string, string>; onChange: (v: any) => void }) {
	const entries = Object.entries(value || {});
	const rows = entries.length ? entries : [["", ""]];

	const update = (index: number, name: string, val: string) => {
		const next: Record<string, string> = {};
		rows.forEach(([n, v], i) => {
			const useName = i === index ? name : n;
			const useVal = i === index ? val : v;
			if (useName) next[useName] = useVal;
		});
		onChange(next);
	};

	return (
		<div className={styles.pairs}>
			{rows.map(([name, val], i) => (
				// biome-ignore lint/suspicious/noArrayIndexKey: rows are positional by nature
				<div className={styles.pairRow} key={i}>
					<input
						className="form-control"
						placeholder="Header name"
						value={name}
						onChange={(e) => update(i, e.target.value, String(val))}
					/>
					<input
						className="form-control"
						placeholder="Value"
						value={String(val)}
						onChange={(e) => update(i, name, e.target.value)}
					/>
				</div>
			))}
			<button
				type="button"
				className="btn btn-sm"
				onClick={() => onChange({ ...(value || {}), "": "" })}
				disabled={rows.some(([n]) => !n)}
			>
				+ Add header
			</button>
		</div>
	);
}

function OptionField({
	spec,
	value,
	onChange,
}: {
	spec: AdvancedOptionSpec;
	value: any;
	onChange: (v: any) => void;
}) {
	const [showHelp, setShowHelp] = useState(false);

	return (
		<>
			<div className={styles.field}>
				<div className={styles.labelRow}>
					<span className={styles.label}>{spec.label}</span>
					<button
						type="button"
						className={styles.info}
						title={spec.help}
						aria-label={`Explain ${spec.label}`}
						onClick={() => setShowHelp((v) => !v)}
					>
						?
					</button>
				</div>

				{spec.type === "boolean" ? (
					<label className="form-check form-switch mb-0">
						<input
							className="form-check-input"
							type="checkbox"
							checked={!!value}
							onChange={(e) => onChange(e.target.checked)}
						/>
						<span className="form-check-label">{value ? "On" : "Off"}</span>
					</label>
				) : spec.type === "pairs" ? (
					<PairsEditor value={value || {}} onChange={onChange} />
				) : spec.type === "text" ? (
					<input className="form-control" value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
				) : (
					<div className={styles.inputRow}>
						<input
							className="form-control"
							type="number"
							min={0}
							value={value ?? ""}
							onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
						/>
						{spec.unit && <span className={styles.unit}>{spec.unit}</span>}
					</div>
				)}

				{spec.nginxDefault && <div className={styles.defaultHint}>nginx default: {spec.nginxDefault}</div>}
			</div>
			{showHelp && <div className={styles.helpBox}>{spec.help}</div>}
		</>
	);
}

/**
 * Form for the nginx directives that would otherwise have to be typed into the
 * free-text field. The catalogue comes from the backend, so a field and the
 * directive it writes cannot drift apart.
 */
export function AdvancedOptionsFields() {
	const { values, setFieldValue } = useFormikContext<any>();
	const { data: spec, isLoading } = useQuery({
		queryKey: ["advanced-options-spec"],
		queryFn: getAdvancedOptionsSpec,
		staleTime: 60 * 60 * 1000,
	});

	const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ limits: true });
	const [testing, setTesting] = useState(false);
	const [result, setResult] = useState<AdvancedOptionsTestResult | null>(null);

	const options: Record<string, any> = values.advancedOptions || {};

	const setOption = (key: string, v: any) => {
		const next = { ...options };
		if (v === undefined || v === "" || v === null) {
			delete next[key];
		} else {
			next[key] = v;
		}
		setFieldValue("advancedOptions", next);
		// Any previous result describes values that no longer apply.
		setResult(null);
	};

	const applyPreset = (preset: (typeof PRESETS)[number]) => {
		setFieldValue("advancedOptions", { ...options, ...preset.values });
		setResult(null);
	};

	const runTest = async () => {
		setTesting(true);
		try {
			setResult(await testAdvancedOptions(options, values.advancedConfig || ""));
		} catch (e) {
			setResult({
				ok: false,
				error: e instanceof Error ? e.message : "Test failed",
				conflicts: [],
				preview: "",
			});
		} finally {
			setTesting(false);
		}
	};

	if (isLoading || !spec) return <div className="text-muted">Loading options …</div>;

	const countSet = (groupKey: string) =>
		spec.options.filter((o) => o.group === groupKey && isSet(options[o.key])).length;

	return (
		<div className="mt-3">
			<span className={styles.presetsLabel}>Presets</span>
			<div className={styles.presets}>
				{PRESETS.map((p) => (
					<button type="button" key={p.label} className={styles.preset} title={p.help} onClick={() => applyPreset(p)}>
						{p.label}
					</button>
				))}
			</div>

			{spec.groups.map((group) => {
				const fields = spec.options.filter((o) => o.group === group.key);
				if (!fields.length) return null;
				const open = !!openGroups[group.key];
				const active = countSet(group.key);
				return (
					<div className={styles.group} key={group.key}>
						<button
							type="button"
							className={styles.groupHead}
							aria-expanded={open}
							onClick={() => setOpenGroups((g) => ({ ...g, [group.key]: !g[group.key] }))}
						>
							<span className={styles.caret} aria-hidden="true">
								{open ? "▾" : "▸"}
							</span>
							<span className={styles.groupTitle}>{group.label}</span>
							{group.help && (
								<span className={styles.groupHint} title={group.help}>
									{group.help}
								</span>
							)}
							<span
								className={active ? `${styles.badge} ${styles.badgeActive}` : styles.badge}
								title={active ? `${active} of ${fields.length} options changed` : "All options at their nginx defaults"}
							>
								{active ? `${active} changed` : "Default"}
							</span>
						</button>
						{open && (
							<div className={styles.groupBody}>
								{fields.map((f) => (
									<OptionField key={f.key} spec={f} value={options[f.key]} onChange={(v) => setOption(f.key, v)} />
								))}
							</div>
						)}
					</div>
				);
			})}

			<div className={styles.testBar}>
				<button type="button" className="btn" onClick={runTest} disabled={testing}>
					{testing ? "Testing …" : "Test configuration"}
				</button>
				<span className="text-muted" style={{ fontSize: 12.5 }}>
					Renders these settings and runs <code>nginx -t</code> against them — without touching the live
					configuration.
				</span>
			</div>

			{result?.conflicts?.length ? (
				<div className={styles.conflict}>
					Also set in the free-text field below: <strong>{result.conflicts.join(", ")}</strong>. nginx uses the
					later directive, so the free-text value wins and the value shown here has no effect.
				</div>
			) : null}

			{result && (
				<div className={result.ok ? styles.resultOk : styles.resultBad}>
					{result.ok ? `nginx accepts this configuration.\n\n${result.preview}` : result.error}
				</div>
			)}
		</div>
	);
}
