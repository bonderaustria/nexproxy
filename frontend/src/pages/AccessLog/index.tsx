import { IconCrown } from "@tabler/icons-react";
import { useQuery } from "@tanstack/react-query";
import { type ChangeEvent, useEffect, useState } from "react";
import {
	type AccessLogEntry,
	getAccessLog,
	getAccessLogStats,
	setAccessLogRetention,
} from "src/api/backend";
import { PageTitle } from "src/components";
import { AuthStore } from "src/modules/AuthStore";

const authStore = new AuthStore();

const relTime = (ts: number) => {
	const d = new Date(ts);
	return d.toLocaleString();
};

const statusBadge = (status: number) => {
	let bg = "rgba(0,95,246,.16)";
	let fg = "#2A7BFF";
	if (status >= 500) {
		bg = "rgba(255,107,107,.15)";
		fg = "#FF6B6B";
	} else if (status >= 400) {
		bg = "rgba(240,169,59,.15)";
		fg = "#F0A93B";
	} else if (status >= 200 && status < 300) {
		bg = "rgba(63,214,160,.15)";
		fg = "#2FbE86";
	}
	return (
		<span style={{ padding: "3px 9px", borderRadius: 9999, fontSize: 11, fontWeight: 600, background: bg, color: fg }}>
			{status}
		</span>
	);
};

const PAGE_SIZE = 50;

