import { IconCheck, IconCopy, IconServer } from "@tabler/icons-react";
import { type ChangeEvent, useEffect, useState } from "react";
import { generateHAConfig, type HAConfigResult } from "src/api/backend";
import { useHAStatus } from "src/hooks";

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

const CodeBlock = ({ title, code }: { title: string; code: string }) => {
	const [copied, setCopied] = useState(false);
	const copy = () => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1500);
		});
	};
	return (
		<div className="mb-3">
			<div className="d-flex justify-content-between align-items-center mb-1">
				<strong>{title}</strong>
				<button type="button" className="btn btn-sm" onClick={copy}>
					{copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
					<span className="ms-1">{copied ? "Kopiert" : "Kopieren"}</span>
				</button>
			</div>
			<pre className="bg-dark text-white p-3 rounded" style={{ overflowX: "auto" }}>
				<code>{code}</code>
			</pre>
		</div>
	);
};

const HA = () => {
	const { data: status } = useHAStatus();

	const [form, setForm] = useState({
		nodeName: "nexproxy-b",
		role: "backup",
		iface: "eth0",
		vip: "",
		vrid: "51",
		authPass: "",
		dbHost: "",
		dbPort: "5432",
		dbName: "npm",
		dbUser: "npm",
		dbPassword: "",
	});
	const [result, setResult] = useState<HAConfigResult | null>(null);
	const [generating, setGenerating] = useState(false);

	// Prefill from the running cluster's defaults once loaded.
	useEffect(() => {
		if (status?.defaults) {
			setForm((f) => ({
				...f,
				vip: f.vip || status.defaults.vip || "",
				dbHost: f.dbHost || status.defaults.dbHost || "",
				dbPort: String(status.defaults.dbPort || 5432),
				dbName: status.defaults.dbName || "npm",
				dbUser: status.defaults.dbUser || "npm",
			}));
		}
	}, [status?.defaults]);

	const set = (key: string) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
		setForm((f) => ({ ...f, [key]: e.target.value }));

	const generate = async () => {
		setGenerating(true);
		try {
			const res = await generateHAConfig({
				nodeName: form.nodeName,
				role: form.role,
				iface: form.iface,
				vip: form.vip,
				vrid: Number(form.vrid) || 51,
				authPass: form.authPass,
				dbHost: form.dbHost,
				dbPort: Number(form.dbPort) || 5432,
				dbName: form.dbName,
				dbUser: form.dbUser,
				dbPassword: form.dbPassword,
			});
			setResult(res);
		} finally {
			setGenerating(false);
		}
	};

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
						teilen. Fällt der aktive Node aus, übernimmt der zweite Node die IP innerhalb von Sekunden — für
						deine Clients bleibt die Adresse gleich.
					</p>
					<ol className="mb-0">
						<li>
							<strong>Gemeinsame Datenbank:</strong> Beide Nodes nutzen dieselbe PostgreSQL. Dadurch sind
							alle Proxy-Hosts, Zertifikate und Einstellungen automatisch synchron.
						</li>
						<li>
							<strong>Geteilte Zertifikate:</strong> Der Ordner <code>/etc/letsencrypt</code> wird zwischen
							beiden Nodes geteilt (NFS oder Host-Bind-Mount), damit der Standby sofort TLS ausliefern kann.
						</li>
						<li>
							<strong>Floating-IP (keepalived / VRRP):</strong> Der Master hält die VIP. Ein Health-Check
							prüft laufend, ob NexProxy wirklich ausliefert. Schlägt er fehl, wandert die VIP automatisch
							zum Backup.
						</li>
					</ol>
					<div className="alert alert-info mt-3 mb-0">
						Wichtig: Der zweite Node muss auf <strong>dieselbe Datenbank</strong> zeigen — nur so entsteht ein
						echtes Cluster. Der Assistent unten erzeugt dir die passende Konfiguration.
					</div>
				</div>
			</div>

			{/* Cluster status */}
			<div className="card mb-3">
				<div className="card-header">
					<h3 className="card-title">Cluster-Status</h3>
					{status?.vip && (
						<div className="card-actions">
							Floating-IP: <span className="badge bg-blue-lt ms-1">{status.vip}</span>
						</div>
					)}
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
							</tr>
						</thead>
						<tbody>
							{status?.nodes?.length ? (
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
										</td>
										<td>{n.version || "—"}</td>
										<td>{relativeSeen(n.lastSeen)}</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={6} className="text-muted">
										Noch kein Cluster — aktuell läuft nur diese Instanz. Füge unten einen zweiten Node
										hinzu.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{/* Add-node wizard */}
			<div className="card">
				<div className="card-header">
					<h3 className="card-title">Zweiten Node hinzufügen</h3>
				</div>
				<div className="card-body">
					<p className="text-muted">
						Trage die Daten des neuen Nodes ein. Der Assistent erzeugt dir eine fertige{" "}
						<code>docker-compose.yml</code> und die keepalived-Konfiguration zum Kopieren.
					</p>
					<div className="row g-2">
						<div className="col-md-4">
							<label className="form-label">Node-Name</label>
							<input className="form-control" value={form.nodeName} onChange={set("nodeName")} />
						</div>
						<div className="col-md-4">
							<label className="form-label">Rolle</label>
							<select className="form-select" value={form.role} onChange={set("role")}>
								<option value="backup">Backup (Standby)</option>
								<option value="master">Master</option>
							</select>
						</div>
						<div className="col-md-4">
							<label className="form-label">Netzwerk-Interface</label>
							<input className="form-control" value={form.iface} onChange={set("iface")} />
						</div>
						<div className="col-md-4">
							<label className="form-label">Floating-IP (VIP)</label>
							<input className="form-control" value={form.vip} onChange={set("vip")} placeholder="192.168.20.69" />
						</div>
						<div className="col-md-4">
							<label className="form-label">VRRP Router-ID</label>
							<input className="form-control" value={form.vrid} onChange={set("vrid")} />
						</div>
						<div className="col-md-4">
							<label className="form-label">VRRP-Passwort</label>
							<input className="form-control" value={form.authPass} onChange={set("authPass")} />
						</div>
						<div className="col-md-3">
							<label className="form-label">DB-Host</label>
							<input className="form-control" value={form.dbHost} onChange={set("dbHost")} />
						</div>
						<div className="col-md-3">
							<label className="form-label">DB-Port</label>
							<input className="form-control" value={form.dbPort} onChange={set("dbPort")} />
						</div>
						<div className="col-md-3">
							<label className="form-label">DB-Name</label>
							<input className="form-control" value={form.dbName} onChange={set("dbName")} />
						</div>
						<div className="col-md-3">
							<label className="form-label">DB-User</label>
							<input className="form-control" value={form.dbUser} onChange={set("dbUser")} />
						</div>
						<div className="col-md-6">
							<label className="form-label">DB-Passwort</label>
							<input
								className="form-control"
								type="password"
								value={form.dbPassword}
								onChange={set("dbPassword")}
								placeholder="Passwort der gemeinsamen Datenbank"
							/>
						</div>
					</div>
					<button type="button" className="btn btn-primary mt-3" onClick={generate} disabled={generating}>
						{generating ? "Generiere…" : "Konfiguration generieren"}
					</button>

					{result && (
						<div className="mt-4">
							<CodeBlock title="docker-compose.yml (auf dem neuen Node)" code={result.compose} />
							<CodeBlock title="/etc/keepalived/keepalived.conf" code={result.keepalived} />
							<CodeBlock title="/etc/keepalived/check_nexproxy.sh (chmod +x)" code={result.checkScript} />
						</div>
					)}
				</div>
			</div>
		</div>
	);
};

export default HA;
