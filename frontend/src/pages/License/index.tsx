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
			setMsg(`Enterprise aktiviert — lizenziert für ${info.licensedTo || "dich"}.`);
			setKey("");
			refetch();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Aktivierung fehlgeschlagen");
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
									Enterprise aktiv
								</span>
								<span className="text-muted">
									lizenziert für <strong>{license.licensedTo}</strong>
									{license.email ? ` (${license.email})` : ""}
									{license.expires
										? ` · gültig bis ${new Date(license.expires).toLocaleDateString()}`
										: " · unbegrenzt"}
								</span>
							</div>
							<p className="text-muted">
								Alle Enterprise-Funktionen (Hochverfügbarkeit, Mehrbenutzer, Zugriffsprotokoll) sind
								freigeschaltet.
							</p>
							<button type="button" className="btn btn-outline-danger" onClick={remove} disabled={busy}>
								Lizenz entfernen
							</button>
						</>
					) : (
						<>
							<div className="mb-2">
								<span className="badge bg-secondary-lt">Free</span>
							</div>
							<p className="text-muted mb-2">
								Enterprise-Funktionen (Hochverfügbarkeit, Mehrbenutzer, Zugriffsprotokoll) sind gesperrt.
								Gib deinen Lizenzschlüssel ein, um sie freizuschalten.
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
								<strong>Nutzt du NexProxy privat / im Homelab?</strong> Dann bekommst du einen Lizenzschlüssel{" "}
								<strong>kostenlos</strong>. Schreib einfach an{" "}
								<a href="mailto:justin@justfuture.at?subject=NexProxy%20Enterprise%20Key%20(Homelab)">
									justin@justfuture.at
								</a>{" "}
								mit dem Hinweis, dass du ihn fürs Homelab brauchst.
							</div>
							<label className="form-label">Lizenzschlüssel</label>
							<textarea
								className="form-control mb-2"
								rows={3}
								value={key}
								onChange={(e) => setKey(e.target.value)}
								placeholder="Hier den Schlüssel einfügen…"
							/>
							<button
								type="button"
								className="btn btn-primary"
								onClick={activate}
								disabled={busy || !key.trim()}
							>
								Aktivieren
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
