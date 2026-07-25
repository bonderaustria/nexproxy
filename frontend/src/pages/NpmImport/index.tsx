import { IconCheck, IconX } from "@tabler/icons-react";
import { type ChangeEvent, useEffect, useState } from "react";
import {
	previewNpmImport,
	startNpmImportSsh,
	startNpmImportUpload,
	type NpmImportPreview,
} from "src/api/backend";
import { useNpmImportStatus } from "src/hooks";

const HEADLINE_LABELS: Record<string, string> = {
	users: "Nutzer",
	certificates: "Zertifikate",
	accessLists: "Zugriffslisten",
	proxyHosts: "Proxy-Hosts",
	redirectionHosts: "Weiterleitungen",
	deadHosts: "404-Hosts",
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
			setError(e instanceof Error ? e.message : "Vorschau fehlgeschlagen");
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
			setError(e instanceof Error ? e.message : "Import konnte nicht gestartet werden");
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
			setError(e instanceof Error ? e.message : "Import konnte nicht gestartet werden");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div>
			<h2>Migration von Nginx Proxy Manager</h2>

			<div className="card mb-3">
				<div className="card-body">
					<p className="text-muted mb-0">
						NexProxy ist ein Fork von Nginx Proxy Manager — die Datenbank hat dasselbe Format. Proxy-Hosts,
						Zertifikate, Zugriffslisten und Nutzer deiner alten Instanz können direkt übernommen werden. Schon
						vorhandene Daten in NexProxy bleiben erhalten, die importierten Daten werden ergänzt (keine
						Duplikate bei Kollisionen, neue IDs werden automatisch vergeben).
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
								Von laufender Instanz (SSH)
							</button>
						</li>
						<li className="nav-item">
							<button
								type="button"
								className={`nav-link ${mode === "upload" ? "active" : ""}`}
								onClick={() => setMode("upload")}
							>
								Aus Datenbank-Datei
							</button>
						</li>
					</ul>
				</div>
				<div className="card-body">
					{mode === "ssh" ? (
						<>
							<p className="text-muted">
								Zugangsdaten der alten Instanz (Nginx Proxy Manager oder NexProxy). Certifikate werden bei
								diesem Weg automatisch mit übernommen.
							</p>
							<div className="row g-2">
								<div className="col-md-6">
									<label className="form-label">IP-Adresse / Host</label>
									<input className="form-control" value={target.host} onChange={set("host")} placeholder="192.168.20.x" />
								</div>
								<div className="col-md-3">
									<label className="form-label">SSH-Port</label>
									<input className="form-control" value={target.port} onChange={set("port")} />
								</div>
								<div className="col-md-3">
									<label className="form-label">SSH-Benutzer</label>
									<input className="form-control" value={target.username} onChange={set("username")} />
								</div>
								<div className="col-md-6">
									<label className="form-label">SSH-Key (bevorzugt)</label>
									<textarea className="form-control" rows={3} value={target.privateKey} onChange={set("privateKey")} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
								</div>
								<div className="col-md-6">
									<label className="form-label">…oder Passwort</label>
									<input className="form-control" type="password" value={target.password} onChange={set("password")} />
								</div>
							</div>
							<div className="mt-3">
								<button type="button" className="btn me-2" onClick={doPreview} disabled={busy || running}>
									1. Vorschau
								</button>
								<button
									type="button"
									className="btn btn-primary"
									onClick={startSsh}
									disabled={busy || running || !preview}
									title={!preview ? "Erst Vorschau laden" : ""}
								>
									2. Import starten
								</button>
								{!preview && !busy && (
									<div className="text-muted small mt-2">
										„Import starten" wird aktiv, sobald die Vorschau erfolgreich geladen wurde — klicke
										zuerst auf „Vorschau".
									</div>
								)}
							</div>
						</>
					) : (
						<>
							<p className="text-muted">
								Lade die <code>database.sqlite</code> der alten Instanz hoch (Pfad dort meist{" "}
								<code>/data/database.sqlite</code>). Zertifikate werden auf diesem Weg{" "}
								<strong>nicht</strong> automatisch übernommen — entweder manuell nach{" "}
								<code>/etc/letsencrypt</code> kopieren oder nach dem Import neu ausstellen lassen.
							</p>
							<input
								type="file"
								accept=".sqlite,.db"
								className="form-control mb-3"
								onChange={(e) => setFile(e.target.files?.[0] || null)}
							/>
							<button type="button" className="btn btn-primary" onClick={startUpload} disabled={busy || running || !file}>
								Import starten
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
						{job.error && <div className="alert alert-danger mt-2 mb-0">Fehler: {job.error}</div>}
						{job.done && (
							<div className="alert alert-success mt-2 mb-0">
								Import abgeschlossen.{" "}
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
