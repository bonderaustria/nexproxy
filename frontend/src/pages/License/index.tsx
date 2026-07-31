import { IconCrown } from "@tabler/icons-react";
import { useState } from "react";
import { clearLicense, setLicense } from "src/api/backend";
import { PageTitle } from "src/components";
import { useLicense } from "src/hooks";

const License = () => {
	const { data: license, refetch } = useLicense();
	const [key, setKey] = useState("");
	const [msg, setMsg] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);

	const activate = async () => {
		setMsg(null);
		setError(null);
		setBusy(true);
		try {
			const info = await setLicense(key.trim());
			setMsg(`Enterprise activated — licensed to ${info.licensedTo || "you"}.`);
			setKey("");
			refetch();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Activation failed");
		} finally {
			setBusy(false);
		}
	};

	const remove = async () => {
		setBusy(true);
		try {
			await clearLicense();
			setMsg("Lizenz entfernt.");
			refetch();
		} finally {
			setBusy(false);
		}
	};

	return (
		<div>
			<PageTitle eyebrow="nav.group.system" title="license" />

			<div className="card mb-3" style={{ maxWidth: 760 }}>
				<div className="card-body">
					{license?.enterprise ? (
						<>
							<div className="d-flex align-items-center mb-2">
								<span className="badge bg-yellow-lt me-2">
									<IconCrown size={14} className="me-1" />
									Enterprise active
								</span>
								<span className="text-muted">
									licensed to <strong>{license.licensedTo}</strong>
									{license.email ? ` (${license.email})` : ""}
									{license.expires
										? ` · valid until ${new Date(license.expires).toLocaleDateString()}`
										: " · unlimited"}
								</span>
							</div>
							<p className="text-muted">
								All Enterprise features (high availability, multi-tenancy, access log) are
								unlocked.
							</p>
							<button type="button" className="btn btn-outline-danger" onClick={remove} disabled={busy}>
								Remove licence
							</button>
						</>
					) : (
						<>
							<div className="mb-2">
								<span className="badge bg-secondary-lt">Free</span>
							</div>
							<p className="text-muted mb-2">
								Enterprise features (high availability, multi-tenancy, access log) are locked.
								Enter your licence key to unlock them.
							</p>
							<div
								style={{
									background: "rgba(240,169,59,.1)",
									border: "1px solid rgba(240,169,59,.3)",
									borderRadius: "10px",
									padding: "12px 14px",
									marginBottom: "14px",
								}}
							>
								<strong>Running NexProxy privately or in a homelab?</strong> Then you get a licence key{" "}
								<strong>free of charge</strong>. Just write to{" "}
								<a href="mailto:justin@justfuture.at?subject=NexProxy%20Enterprise%20Key%20(Homelab)">
									justin@justfuture.at
								</a>{" "}
								mentioning that you need it for your homelab.
							</div>
							<label className="form-label">Licence key</label>
							<textarea
								className="form-control mb-2"
								rows={3}
								value={key}
								onChange={(e) => setKey(e.target.value)}
								placeholder="Paste your key here …"
							/>
							<button
								type="button"
								className="btn btn-primary"
								onClick={activate}
								disabled={busy || !key.trim()}
							>
								Activate
							</button>
						</>
					)}
					{msg && <div className="alert alert-success mt-3 mb-0">{msg}</div>}
					{error && <div className="alert alert-danger mt-3 mb-0">{error}</div>}
				</div>
			</div>
		</div>
	);
};

export default License;
