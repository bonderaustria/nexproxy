import cn from "classnames";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { HasPermission } from "src/components";
import { useShellSearch } from "src/context/ShellSearch";
import { useAuditLogs, useCertificates, useHostReport, useProxyHosts, useTraffic } from "src/hooks";
import { T } from "src/locale";
import { CERTIFICATES, DEAD_HOSTS, PROXY_HOSTS, REDIRECTION_HOSTS, STREAMS, VIEW } from "src/modules/Permissions";
import styles from "./Dashboard.module.css";

/** At or below this many days remaining, the amber pill replaces the green one. */
const EXPIRY_WARN_DAYS = 14;

const daysUntil = (iso: string) => Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);

interface StatProps {
	eyebrow: string;
	value: number | undefined;
	context: React.ReactNode;
	active: boolean;
	to: string;
}

function StatCard({ eyebrow, value, context, active, to }: StatProps) {
	const navigate = useNavigate();
	return (
		<a
			className={styles.statCard}
			href={to}
			onClick={(e) => {
				e.preventDefault();
				navigate(to);
			}}
		>
			<div className={styles.statTop}>
				<span className={styles.eyebrow}>
					<T id={eyebrow} />
				</span>
				<span className={cn(styles.dot, active && styles.dotActive)} aria-hidden="true" />
			</div>
			{/* Beim Laden bleibt die Kachel gleich hoch — ein Platzhalter in der
			    Groesse des Wertes verhindert, dass das Raster springt. */}
			<div className={cn(styles.statValue, value === undefined && styles.skeleton)}>{value ?? "00"}</div>
			<div className={styles.statContext}>{context}</div>
		</a>
	);
}

/**
 * Live traffic. The single number people actually look at on a reverse proxy —
 * how much is going through right now.
 *
 * The curve matters as much as the number: a bare "3 req/s" says nothing about
 * whether that is normal for this installation. Two minutes of history turn it
 * into something you can judge at a glance.
 */
function TrafficCard() {
	const { data } = useTraffic();
	const history = data?.history ?? [];
	const peak = Math.max(1, ...history.map((h) => h.rps));

	// Plain SVG rather than a charting library: one sparkline does not justify
	// pulling in a dependency, and this redraws once a second.
	const points = history
		.map((h, i) => {
			const x = history.length > 1 ? (i / (history.length - 1)) * 100 : 0;
			const y = 100 - (h.rps / peak) * 100;
			return `${x.toFixed(2)},${y.toFixed(2)}`;
		})
		.join(" ");

	return (
		<div className={styles.railCard}>
			<span className={styles.eyebrow}>
				<T id="dashboard.traffic" />
			</span>

			<div
				className={styles.trafficMain}
				title="Requests passing through your proxy hosts. The admin interface, health checks and certificate renewals are not counted."
			>
				<span className={styles.trafficValue}>{data?.requestsPerSecond?.toFixed(1) ?? "0.0"}</span>
				<span className={styles.trafficUnit}>req/s</span>
			</div>

			{history.length > 1 && (
				<svg className={styles.spark} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
					<title>Requests per second over the last two minutes</title>
					<polyline points={points} fill="none" stroke="var(--np-brand-tint)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
				</svg>
			)}

			<div
				className={styles.trafficRow}
				title="Every connection nginx currently holds open — including this admin interface and the cluster health check. nginx reports this as a single figure and cannot break it down."
			>
				<span className={styles.metricName}>
					<T id="dashboard.traffic.connections" />
				</span>
				<span className={styles.metricValue}>{data?.activeConnections ?? 0}</span>
			</div>
			<div className={styles.trafficRow}>
				<span className={styles.metricName}>
					<T id="dashboard.traffic.peak" />
				</span>
				<span className={styles.metricValue}>{peak.toFixed(1)} req/s</span>
			</div>

			{data && !data.available && (
				<div className={styles.trafficWarn}>
					<T id="dashboard.traffic.unavailable" />
				</div>
			)}
		</div>
	);
}

