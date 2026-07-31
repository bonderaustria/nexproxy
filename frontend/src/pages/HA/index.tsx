import { IconCheck, IconServer, IconX } from "@tabler/icons-react";
import { PageTitle } from "src/components";
import { type ChangeEvent, useEffect, useState } from "react";
import { changeHAVip, forceHAFailover, startHAProvision, updateHANode } from "src/api/backend";
import {
	useHALatestVersion,
	useHAProvisionStatus,
	useHAStatus,
	useHAUpdateLog,
	useHAVipChangeStatus,
} from "src/hooks";

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
	if (secs < 60) return `${secs}s ago`;
	if (secs < 3600) return `${Math.floor(secs / 60)}min ago`;
	return `${Math.floor(secs / 3600)}h ago`;
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
	const [updatingNode, setUpdatingNode] = useState<string | null>(null);
	const { data: updateLog } = useHAUpdateLog(updatingNode, !!updatingNode);
	const doUpdate = async (node: string) => {
		setActionMsg(null);
		setBusy(true);
		try {
			await updateHANode(node);
			setActionMsg(`Update started on “${node}” — the node will restart on the new build shortly.`);
			setUpdatingNode(node);
		} catch (e) {
			setActionMsg(e instanceof Error ? e.message : "Update failed");
		} finally {
			setBusy(false);
		}
	};
	const doFailover = async () => {
		setActionMsg(null);
		setBusy(true);
		try {
			const r = await forceHAFailover();
			setActionMsg(`Failover triggered — the floating IP is moving away from “${r.failedOverFrom}”.`);
		} catch (e) {
			setActionMsg(e instanceof Error ? e.message : "Failover failed");
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
			setStartError(e instanceof Error ? e.message : "Could not start");
		}
	};

	// ---- Change floating IP ----
	const [newVip, setNewVip] = useState("");
	const [vipChanging, setVipChanging] = useState(false);
	const [vipStartError, setVipStartError] = useState<string | null>(null);
	const { data: vipJob } = useHAVipChangeStatus(vipChanging);

	useEffect(() => {
		if (vipJob && (vipJob.done || vipJob.error)) {
			setVipChanging(false);
		}
	}, [vipJob]);

	const startVipChange = async () => {
		setVipStartError(null);
		try {
			await changeHAVip(newVip);
			setVipChanging(true);
		} catch (e) {
			setVipStartError(e instanceof Error ? e.message : "Could not start");
		}
	};

	const sshFields = (prefix: "db" | "node" | "primary", label: string, hint: string) => (
		<div className="col-md-4">
			<div className="fw-bold">{label}</div>
			<div className="text-muted small mb-2">{hint}</div>
			<label className="form-label">IP address</label>
			<input className="form-control mb-2" value={(prov as any)[`${prefix}Host`]} onChange={setP(`${prefix}Host`)} placeholder="192.168.20.x" />
			<label className="form-label">SSH user</label>
			<input className="form-control mb-2" value={(prov as any)[`${prefix}User`]} onChange={setP(`${prefix}User`)} />
			<label className="form-label">SSH key (preferred)</label>
			<textarea className="form-control mb-2" rows={3} value={(prov as any)[`${prefix}Key`]} onChange={setP(`${prefix}Key`)} placeholder="-----BEGIN OPENSSH PRIVATE KEY-----" />
			<label className="form-label">… or password</label>
			<input className="form-control" type="password" value={(prov as any)[`${prefix}Password`]} onChange={setP(`${prefix}Password`)} />
		</div>
	);

	return (
		<div>
			<PageTitle eyebrow="nav.group.system" title="ha-cluster" />

			{/* How it works */}
			<div className="card mb-3">
				<div className="card-header">
					<h3 className="card-title">How high availability works</h3>
				</div>
				<div className="card-body">
					<p>
						NexProxy achieves high availability with two nodes sharing a <strong>floating IP</strong>{" "}
						. If the active node fails, the second takes the IP over within seconds — for your clients
						the address stays the same. Both nodes use <strong>the same PostgreSQL</strong> (configuration in sync)
						and share their certificates over NFS.
					</p>
					<div className="alert alert-info mb-0">
						Easiest path: create three empty containers, start NexProxy on one, enter the credentials of the
						other two below — the rest happens automatically.
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
										This instance runs <strong>standalone</strong> — no HA cluster yet. Use
										“Set up HA automatically” below to form a cluster.
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
										Cluster status could not be loaded (failover in progress?).
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
													⏱ Automatic reclaim in {Math.max(0, Math.ceil((n.holdUntil - now) / 1000))}s
													<br />
													<span className="text-muted">click “Update” now to prevent it</span>
												</div>
											)}
										</td>
										<td>{n.version || "—"}</td>
										<td>{relativeSeen(n.lastSeen)}</td>
										<td>
											{latest && n.version === latest ? (
												<span className="text-green small">✓ up to date ({latest})</span>
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
															? "Active node — force a failover first"
															: "Update to the latest build"
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
										No cluster yet — only this instance is running.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
				{!status?.standalone && (status?.nodes?.length ?? 0) > 1 && (
					<div className="card-body pt-2">
						<div className="text-muted small">
							<strong>Rolling update:</strong> update the <strong>standby</strong> first, then{" "}
							<strong>force failover</strong>, then update the old master. After a force failover you have{" "}
							<strong>60 seconds</strong> to click “Update” on the old master — if you do not, it reclaims
							the floating IP automatically once the window expires (which prevents the IP from ending up
							active nowhere).
						</div>
						{actionMsg && <div className="alert alert-info mt-2 mb-0">{actionMsg}</div>}
						{updatingNode && (
							<div className="card mt-3">
								<div className="card-header">
									<h3 className="card-title">
										Live log: update on “{updatingNode}”
										<span className="spinner-border spinner-border-sm ms-2" />
									</h3>
									<div className="card-actions">
										<button type="button" className="btn btn-sm" onClick={() => setUpdatingNode(null)}>
							Close
										</button>
									</div>
								</div>
								<div className="card-body">
									<pre className="text-muted small mb-0" style={{ maxHeight: 260, overflowY: "auto" }}>
										{updateLog?.log || "Waiting for log …"}
									</pre>
								</div>
							</div>
						)}
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
						Enter the credentials of the three containers. NexProxy connects over SSH and sets everything
						up automatically. An SSH key is preferred; a password works too.
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
							NexProxy installs the components directly on the hosts, which is only possible over SSH. The
							primary host (this server) is needed because failover (keepalived) and the switch to the shared
							database run outside the container; only over SSH can NexProxy set up the floating IP and
							reconfigure and restart this instance.
						</p>
						<p className="mb-0 text-muted small">
							Optional: leave the primary host empty and NexProxy only sets up the database and the second node —
							you then configure the master yourself.
						</p>
					</div>
					<div className="row g-3">
						{sshFields("db", "1. Database host", "NexProxy installs PostgreSQL here, plus the NFS share for the shared certificates.")}
						{sshFields("node", "2. Second node", "The second NexProxy instance and keepalived (standby) are set up here.")}
						{sshFields("primary", "3. Primary host (this server)", "This server becomes the master: keepalived plus the switch to the shared database.")}
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
						{provisioning ? "Setting up …" : "Set up HA automatically"}
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

			{/*
				The "database configuration" block is deliberately no longer rendered.

				It looked like a form that switches the database connection, but it did
				not: the running nodes read their credentials from the container
				environment. A form that pretends to have an effect it does not have is
				worse than no form at all.

				The data itself is kept: auto-provisioning writes it to ha_config, and
				generateConfig() reads it to produce the ready-made docker-compose.yml
				for a manually added node. The GET/POST /api/ha/db-config endpoints are
				unchanged — only the user interface is gone.
			*/}

			{/* Change floating IP */}
			{!status?.standalone && (
				<div className="card mt-3">
					<div className="card-header">
						<h3 className="card-title">Change the floating IP</h3>
					</div>
					<div className="card-body">
						<p className="text-muted mb-2">
							Changes the floating IP on <strong>all nodes at once</strong> (keepalived, container environment and
							the IP watcher) and stores it in the configuration. Unlike a rolling update there is no
							interruption-free path here — the address itself changes, so expect a short outage for
							clients. Afterwards remember any DNS or router entries pointing at the old address
							zeigten.
						</p>
						<div className="row g-2 align-items-end">
							<div className="col-md-4">
								<label className="form-label">Neue Floating-IP</label>
								<input
									className="form-control"
									value={newVip}
									onChange={(e) => setNewVip(e.target.value)}
									placeholder="192.168.20.99"
									disabled={vipChanging}
								/>
							</div>
							<div className="col-md-4">
								<button
									type="button"
									className="btn btn-warning"
									onClick={startVipChange}
									disabled={vipChanging || !newVip}
								>
									{vipChanging ? "Switching …" : "Change the floating IP"}
								</button>
							</div>
						</div>
						{vipStartError && <div className="text-danger mt-2">{vipStartError}</div>}
						{vipJob?.steps?.length ? (
							<ul className="list-unstyled mt-3 mb-0">
								{vipJob.steps.map((s) => (
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
						) : null}
						{vipJob?.error && <div className="alert alert-danger mt-2 mb-0">Fehler: {vipJob.error}</div>}
						{vipJob?.done && (
							<div className="alert alert-success mt-2 mb-0">
								Floating IP successfully changed to {newVip}.
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default HA;
