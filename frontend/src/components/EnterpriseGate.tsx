import { IconCrown } from "@tabler/icons-react";
import type { ReactNode } from "react";
import { useLicense } from "src/hooks";

interface Props {
	feature: string;
	children: ReactNode;
}

/**
 * Gates an Enterprise-only feature behind a valid license. Without one, shows a
 * locked upgrade state (free homelab keys via justin@justfuture.at) instead of
 * the feature.
 */
export function EnterpriseGate({ feature, children }: Props) {
	const { data: license, isLoading } = useLicense();

	if (isLoading) {
		return null;
	}
	if (license?.enterprise) {
		return <>{children}</>;
	}

	return (
		<div>
			<h2>
				{feature}{" "}
				<span className="badge bg-yellow-lt ms-1">
					<IconCrown size={14} className="me-1" />
					Enterprise
				</span>
			</h2>
			<div className="card" style={{ maxWidth: 760 }}>
				<div className="card-body text-center">
					<IconCrown size={40} style={{ color: "#F0A93B" }} className="mb-2" />
					<h3>Enterprise-Funktion</h3>
					<p className="text-muted">
						<strong>{feature}</strong> is part of NexProxy Enterprise and needs a licence key.
					</p>
					<div
						style={{
							background: "rgba(240,169,59,.1)",
							border: "1px solid rgba(240,169,59,.3)",
							borderRadius: "10px",
							padding: "12px 14px",
							margin: "0 auto 16px",
							maxWidth: 560,
						}}
					>
						<strong>Running NexProxy privately or in a homelab?</strong> Then you get a licence key{" "}
						<strong>kostenlos</strong> — schreib an{" "}
						<a href="mailto:justin@justfuture.at?subject=NexProxy%20Enterprise%20Key%20(Homelab)">
							justin@justfuture.at
						</a>
						.
					</div>
					<a href="/license" className="btn btn-primary">
						Enter licence key
					</a>
				</div>
			</div>
		</div>
	);
}