const AccessLog = () => {
	const [search, setSearch] = useState("");
	const [status, setStatus] = useState("");
	const [hours, setHours] = useState("24");
	const [offset, setOffset] = useState(0);
	const [live, setLive] = useState(false);
	const [liveRows, setLiveRows] = useState<AccessLogEntry[]>([]);
	const [retention, setRetention] = useState("");
	const [savedRetention, setSavedRetention] = useState(false);

	const params = { search, status, hours, limit: PAGE_SIZE, offset };
	const { data, refetch } = useQuery({
		queryKey: ["access-log", params],
		queryFn: () => getAccessLog(params),
		refetchOnWindowFocus: false,
		enabled: !live,
	});
	const { data: stats } = useQuery({
		queryKey: ["access-log-stats"],
		queryFn: getAccessLogStats,
		refetchOnWindowFocus: false,
		refetchInterval: 15000,
	});

	// Live stream via SSE (fetch so we can send the auth header)
	useEffect(() => {
		if (!live) {
			setLiveRows([]);
			return;
		}
		const controller = new AbortController();
		(async () => {
			const res = await fetch("/api/access-log/stream", {
				headers: { Authorization: `Bearer ${authStore.token}` },
				signal: controller.signal,
			});
			const reader = res.body?.getReader();
			if (!reader) return;
			const decoder = new TextDecoder();
			let buf = "";
			while (true) {
				const { value, done } = await reader.read();
				if (done) break;
				buf += decoder.decode(value, { stream: true });
				const parts = buf.split("\n\n");
				buf = parts.pop() || "";
				for (const part of parts) {
					const line = part.split("\n").find((l) => l.startsWith("data:"));
					if (!line) continue;
					try {
						const entry = JSON.parse(line.slice(5).trim());
						setLiveRows((prev) => [entry, ...prev].slice(0, 300));
					} catch (_e) {
						/* ignore */
					}
				}
			}
		})().catch(() => {
			/* aborted */
		});
		return () => controller.abort();
	}, [live]);

	const set = (fn: (v: string) => void) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
		setOffset(0);
		fn(e.target.value);
	};

	const rows = live ? liveRows : data?.rows || [];
	const total = data?.total || 0;

	const saveRetention = async () => {
		await setAccessLogRetention(Number(retention) || 30);
		setSavedRetention(true);
		setTimeout(() => setSavedRetention(false), 2000);
	};

	return (
		<div>
			<PageTitle
				eyebrow="nav.group.overview"
				title="access-log"
				subtitle={
					<span className="badge bg-yellow-lt">
						<IconCrown size={14} className="me-1" />
						Enterprise
					</span>
				}
			/>

			{/* stat strip */}
			<div className="row row-cards mb-3">
				{[
					{ label: "Requests · 24 h", value: stats?.requests24h, color: "#fff" },
					{ label: "Unique IPs", value: stats?.uniqueIps, color: "#fff" },
					{ label: "4xx / 5xx errors", value: stats?.errors, color: "#F0A93B" },
					{ label: "Blocked (403)", value: stats?.blocked, color: "#FF6B6B" },
				].map((s) => (
					<div className="col-sm-6 col-lg-3" key={s.label}>
						<div className="card card-sm">
							<div className="card-body">
								<div style={{ fontSize: 26, fontWeight: 700, color: s.color }}>
									{(s.value ?? 0).toLocaleString()}
								</div>
								<div className="text-muted">{s.label}</div>
							</div>
						</div>
					</div>
				))}
			</div>

			{/* filter bar */}
			<div className="card mb-3">
				<div className="card-body">
					<div className="row g-2 align-items-end">
						<div className="col-md-5">
							<label className="form-label">Search (IP, host or path)</label>
							<input className="form-control" value={search} onChange={set(setSearch)} placeholder="e.g. 203.0.113. or /api" />
						</div>
						<div className="col-md-3">
							<label className="form-label">Status</label>
							<select className="form-select" value={status} onChange={set(setStatus)}>
								<option value="">All</option>
								<option value="ok">Successful only (2xx/3xx)</option>
								<option value="error">Errors only (4xx/5xx)</option>
							</select>
						</div>
						<div className="col-md-2">
							<label className="form-label">Time range</label>
							<select className="form-select" value={hours} onChange={set(setHours)}>
								<option value="1">1 h</option>
								<option value="24">24 h</option>
								<option value="168">7 days</option>
								<option value="720">30 days</option>
							</select>
						</div>
						<div className="col-md-2">
							<button
								type="button"
								className={live ? "btn btn-success w-100" : "btn w-100"}
								onClick={() => setLive((v) => !v)}
							>
								{live ? "● Live on" : "Live off"}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* table */}
			<div className="card">
				<div className="table-responsive">
					<table className="table card-table table-vcenter">
						<thead>
							<tr>
								<th>Time</th>
								<th>Public IP</th>
								<th>Host</th>
								<th>Method</th>
								<th>Path</th>
								<th>Status</th>
							</tr>
						</thead>
						<tbody>
							{rows.length ? (
								rows.map((r) => (
									<tr key={`${r.id}-${r.ts}`}>
										<td className="text-muted" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
											{relTime(r.ts)}
										</td>
										<td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.ip}</td>
										<td style={{ fontFamily: "monospace", fontSize: 12 }}>{r.host}</td>
										<td className="text-muted" style={{ fontFamily: "monospace", fontSize: 11 }}>
											{r.method}
										</td>
										<td className="text-muted text-truncate" style={{ fontFamily: "monospace", fontSize: 12, maxWidth: 320 }}>
											{r.path}
										</td>
										<td>{statusBadge(r.status)}</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={6} className="text-muted">
										No entries yet. As soon as traffic passes through your proxy hosts it shows up here.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				{!live && (
					<div className="card-footer d-flex align-items-center justify-content-between">
						<span className="text-muted">
							{total > 0
								? `Showing ${offset + 1}–${Math.min(offset + PAGE_SIZE, total)} of ${total.toLocaleString()}`
								: "0 entries"}
						</span>
						<div>
							<button
								type="button"
								className="btn btn-sm me-2"
								disabled={offset === 0}
								onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
							>
								‹ Back
							</button>
							<button
								type="button"
								className="btn btn-sm"
								disabled={offset + PAGE_SIZE >= total}
								onClick={() => {
									setOffset(offset + PAGE_SIZE);
									refetch();
								}}
							>
								Next ›
							</button>
						</div>
					</div>
				)}
			</div>

			{/* retention */}
			<div className="card mt-3" style={{ maxWidth: 520 }}>
				<div className="card-body">
					<label className="form-label">Retention (days)</label>
					<div className="input-group">
						<input
							className="form-control"
							type="number"
							value={retention}
							onChange={(e) => setRetention(e.target.value)}
							placeholder="30"
						/>
						<button type="button" className="btn btn-primary" onClick={saveRetention}>
						Save
						</button>
					</div>
					{savedRetention && <span className="text-green small">Gespeichert</span>}
					<div className="text-muted small mt-1">Older entries are deleted automatically.</div>
				</div>
			</div>
		</div>
	);
};

export default AccessLog;
