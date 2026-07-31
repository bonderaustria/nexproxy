import { IconCheck, IconX } from "@tabler/icons-react";
import { type ChangeEvent, useEffect, useState } from "react";
import {
	previewNpmImport,
	startNpmImportSsh,
	startNpmImportUpload,
	type NpmImportPreview,
} from "src/api/backend";
import { PageTitle } from "src/components";
import { useNpmImportStatus } from "src/hooks";

const HEADLINE_LABELS: Record<string, string> = {
	users: "Users",
	certificates: "Certificates",
	accessLists: "Access lists",
	proxyHosts: "Proxy hosts",
	redirectionHosts: "Redirections",
	deadHosts: "404 hosts",
	streams: "Streams",
};

const NpmImport = () => {
	const [mode, setMode] = useState<"ssh" | "upload">("ssh");
	const [target, setTarget] = useState({ host: "", port: "22", username: "root", password: "", privateKey: "" });
	const [file, setFile] = useState<File | null>(null);
	const [preview, setPreview] = useState<NpmImportPreview | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [running, setRunning] = useState(false);

	const { data: job } = useNpmImportStatus(running);

	useEffect(() => {
		if (job && (job.done || job.error)) {
			setRunning(false);
		}
	}, [job]);

	const set = (key: keyof typeof target) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
		setTarget((t) => ({ ...t, [key]: e.target.value }));

	const doPreview = async () => {
		setError(null);
		setPreview(null);
		setBusy(true);
		try {
			const p = await previewNpmImport({
				host: target.host,
				port: Number(target.port) || 22,
				username: target.username,
				password: target.password || undefined,
				privateKey: target.privateKey || undefined,
			});
			setPreview(p);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Preview failed");
		} finally {
			setBusy(false);
		}
	};

	const startSsh = async () => {
		setError(null);
		setBusy(true);
		try {
			await startNpmImportSsh({
				host: target.host,
				port: Number(target.port) || 22,
				username: target.username,
				password: target.password || undefined,
				privateKey: target.privateKey || undefined,
			});
			setRunning(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Import could not be started");
		} finally {
			setBusy(false);
		}
	};

	const startUpload = async () => {
		if (!file) return;
		setError(null);
		setBusy(true);
		try {
			await startNpmImportUpload(file);
			setRunning(true);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Import could not be started");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div>
			<PageTitle
				eyebrow="nav.group.system"
				title="Migration von Nginx Proxy Manager"
				rawTitle
				subtitle="NexProxy ist ein Fork von Nginx Proxy Manager — die Datenbank hat dasselbe Format."
			/>

			<div className="card mb-3">
				<div className="card-body">
					<p className="text-muted mb-0">
						Proxy hosts, certificates, access lists and users from your old instance can be carried over
						directly. Data already present in NexProxy is kept; imported data is added alongside it
						(no duplicates on collisions, new ids are assigned automatically).
					</p>
				</div>
			</div>

			<div className="card mb-3">
				<div className="card-header">
					<ul className="nav nav-tabs card-header-tabs">
						<li className="nav-item">
							<button
								type="button"
								className={`nav-link ${mode === "ssh" ? "active" : ""}`}
								onClick={() => setMode("ssh")}
							>
								From a running instance (SSH)
							</button>
						</li>
						<li className="nav-item">
							<button
								type="button"
								className={`nav-link ${mode === "upload" ? "active" : ""}`}
								onClick={() => setMode("upload")}
							>
								From a database file
							</button>
						</li>
					</ul>
				</div>
				<div className="card-body">
					{mode === "ssh" ? (
						<>
							<p className="text-muted">
								Credentials of the old instance (Nginx Proxy Manager or NexProxy). Certificates are carried over
								automatically on this path.
							</p>
							<div className="row g-2">
								<div className="col-md-6">
									<label className="form-label">IP address / host</label>
									<input className="form-control" value={target.host} onChange={set("host")} placeholder="192.168.20.x" />
								</div>
								<div className="col-md-3">
									<label className="form-label">SSH port</label>
									<input className="form-control" value={target.port} onChange={set("port")} />
								</div>
								<div className="col-md-3">
									<label className="form-label">SSH user</label>
									<input className="form-control" value={target.username} onChange={set("username")} />
								</div>
								<div className="col-md-6">
									<label className="form-label">SSH key (preferred)</label>
									<textarea className="form-control" rows={3} value={target.privateKey} onChange={set("privateKey")} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
								</div>
								<div className="col-md-6">
									<label className="form-label">… or password</label>
									<input className="form-control" type="password" value={target.password} onChange={set("password")} />
								</div>
							</div>
							<div className="mt-3">
								<button type="button" className="btn me-2" onClick={doPreview} disabled={busy || running}>
									1. Preview
								</button>
								<button
									type="button"
									className="btn btn-primary"
									onClick={startSsh}
									disabled={busy || running || !preview}
									title={!preview ? "Load the preview first" : ""}
								>
									2. Start import
								</button>
								{!preview && !busy && (
									<div className="text-muted small mt-2">
										“Start import” becomes available once the preview has loaded — click
										“Preview” first.
									</div>
								)}
							</div>
						</>
					) : (
						<>
							<p className="text-muted">
								Upload the <code>database.sqlite</code> of the old instance (usually at{" "}
								<code>/data/database.sqlite</code>). Certificates are{" "}
								<strong>not</strong> carried over on this path — either copy them manually to{" "}
								<code>/etc/letsencrypt</code> or reissue them after the import.
							</p>
							<input
								type="file"
								accept=".sqlite,.db"
								className="form-control mb-3"
								onChange={(e) => setFile(e.target.files?.[0] || null)}
							/>
							<button type="button" className="btn btn-primary" onClick={startUpload} disabled={busy || running || !file}>
								Start import
							</button>
						</>
					)}

					{preview && mode === "ssh" && (
						<div className="row row-cards mt-3">
							{Object.entries(preview).map(([key, value]) => (
								<div className="col-auto" key={key}>
									<div className="card card-sm">
										<div className="card-body text-center px-4">
											<div style={{ fontSize: 22, fontWeight: 700 }}>{value}</div>
											<div className="text-muted small">{HEADLINE_LABELS[key] || key}</div>
										</div>
									</div>
								</div>
							))}
						</div>
					)}

					{error && <div className="alert alert-danger mt-3">{error}</div>}
				</div>
			</div>

			{job?.steps?.length ? (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">Fortschritt</h3>
					</div>
					<div className="card-body">
						<ul className="list-unstyled mb-0">
							{job.steps.map((s) => (
								<li key={s.name} className="mb-2">
									{s.status === "ok" ? (
										<IconCheck size={18} className="text-green me-2" />
									) : s.status === "error" ? (
										<IconX size={18} className="text-red me-2" />
									) : (
										<span className="spinner-border spinner-border-sm me-2" />
									)}
									<strong>{s.name}</strong>
									{s.log && <pre className="text-muted small mt-1 mb-0">{s.log}</pre>}
								</li>
							))}
						</ul>
						{job.error && <div className="alert alert-danger mt-2 mb-0">Error: {job.error}</div>}
						{job.done && (
							<div className="alert alert-success mt-2 mb-0">
								Import complete.{" "}
								{job.summary &&
									Object.entries(job.summary)
										.filter(([, n]) => n > 0)
										.map(([k, n]) => `${k}: ${n}`)
										.join(", ")}
							</div>
						)}
					</div>
				</div>
			) : null}
		</div>
	);
};

export default NpmImport;
