import cn from "classnames";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { HasPermission } from "src/components";
import { useShellSearch } from "src/context/ShellSearch";
import { useAuditLogs, useCertificates, useHostReport, useProxyHosts, useSystemHealth } from "src/hooks";
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

/** Bytes in eine lesbare Groesse, damit neben dem Prozentwert etwas Greifbares steht. */
const formatBytes = (bytes: number) => {
	const units = ["B", "KB", "MB", "GB", "TB"];
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)} ${units[unit]}`;
};

function Metric({
	label,
	value,
	detail,
	color,
}: {
	label: string;
	value: number;
	detail: string;
	color: string;
}) {
	return (
		<div>
			<div className={styles.metricLabel}>
				<span className={styles.metricName}>
					<T id={label} />
				</span>
				<span className={styles.metricValue}>
					<span className={styles.metricDetail}>{detail}</span> {value} %
				</span>
			</div>
			<div className={styles.track}>
				<div
					className={styles.fill}
					style={{ width: `${Math.min(100, Math.max(0, value))}%`, background: color }}
				/>
			</div>
		</div>
	);
}

const Dashboard = () => {
	const navigate = useNavigate();
	const { debouncedQuery } = useShellSearch();
	const { data: hostReport } = useHostReport();
	const { data: health } = useSystemHealth();
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
						context={`${onlineCount} online · ${disabledCount} deaktiviert`}
					/>
				</HasPermission>
				<HasPermission section={REDIRECTION_HOSTS} permission={VIEW} hideError>
					<StatCard
						eyebrow="redirection-hosts"
						value={hostReport?.redirection}
						active={(hostReport?.redirection ?? 0) > 0}
						to="/nginx/redirection"
						context={(hostReport?.redirection ?? 0) > 0 ? "Weiterleitungen aktiv" : "Keine Weiterleitungen"}
					/>
				</HasPermission>
				<HasPermission section={STREAMS} permission={VIEW} hideError>
					<StatCard
						eyebrow="streams"
						value={hostReport?.stream}
						active={(hostReport?.stream ?? 0) > 0}
						to="/nginx/stream"
						context={(hostReport?.stream ?? 0) > 0 ? "TCP/UDP weitergeleitet" : "Keine Streams"}
					/>
				</HasPermission>
				<HasPermission section={DEAD_HOSTS} permission={VIEW} hideError>
					<StatCard
						eyebrow="dead-hosts"
						value={hostReport?.dead}
						active={(hostReport?.dead ?? 0) > 0}
						to="/nginx/404"
						context={(hostReport?.dead ?? 0) > 0 ? "404-Hosts konfiguriert" : "Kein Catch-all konfiguriert"}
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
							<span>Ziel</span>
							<span>SSL</span>
							<span>Zugriff</span>
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
									<span className={styles.cell}>{host.accessListId ? "Liste" : "Öffentlich"}</span>
									{/* Der Status steht als Text in der Pille, nicht nur als Farbe. */}
									<span className={host.enabled ? styles.pillOnline : styles.pillDisabled}>
										{host.enabled ? "Online" : "Deaktiviert"}
									</span>
								</button>
							))
						)}
					</div>
				</HasPermission>

				<div className={styles.rail}>
					<div className={styles.railCard}>
						<span className={styles.eyebrow}>
							<T id="dashboard.system-health" />
						</span>
						<div className={styles.metrics}>
							<Metric
								label="dashboard.system-health.cpu"
								value={health?.cpuPct ?? 0}
								detail={health ? `${health.cpuCores} ${health.cpuCores === 1 ? "Kern" : "Kerne"}` : ""}
								color="var(--np-brand-tint)"
							/>
							<Metric
								label="dashboard.system-health.memory"
								value={health?.memPct ?? 0}
								detail={health ? `${formatBytes(health.memUsedBytes)} / ${formatBytes(health.memTotalBytes)}` : ""}
								color={(health?.memPct ?? 0) >= 80 ? "var(--np-accent)" : "var(--np-brand-tint)"}
							/>
							{/* Nur anzeigen, wenn der Wert wirklich ermittelt werden konnte —
							    eine erfundene Festplattenauslastung waere schlimmer als keine. */}
							{typeof health?.diskPct === "number" && (
								<Metric
									label="dashboard.system-health.disk"
									value={health.diskPct}
									detail={
										health.diskUsedBytes && health.diskTotalBytes
											? `${formatBytes(health.diskUsedBytes)} / ${formatBytes(health.diskTotalBytes)}`
											: ""
									}
									color={health.diskPct >= 80 ? "var(--np-accent)" : "var(--np-brand-tint)"}
								/>
							)}
						</div>
					{/* Fusszeile entfaellt komplett: die Karte zeigt nur noch echte
						    Messwerte, keine Statusmeldungen. */}
					</div>

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
									<span className={c.days <= EXPIRY_WARN_DAYS ? styles.pillWarn : styles.pillOnline}>
										{c.days} d
									</span>
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