const Dashboard = () => {
	const navigate = useNavigate();
	const { debouncedQuery } = useShellSearch();
	const { data: hostReport } = useHostReport();
	const { data: proxyHosts } = useProxyHosts();
	const { data: certificates } = useCertificates();
	const { data: auditLogs } = useAuditLogs();

	/**
	 * Six most recently changed hosts, filtered by the header search. Filtering
	 * covers domain and destination — the two things an operator actually types
	 * when hunting for a host.
	 */
	const hosts = useMemo(() => {
		const q = debouncedQuery.trim().toLowerCase();
		return (proxyHosts ?? [])
			.filter((h) => {
				if (!q) return true;
				const destination = `${h.forwardHost}:${h.forwardPort}`.toLowerCase();
				return h.domainNames.some((d) => d.toLowerCase().includes(q)) || destination.includes(q);
			})
			.slice()
			.sort((a, b) => new Date(b.modifiedOn).getTime() - new Date(a.modifiedOn).getTime())
			.slice(0, 6);
	}, [proxyHosts, debouncedQuery]);

	const certs = useMemo(
		() =>
			(certificates ?? [])
				.map((c) => ({ name: c.niceName || c.domainNames[0], days: daysUntil(c.expiresOn) }))
				.sort((a, b) => a.days - b.days)
				.slice(0, 3),
		[certificates],
	);

	const activity = useMemo(() => (auditLogs ?? []).slice(0, 4), [auditLogs]);

	const onlineCount = (proxyHosts ?? []).filter((h) => h.enabled).length;
	const disabledCount = (proxyHosts ?? []).length - onlineCount;

	return (
		<div className={styles.page}>
			{/* Traegt den Seitentitel, seit der klebende Kopfbereich entfallen ist.
			    Die Listenseiten bekommen ihn stattdessen aus der Seitenkarte. */}
			<div>
				<span className={styles.pageEyebrow}>
					<T id="nav.group.overview" />
				</span>
				<h1 className={styles.pageTitle}>
					<T id="dashboard" />
				</h1>
			</div>

			<section className={styles.stats}>
				<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
					<StatCard
						eyebrow="proxy-hosts"
						value={hostReport?.proxy}
						active={(hostReport?.proxy ?? 0) > 0}
						to="/nginx/proxy"
						context={`${onlineCount} online · ${disabledCount} disabled`}
					/>
				</HasPermission>
				<HasPermission section={REDIRECTION_HOSTS} permission={VIEW} hideError>
					<StatCard
						eyebrow="redirection-hosts"
						value={hostReport?.redirection}
						active={(hostReport?.redirection ?? 0) > 0}
						to="/nginx/redirection"
						context={(hostReport?.redirection ?? 0) > 0 ? "Redirections active" : "No redirection rules"}
					/>
				</HasPermission>
				<HasPermission section={STREAMS} permission={VIEW} hideError>
					<StatCard
						eyebrow="streams"
						value={hostReport?.stream}
						active={(hostReport?.stream ?? 0) > 0}
						to="/nginx/stream"
						context={(hostReport?.stream ?? 0) > 0 ? "TCP/UDP forwarded" : "No streams"}
					/>
				</HasPermission>
				<HasPermission section={DEAD_HOSTS} permission={VIEW} hideError>
					<StatCard
						eyebrow="dead-hosts"
						value={hostReport?.dead}
						active={(hostReport?.dead ?? 0) > 0}
						to="/nginx/404"
						context={(hostReport?.dead ?? 0) > 0 ? "404 hosts configured" : "No catch-all configured"}
					/>
				</HasPermission>
			</section>

			<section className={styles.body}>
				<HasPermission section={PROXY_HOSTS} permission={VIEW} hideError>
					<div className={styles.tableCard}>
						<div className={styles.cardHeader}>
							<div>
								<div className={styles.cardTitle}>
									<T id="proxy-hosts" />
								</div>
								<div className={styles.cardSubtitle}>
									<T id="dashboard.hosts.subtitle" />
								</div>
							</div>
							<a
								className={styles.cardLink}
								href="/nginx/proxy"
								onClick={(e) => {
									e.preventDefault();
									navigate("/nginx/proxy");
								}}
							>
								<T id="dashboard.hosts.view-all" />
							</a>
						</div>

						<div className={styles.head}>
							<span>Domain</span>
							<span>Destination</span>
							<span>SSL</span>
							<span>Access</span>
							<span>Status</span>
						</div>

						{hosts.length === 0 ? (
							<div className={styles.empty}>
								<T id="dashboard.hosts.empty" />
							</div>
						) : (
							hosts.map((host) => (
								<button
									type="button"
									key={host.id}
									className={styles.bodyRow}
									onClick={() => navigate(`/nginx/proxy?id=${host.id}`)}
								>
									<span className={styles.domain}>{host.domainNames.join(", ")}</span>
									<span className={styles.destination}>
										{host.forwardHost}:{host.forwardPort}
									</span>
									<span className={styles.cell}>{host.certificateId ? "SSL" : "—"}</span>
									<span className={styles.cell}>{host.accessListId ? "List" : "Public"}</span>
									{/* Der Status steht als Text in der Pille, nicht nur als Farbe. */}
									<span className={host.enabled ? styles.pillOnline : styles.pillDisabled}>
										{host.enabled ? "Online" : "Disabled"}
									</span>
								</button>
							))
						)}
					</div>
				</HasPermission>

				<div className={styles.rail}>
					<TrafficCard />

					<HasPermission section={CERTIFICATES} permission={VIEW} hideError>
						<div className={styles.railCard}>
							<div className={styles.railHeader}>
								<span className={styles.eyebrow}>
									<T id="dashboard.certificates" />
								</span>
								<a
									className={styles.cardLink}
									href="/certificates"
									onClick={(e) => {
										e.preventDefault();
										navigate("/certificates");
									}}
								>
									<T id="dashboard.certificates.manage" />
								</a>
							</div>
							{certs.map((c) => (
								<div className={styles.certRow} key={c.name}>
									<span>{c.name}</span>
									{/* Ein abgelaufenes Zertifikat als "-6 d" zu zeigen verlangt vom
									    Leser, das Minuszeichen zu bemerken und zu deuten. Der Zustand
									    ist ein anderer, also bekommt er eine eigene Beschriftung. */}
									{c.days < 0 ? (
										<span className={styles.pillDanger} title={`Expired ${Math.abs(c.days)} days ago`}>
											Expired
										</span>
									) : (
										<span className={c.days <= EXPIRY_WARN_DAYS ? styles.pillWarn : styles.pillOnline}>
											{c.days} d
										</span>
									)}
								</div>
							))}
						</div>
					</HasPermission>

					<div className={styles.railCard}>
						<span className={styles.eyebrow}>
							<T id="dashboard.activity" />
						</span>
						<div className={styles.activity} style={{ marginTop: 14 }}>
							{activity.map((entry) => (
								<div className={styles.activityItem} key={entry.id}>
									<span className={styles.activityDot} aria-hidden="true" />
									<span>
										<span className={styles.activityText}>
											{entry.objectType} {entry.action}
										</span>
										<span className={styles.activityMeta} style={{ display: "block" }}>
											{new Date(entry.createdOn).toLocaleString()} ·{" "}
											{entry.user?.nickname ?? "System"}
										</span>
									</span>
								</div>
							))}
						</div>
					</div>
				</div>
			</section>
		</div>
	);
};

export default Dashboard;
