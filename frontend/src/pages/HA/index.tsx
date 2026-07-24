import { IconCheck, IconEye, IconEyeOff, IconServer, IconX } from "@tabler/icons-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { forceHAFailover, startHAProvision, updateHADbConfig, updateHANode } from "src/api/backend";
import { useHADbConfig, useHALatestVersion, useHAProvisionStatus, useHAStatus } from "src/hooks";

const cmpVersion = (a: string, b: string): number => {
	const pa = a.split(".").map(Number);
	const pb = b.split(".").map(Number);
	for (let i = 0; i < 3; i++) {
		if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
	}
	return 0;
};

const relativeSeen = (ts: number): string => {
	if (!ts) return "—";
	const secs = Math.floor((Date.now() - ts) / 1000);
	if (secs < 60) return `vor ${secs}s`;
	if (secs < 3600) return `vor ${Math.floor(secs / 60)}min`;
	return `vor ${Math.floor(secs / 3600)}h`;
};

const roleBadge = (role: string) => {
	if (role === "master") return <span className="badge bg-blue-lt">Master</span>;
	if (role === "backup") return <span className="badge bg-cyan-lt">Backup</span>;
	return <span className="badge bg-secondary-lt">Standalone</span>;
};

const HA = () => {
	const { data: status, isLoading, isError } = useHAStatus();

	// Ticks every second so the failover-hold countdown updates smoothly
	// (the underlying holdUntil is an absolute timestamp, so this is just for display).
	const [now, setNow] = useState(Date.now());
	useEffect(() => {
		const t = setInterval(() => setNow(Date.now()), 1000);
		return () => clearInterval(t);
	}, []);
	const { data: latestData } = useHALatestVersion();
	const latest = latestData?.latest || null;

	// ---- Rolling update / failover ----
	const [actionMsg, setActionMsg] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const doUpdate = async (node: string) => {
		setActionMsg(null);
		setBusy(true);
		try {
			await updateHANode(node);
			setActionMsg(`Update auf „${node}" gestartet — der Node startet gleich mit dem neuen Stand neu.`);
		} catch (e) {
			setActionMsg(e instanceof Error ? e.message : "Update fehlgeschlagen");
		} finally {
			setBusy(false);
		}
	};
	const doFailover = async () => {
		setActionMsg(null);
		setBusy(true);
		try {
			const r = await forceHAFailover();
			setActionMsg(`Failover ausgelöst — VIP wandert weg von „${r.failedOverFrom}".`);
		} catch (e) {
			setActionMsg(e instanceof Error ? e.message : "Failover fehlgeschlagen");
		} finally {
			setBusy(false);
		}
	};

	// ---- Auto-provisioning ----
	const [prov, setProv] = useState({
		dbHost: "",
		dbUser: "root",
		dbPassword: "",
		dbKey: "",
		nodeHost: "",
		nodeUser: "root",
		nodePassword: "",
		nodeKey: "",
		includePrimary: true,
		primaryHost: "",
		primaryUser: "root",
		primaryPassword: "",
		primaryKey: "",
		vip: "",
		iface: "eth0",
		vrid: "51",
	});
	const [provisioning, setProvisioning] = useState(false);
	const [startError, setStartError] = useState<string | null>(null);
	const { data: job } = useHAProvisionStatus(provisioning);

	const setP = (key: string) => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
		const value = e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value;
		setProv((f) => ({ ...f, [key]: value }));
	};

	useEffect(() => {
		if (job && (job.done || job.error)) {
			setProvisioning(false);
		}
	}, [job]);

	// After a successful setup, send the admin to the floating IP (the stable
	// cluster entry point) so they always land on the active node.
	useEffect(() => {
		if (job?.done && prov.vip) {
			const t = setTimeout(() => {
				window.location.href = `http://${prov.vip}:81`;
			}, 5000);
			return () => clearTimeout(t);
		}
	}, [job?.done, prov.vip]);

	const startProvision = async () => {
		setStartError(null);
		const target = (host: string, user: string, pass: string, key: string) => ({
			host,
			username: user,
			password: pass || undefined,
			privateKey: key || undefined,
		});
		try {
			await startHAProvision({
				dbTarget: target(prov.dbHost, prov.dbUser, prov.dbPassword, prov.dbKey),
				nodeTarget: target(prov.nodeHost, prov.nodeUser, prov.nodePassword, prov.nodeKey),
				primaryTarget: prov.includePrimary
					? target(prov.primaryHost, prov.primaryUser, prov.primaryPassword, prov.primaryKey)
					: undefined,
				dbAddress: prov.dbHost,
				nodeAddress: prov.nodeHost,
				primaryAddress: prov.primaryHost,
				vip: prov.vip,
				iface: prov.iface,
				vrid: Number(prov.vrid) || 51,
			});
			setProvisioning(true);
		} catch (e) {
			setStartError(e instanceof Error ? e.message : "Start fehlgeschlagen");
		}
	};

	// ---- DB config ----
	const { data: dbCfg, refetch: refetchDb } = useHADbConfig();
	const [dbForm, setDbForm] = useState({ dbHost: "", dbPort: "5432", dbName: "npm", dbUser: "npm", dbPassword: "", vip: "" });
	const [showPw, setShowPw] = useState(false);
	const [savedDb, setSavedDb] = useState(false);

	useEffect(() => {
		if (dbCfg) {
			setDbForm({
				dbHost: dbCfg.dbHost,
				dbPort: String(dbCfg.dbPort),
				dbName: dbCfg.dbName,
				dbUser: dbCfg.dbUser,
				dbPassword: dbCfg.dbPassword,
				vip: dbCfg.vip,
			});
		}
	}, [dbCfg]);

	const setDb = (key: string) => (e: ChangeEvent<HTMLInputElement>) =>
		setDbForm((f) => ({ ...f, [key]: e.target.value }));

	const saveDb = async () => {
		await updateHADbConfig({
			dbHost: dbForm.dbHost,
			dbPort: Number(dbForm.dbPort) || 5432,
			dbName: dbForm.dbName,
			dbUser: dbForm.dbUser,
			dbPassword: dbForm.dbPassword,
			vip: dbForm.vip,
		});
		setSavedDb(true);
		setTimeout(() => setSavedDb(false), 2000);
		refetchDb();
	};

	const sshFields = (prefix: "db" | "node" | "primary", label: string, hint: string) => (
		<div className="col-md-4">
			<div className="fw-bold">{label}</div>
			<div className="text-muted small mb-2">{hint}</div>
			<label className="form-label">IP-Adresse</label>
			<input className="form-control mb-2" value={(prov as any)[`${prefix}Host`]} onChange={setP(`${prefix}Host`)} placeholder="192.168.20.x" />
			<label className="form-label">SSH-Benutzer</label>
			<input className="form-control mb-2" value={(prov as any)[`${prefix}User`]} onChange={setP(`${prefix}User`)} />
			<label className="form-label">SSH-Key (bevorzugt)</label>
			<textarea className="form-control mb-2" rows={3} value={(prov as any)[`${prefix}Key`]} onChange={setP(`${prefix}Key`)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
			<label className="form-label">…oder Passwort</label>
			<input className="form-control" type="password" value={(prov as any)[`${prefix}Password`]} onChange={setP(`${prefix}Password`)} />
		</div>
	);

	return (
		<div>
			<h2>HA-Cluster</h2>

			{/* How it works */}
			<div className="card mb-3">
				<div className="card-header">
					<h3 className="card-title">So funktioniert Hochverfügbarkeit</h3>
				</div>
				<div className="card-body">
					<p>
						NexProxy erreicht Hochverfügbarkeit über zwei Nodes, die sich eine <strong>Floating-IP</strong>{" "}
						teilen. Fällt der aktive Node aus, übernimmt der zweite die IP in Sekunden — für deine Clients
						bleibt die Adresse gleich. Beide Nodes nutzen <strong>dieselbe PostgreSQL</strong> (Config synchron)
						und teilen sich die Zertifikate über NFS.
					</p>
					<div className="alert alert-info mb-0">
						Am einfachsten: 3 leere LXCs anlegen, NexProxy auf einem starten, unten die Zugänge der beiden
						anderen eintragen — der Rest passiert automatisch.
					</div>
				</div>
			</div>

			{/* Cluster status */}
			<div className="card mb-3">
				<div className="card-header">
					<h3 className="card-title">Cluster-Status</h3>
					<div className="card-actions">
						{latest && (
							<span className="me-3">
								Neueste Version: <span className="badge bg-green-lt ms-1">{latest}</span>
							</span>
						)}
						{status?.vip && (
							<span className="me-3">
								Floating-IP: <span className="badge bg-blue-lt ms-1">{status.vip}</span>
							</span>
						)}
						{!status?.standalone && (status?.nodes?.length ?? 0) > 1 && (
							<button type="button" className="btn btn-sm btn-warning" onClick={doFailover} disabled={busy}>
								Force Failover
							</button>
						)}
					</div>
				</div>
				<div className="table-responsive">
					<table className="table card-table table-vcenter">
						<thead>
							<tr>
								<th>Node</th>
								<th>Adresse</th>
								<th>Rolle</th>
								<th>Status</th>
								<th>Version</th>
								<th>Zuletzt gesehen</th>
								<th>Aktion</th>
							</tr>
						</thead>
						<tbody>
							{status?.standalone ? (
								<tr>
									<td colSpan={7} className="text-muted">
										Diese Instanz läuft <strong>standalone</strong> — noch kein HA-Cluster. Richte unten
										„HA automatisch einrichten" aus, um ein Cluster zu bilden.
									</td>
								</tr>
							) : isLoading && !status ? (
								<tr>
									<td colSpan={7} className="text-muted">
										Lade Cluster-Status…
									</td>
								</tr>
							) : isError && !status ? (
								<tr>
									<td colSpan={7} className="text-danger">
										Cluster-Status konnte nicht geladen werden (Failover im Gange?).
									</td>
								</tr>
							) : status?.nodes?.length ? (
								status.nodes.map((n) => (
									<tr key={n.name}>
										<td>
											<IconServer size={16} className="me-1" />
											{n.name}
											{n.name === status.activeNode && (
												<span className="badge bg-green-lt ms-2">VIP aktiv</span>
											)}
											{n.isSelf && <span className="badge bg-secondary-lt ms-2">diese Instanz</span>}
										</td>
										<td>{n.address || "—"}</td>
										<td>{roleBadge(n.role)}</td>
										<td>
											{n.online ? (
												<span className="text-green">● online</span>
											) : (
												<span className="text-red">● offline</span>
											)}
											{n.holdUntil > now && (
												<div className="text-orange small mt-1">
													⏱ Auto-Rückkehr in {Math.max(0, Math.ceil((n.holdUntil - now) / 1000))}s
													<br />
													<span className="text-muted">jetzt „Update“ klicken, um es zu verhindern</span>
												</div>
											)}
										</td>
										<td>{n.version || "—"}</td>
										<td>{relativeSeen(n.lastSeen)}</td>
										<td>
											{latest && n.version === latest ? (
												<span className="text-green small">✓ aktuell ({latest})</span>
											) : (
												<button
													type="button"
													className={
														latest && n.version && cmpVersion(n.version, latest) < 0
															? "btn btn-sm btn-primary"
															: "btn btn-sm"
													}
													disabled={busy || n.name === status.activeNode}
													onClick={() => doUpdate(n.name)}
													title={
														n.name === status.activeNode
															? "Aktiver Node — mach zuerst Force Failover"
															: "Auf den neuesten Stand aktualisieren"
													}
												>
													{latest && n.version && cmpVersion(n.version, latest) < 0
														? `Update → ${latest}`
														: "Update"}
												</button>
											)}
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={7} className="text-muted">
										Noch kein Cluster — aktuell läuft nur diese Instanz.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				{!status?.standalone && (status?.nodes?.length ?? 0) > 1 && (
					<div className="card-body pt-2">
						<div className="text-muted small">
							<strong>Rolling-Update:</strong> erst den <strong>Standby</strong> updaten, dann{" "}
							<strong>Force Failover</strong>, dann den alten Master updaten. Nach Force Failover hast du{" "}
							<strong>60 Sekunden</strong>, um „Update" am alten Master zu klicken — tust du das nicht, holt er
							sich die Floating-IP nach Ablauf automatisch zurück (verhindert, dass die VIP versehentlich
							nirgends aktiv ist).
						</div>
						{actionMsg && <div className="alert alert-info mt-2 mb-0">{actionMsg}</div>}
					</div>
				)}
			</div>

			{/* Auto-provisioning wizard */}
			<div className="card mb-3">
				<div className="card-header">
					<h3 className="card-title">HA automatisch einrichten</h3>
				</div>
				<div className="card-body">
					<p className="text-muted">
						Trage die Zugänge der drei LXCs ein. NexProxy verbindet sich per SSH und richtet alles
						automatisch ein. SSH-Key wird bevorzugt, Passwort ist möglich.
					</p>
					<div
						style={{
							background: "rgba(0,95,246,.08)",
							border: "1px solid rgba(0,95,246,.25)",
							borderRadius: "10px",
							padding: "14px 16px",
							marginBottom: "16px",
						}}
					>
						<div className="fw-bold mb-1">Warum braucht NexProxy SSH-Zugang?</div>
						<p className="mb-2 text-secondary">
							NexProxy installiert die Bausteine direkt auf den Hosts — das ist nur per SSH möglich. Den
							Primär-Host (diesen Server) braucht es, weil das Failover (keepalived) und der Umstieg auf die
							gemeinsame Datenbank außerhalb des Containers laufen; nur per SSH kann NexProxy die Floating-IP
							einrichten und diese Instanz umstellen und neu starten.
						</p>
						<p className="mb-0 text-muted small">
							Optional: Lässt du den Primär-Host leer, richtet NexProxy nur Datenbank und zweiten Node ein —
							die Master-Konfiguration machst du dann selbst.
						</p>
					</div>
					<div className="row g-3">
						{sshFields("db", "1. Datenbank-Host", "Hier installiert NexProxy PostgreSQL + die NFS-Freigabe für gemeinsame Zertifikate.")}
						{sshFields("node", "2. Zweiter Node", "Hier wird die zweite NexProxy-Instanz + keepalived (Standby) aufgesetzt.")}
						{sshFields("primary", "3. Primär-Host (dieser Server)", "Dieser Server wird Master: keepalived + Umstieg auf die gemeinsame DB.")}
					</div>
					<div className="row g-2 mt-2">
						<div className="col-md-4">
							<label className="form-label">Floating-IP (VIP)</label>
							<input className="form-control" value={prov.vip} onChange={setP("vip")} placeholder="192.168.20.69" />
						</div>
						<div className="col-md-4">
							<label className="form-label">Netzwerk-Interface</label>
							<input className="form-control" value={prov.iface} onChange={setP("iface")} />
						</div>
						<div className="col-md-4">
							<label className="form-label">VRRP Router-ID</label>
							<input className="form-control" value={prov.vrid} onChange={setP("vrid")} />
						</div>
					</div>
					<button
						type="button"
						className="btn btn-primary mt-3"
						onClick={startProvision}
						disabled={provisioning}
					>
						{provisioning ? "Richte ein…" : "HA automatisch einrichten"}
					</button>
					{startError && <div className="text-danger mt-2">{startError}</div>}

					{job?.steps?.length ? (
						<div className="mt-4">
							<ul className="list-unstyled">
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
							{job.error && <div className="alert alert-danger">Fehler: {job.error}</div>}
							{job.done && <div className="alert alert-success">HA-Cluster erfolgreich eingerichtet.</div>}
						</div>
					) : null}
				</div>
			</div>

			{/* DB config (admin, viewable + editable) */}
			<div className="card">
				<div className="card-header">
					<h3 className="card-title">Datenbank-Konfiguration</h3>
					{dbCfg?.provisioned && (
						<div className="card-actions">
							<span className="badge bg-green-lt">eingerichtet</span>
						</div>
					)}
				</div>
				<div className="card-body">
					<p className="text-muted mb-2">
						Die Zugangsdaten der <strong>gemeinsamen PostgreSQL</strong>, die beide Nodes im HA-Betrieb nutzen.
						Beim automatischen Einrichten werden sie hier gespeichert (Passwort verschlüsselt). Du kannst sie
						einsehen (Passwort mit dem Auge aufdecken) und anpassen — nur für Administratoren.
					</p>
					<div
						style={{
							background: "rgba(0,95,246,.08)",
							border: "1px solid rgba(0,95,246,.25)",
							borderRadius: "10px",
							padding: "14px 16px",
							marginBottom: "16px",
						}}
					>
						<div className="fw-bold mb-1">Wie das Speichern wirkt</div>
						<p className="mb-0 text-secondary">
							Dieses Feld ist zum Einsehen und Festhalten gedacht (Referenz, Backups, Doku). Die laufenden
							Nodes verbinden sich zur Datenbank über ihre Container-Einstellungen — änderst du hier etwas,
							wird der gespeicherte Datensatz aktualisiert. Damit eine geänderte Datenbank auf den Nodes
							greift, müssen sie mit den neuen Werten neu gestartet werden; ein echter Live-DB-Wechsel ist ein
							eigener Schritt.
						</p>
					</div>
					<div className="row g-2">
						<div className="col-md-4">
							<label className="form-label">DB-Host</label>
							<input className="form-control" value={dbForm.dbHost} onChange={setDb("dbHost")} />
						</div>
						<div className="col-md-2">
							<label className="form-label">Port</label>
							<input className="form-control" value={dbForm.dbPort} onChange={setDb("dbPort")} />
						</div>
						<div className="col-md-3">
							<label className="form-label">DB-Name</label>
							<input className="form-control" value={dbForm.dbName} onChange={setDb("dbName")} />
						</div>
						<div className="col-md-3">
							<label className="form-label">Benutzer</label>
							<input className="form-control" value={dbForm.dbUser} onChange={setDb("dbUser")} />
						</div>
						<div className="col-md-6">
							<label className="form-label">Passwort</label>
							<div className="input-group">
								<input
									className="form-control"
									type={showPw ? "text" : "password"}
									value={dbForm.dbPassword}
									onChange={setDb("dbPassword")}
								/>
								<button type="button" className="btn" onClick={() => setShowPw((v) => !v)}>
									{showPw ? <IconEyeOff size={16} /> : <IconEye size={16} />}
								</button>
							</div>
						</div>
						<div className="col-md-6">
							<label className="form-label">Floating-IP</label>
							<input className="form-control" value={dbForm.vip} onChange={setDb("vip")} />
						</div>
					</div>
					<button type="button" className="btn btn-primary mt-3" onClick={saveDb}>
						Speichern
					</button>
					{savedDb && <span className="text-green ms-2">Gespeichert</span>}
				</div>
			</div>
		</div>
	);
};

export default HA;
