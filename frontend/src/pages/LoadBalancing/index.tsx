import { IconCrown, IconPlus, IconTrash } from "@tabler/icons-react";
import { type ChangeEvent, useState } from "react";
import {
	createUpstream,
	deleteUpstream,
	updateUpstream,
	type Upstream,
	type UpstreamServer,
} from "src/api/backend";
import { useUpstreams } from "src/hooks";

const emptyServer = (): UpstreamServer => ({ host: "", port: 80, weight: 1 });

const statusDot = (status?: string) => {
	if (status === "online") return <span className="text-green">● online</span>;
	if (status === "offline") return <span className="text-red">● offline</span>;
	return <span className="text-muted">● unbekannt</span>;
};

const methodLabel = (m: string) => (m === "least_conn" ? "Least Connections" : "Round Robin");

const LoadBalancing = () => {
	const { data: upstreams, refetch } = useUpstreams();
	const [editing, setEditing] = useState<Upstream | null>(null);
	const [creating, setCreating] = useState(false);
	const [name, setName] = useState("");
	const [method, setMethod] = useState("round_robin");
	const [servers, setServers] = useState<UpstreamServer[]>([emptyServer()]);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const startCreate = () => {
		setEditing(null);
		setCreating(true);
		setName("");
		setMethod("round_robin");
		setServers([emptyServer()]);
		setError(null);
	};

	const startEdit = (u: Upstream) => {
		setCreating(false);
		setEditing(u);
		setName(u.name);
		setMethod(u.method);
		setServers(u.servers.length ? u.servers.map((s) => ({ ...s })) : [emptyServer()]);
		setError(null);
	};

	const cancel = () => {
		setCreating(false);
		setEditing(null);
	};

	const setServerField = (idx: number, key: keyof UpstreamServer) => (e: ChangeEvent<HTMLInputElement>) => {
		const value = key === "host" ? e.target.value : Number(e.target.value);
		setServers((prev) => prev.map((s, i) => (i === idx ? { ...s, [key]: value } : s)));
	};

	const addServer = () => setServers((prev) => [...prev, emptyServer()]);
	const removeServer = (idx: number) => setServers((prev) => prev.filter((_, i) => i !== idx));

	const save = async () => {
		setError(null);
		if (!name.trim()) {
			setError("Name ist erforderlich");
			return;
		}
		const validServers = servers.filter((s) => s.host.trim() && s.port);
		if (!validServers.length) {
			setError("Mindestens ein Backend-Ziel ist erforderlich");
			return;
		}
		setBusy(true);
		try {
			if (editing) {
				await updateUpstream(editing.id, { name, method, servers: validServers });
			} else {
				await createUpstream({ name, method, servers: validServers });
			}
			setCreating(false);
			setEditing(null);
			refetch();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Speichern fehlgeschlagen");
		} finally {
			setBusy(false);
		}
	};

	const remove = async (u: Upstream) => {
		setError(null);
		try {
			await deleteUpstream(u.id);
			refetch();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Löschen fehlgeschlagen");
		}
	};

	const showForm = creating || editing;

	return (
		<div>
			<h2>
				Load Balancing{" "}
				<span className="badge bg-yellow-lt ms-1">
					<IconCrown size={14} className="me-1" />
					Enterprise
				</span>
			</h2>

			<div className="card mb-3">
				<div className="card-body">
					<p className="text-muted mb-0">
						Verteile Traffic auf mehrere Backend-Server. Jedes Ziel wird aktiv per TCP geprüft — fällt es aus,
						nimmt NexProxy es automatisch aus der Rotation und holt es zurück, sobald es wieder erreichbar
						ist. Erstelle hier einen Load Balancer und wähle ihn dann beim Proxy-Host als Ziel.
					</p>
				</div>
			</div>

			<div className="card mb-3">
				<div className="card-header">
					<h3 className="card-title">Load Balancer</h3>
					<div className="card-actions">
						<button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>
							<IconPlus size={16} className="me-1" />
							Neuer Load Balancer
						</button>
					</div>
				</div>
				<div className="table-responsive">
					<table className="table card-table table-vcenter">
						<thead>
							<tr>
								<th>Name</th>
								<th>Methode</th>
								<th>Ziele</th>
								<th>Aktion</th>
							</tr>
						</thead>
						<tbody>
							{upstreams?.length ? (
								upstreams.map((u) => (
									<tr key={u.id}>
										<td>{u.name}</td>
										<td>{methodLabel(u.method)}</td>
										<td>
											{u.servers.map((s) => (
												<div key={`${s.host}:${s.port}`} style={{ fontFamily: "monospace", fontSize: 12 }}>
													{s.host}:{s.port} (w={s.weight}) {statusDot(s.status)}
												</div>
											))}
										</td>
										<td>
											<button type="button" className="btn btn-sm me-2" onClick={() => startEdit(u)}>
												Bearbeiten
											</button>
											<button type="button" className="btn btn-sm btn-outline-danger" onClick={() => remove(u)}>
												<IconTrash size={14} />
											</button>
										</td>
									</tr>
								))
							) : (
								<tr>
									<td colSpan={4} className="text-muted">
										Noch keine Load Balancer angelegt.
									</td>
								</tr>
							)}
						</tbody>
					</table>
				</div>
			</div>

			{showForm && (
				<div className="card">
					<div className="card-header">
						<h3 className="card-title">{editing ? `„${editing.name}" bearbeiten` : "Neuer Load Balancer"}</h3>
					</div>
					<div className="card-body">
						<div className="row g-2 mb-3">
							<div className="col-md-6">
								<label className="form-label">Name</label>
								<input className="form-control" value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. app-backend" />
							</div>
							<div className="col-md-6">
								<label className="form-label">Methode</label>
								<select className="form-select" value={method} onChange={(e) => setMethod(e.target.value)}>
									<option value="round_robin">Round Robin</option>
									<option value="least_conn">Least Connections</option>
								</select>
							</div>
						</div>

						<label className="form-label">Backend-Ziele</label>
						{servers.map((s, idx) => (
							<div className="row g-2 mb-2 align-items-center" key={`server-${idx}`}>
								<div className="col-md-5">
									<input className="form-control" value={s.host} onChange={setServerField(idx, "host")} placeholder="IP oder Hostname" />
								</div>
								<div className="col-md-3">
									<input
										className="form-control"
										type="number"
										value={s.port}
										onChange={setServerField(idx, "port")}
										placeholder="Port"
									/>
								</div>
								<div className="col-md-3">
									<input
										className="form-control"
										type="number"
										min={1}
										value={s.weight}
										onChange={setServerField(idx, "weight")}
										placeholder="Gewicht"
									/>
								</div>
								<div className="col-md-1">
									<button
										type="button"
										className="btn btn-sm btn-outline-danger"
										onClick={() => removeServer(idx)}
										disabled={servers.length <= 1}
									>
										<IconTrash size={14} />
									</button>
								</div>
							</div>
						))}
						<button type="button" className="btn btn-sm mb-3" onClick={addServer}>
							<IconPlus size={14} className="me-1" />
							Ziel hinzufügen
						</button>

						{error && <div className="alert alert-danger">{error}</div>}

						<div>
							<button type="button" className="btn btn-primary me-2" onClick={save} disabled={busy}>
								Speichern
							</button>
							<button type="button" className="btn" onClick={cancel} disabled={busy}>
								Abbrechen
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
};

export default LoadBalancing;
