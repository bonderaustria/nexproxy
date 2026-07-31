import cn from "classnames";
import { NavLink, useLocation } from "react-router-dom";
import { HasPermission } from "src/components";
import { useAuthState } from "src/context";
import { useHostReport, useUser } from "src/hooks";
import { T } from "src/locale";
import { showChangePasswordModal, showTwoFactorModal, showUserModal } from "src/modals";
import {
	ACCESS_LISTS,
	ADMIN,
	CERTIFICATES,
	DEAD_HOSTS,
	type MANAGE,
	PROXY_HOSTS,
	REDIRECTION_HOSTS,
	type Section,
	STREAMS,
	VIEW,
} from "src/modules/Permissions";
import styles from "./SiteSidebar.module.css";

interface Item {
	to: string;
	label: string;
	/** Key into the host report, for the count bubble. */
	count?: "proxy" | "redirection" | "stream" | "dead";
	permissionSection?: Section | typeof ADMIN;
	permission?: typeof VIEW | typeof MANAGE;
}

interface Group {
	eyebrow: string;
	items: Item[];
}

/**
 * Nav structure per the GUI handoff. The grouping is deliberate: Overview is
 * "what happened", Routing is "what the proxy does", Security is "who may do
 * it", System is "the installation itself".
 */
const groups: Group[] = [
	{
		eyebrow: "nav.group.overview",
		items: [
			{ to: "/", label: "dashboard" },
			{ to: "/access-log", label: "access-log", permissionSection: ADMIN },
			{ to: "/audit-log", label: "auditlogs", permissionSection: ADMIN },
		],
	},
	{
		eyebrow: "nav.group.routing",
		items: [
			{ to: "/nginx/proxy", label: "proxy-hosts", count: "proxy", permissionSection: PROXY_HOSTS },
			{
				to: "/nginx/redirection",
				label: "redirection-hosts",
				count: "redirection",
				permissionSection: REDIRECTION_HOSTS,
			},
			{ to: "/nginx/stream", label: "streams", count: "stream", permissionSection: STREAMS },
			{ to: "/nginx/404", label: "dead-hosts", count: "dead", permissionSection: DEAD_HOSTS },
		],
	},
	{
		eyebrow: "nav.group.security",
		items: [
			{ to: "/certificates", label: "certificates", permissionSection: CERTIFICATES },
			{ to: "/access", label: "access-lists", permissionSection: ACCESS_LISTS },
			{ to: "/users", label: "users", permissionSection: ADMIN },
		],
	},
	{
		eyebrow: "nav.group.system",
		items: [
			{ to: "/ha", label: "ha-cluster", permissionSection: ADMIN },
			{ to: "/npm-import", label: "npm-import", permissionSection: ADMIN },
			{ to: "/license", label: "license", permissionSection: ADMIN },
			{ to: "/settings", label: "settings", permissionSection: ADMIN },
		],
	},
];

interface Props {
	open: boolean;
	onNavigate: () => void;
}

export function SiteSidebar({ open, onNavigate }: Props) {
	const { data: currentUser } = useUser("me");
	const { data: hostReport } = useHostReport();
	const { logout } = useAuthState();
	const location = useLocation();
	const isAdmin = currentUser?.roles.includes("admin");

	const initial = (currentUser?.nickname || "?").trim().charAt(0).toUpperCase();

	return (
		<>
			{open && (
				<button type="button" className={styles.scrim} aria-label="Menü schließen" onClick={onNavigate} />
			)}
			<aside className={cn(styles.sidebar, open && styles.sidebarOpen)}>
				<NavLink to="/" className={styles.brand} onClick={onNavigate}>
					{/* Das echte Schild-Logo statt des amberfarbenen "N"-Platzhalters, den
					    der Handoff ausdruecklich als Platzhalter bezeichnet. */}
					<img className={styles.logo} src="/images/logo-no-text.svg" alt="" width={32} height={32} />
					<span className={styles.brandName}>NexProxy</span>
				</NavLink>

				<nav className={styles.nav}>
					{groups.map((group) => (
						<div className={styles.group} key={group.eyebrow}>
							<div className={styles.eyebrow}>
								<T id={group.eyebrow} />
							</div>
							{group.items.map((item) => {
								// Exakter Treffer oder echter Unterpfad. Ein blosses startsWith
								// waere falsch: "/access-log" beginnt mit "/access", wodurch
								// "Access Lists" beim Klick auf "Access Log" mitmarkiert wurde.
								const active =
									location.pathname === item.to ||
									(item.to !== "/" && location.pathname.startsWith(`${item.to}/`));
								const count = item.count ? hostReport?.[item.count] : undefined;
								return (
									<HasPermission
										key={item.to}
										section={item.permissionSection}
										permission={item.permission || VIEW}
										hideError
									>
										<NavLink
											to={item.to}
											onClick={onNavigate}
											className={cn(styles.item, active && styles.itemActive)}
										>
											<span className={styles.label}>
												<T id={item.label} />
											</span>
											{typeof count === "number" && <span className={styles.bubble}>{count}</span>}
										</NavLink>
									</HasPermission>
								);
							})}
						</div>
					))}
				</nav>

				{/* Der Handoff zeigt im Kontoblock nur Name, Rolle und Abmelden. Profil,
				    Passwort und Zwei-Faktor waren bisher im Kopfbereich erreichbar und
				    duerfen nicht verlorengehen — sie stecken darum in einem Aufklappmenue
				    am Namen. <details> statt Bootstrap-Dropdown, weil der neue Rahmen
				    ohne Tabler-JavaScript auskommen soll. */}
				<details className={styles.account}>
					<summary className={styles.accountSummary}>
						<span
							className={styles.avatar}
							style={currentUser?.avatar ? { backgroundImage: `url(${currentUser.avatar})` } : undefined}
							aria-hidden="true"
						>
							{currentUser?.avatar ? "" : initial}
						</span>
						<span className={styles.accountText}>
							<span className={styles.accountName}>{currentUser?.nickname}</span>
							<span className={styles.accountRole}>
								<T id={isAdmin ? "role.admin" : "role.standard-user"} />
							</span>
						</span>
					</summary>
					<div className={styles.accountMenu}>
						<button type="button" className={styles.accountAction} onClick={() => showUserModal("me")}>
							<T id="user.edit-profile" />
						</button>
						<button
							type="button"
							className={styles.accountAction}
							onClick={() => showChangePasswordModal("me")}
						>
							<T id="user.change-password" />
						</button>
						<button type="button" className={styles.accountAction} onClick={() => showTwoFactorModal("me")}>
							<T id="user.two-factor" />
						</button>
						<button type="button" className={styles.accountAction} onClick={() => logout()}>
							<T id="user.logout" />
						</button>
					</div>
				</details>
			</aside>
		</>
	);
}
