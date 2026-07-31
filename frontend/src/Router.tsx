import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import {
	EnterpriseGate,
	ErrorNotFound,
	LoadingPage,
	Page,
	SiteColumn,
	SiteContainer,
	SiteFooter,
	SiteHeader,
	SiteShell,
	SiteSidebar,
	Unhealthy,
} from "src/components";
import { useAuthState } from "src/context";
import { ShellSearchProvider } from "src/context/ShellSearch";
import { useHealth } from "src/hooks";

const Setup = lazy(() => import("src/pages/Setup"));
const Login = lazy(() => import("src/pages/Login"));
const Dashboard = lazy(() => import("src/pages/Dashboard"));
const Settings = lazy(() => import("src/pages/Settings"));
const Certificates = lazy(() => import("src/pages/Certificates"));
const Access = lazy(() => import("src/pages/Access"));
const AuditLog = lazy(() => import("src/pages/AuditLog"));
const Users = lazy(() => import("src/pages/Users"));
const HA = lazy(() => import("src/pages/HA"));
const License = lazy(() => import("src/pages/License"));
const NpmImport = lazy(() => import("src/pages/NpmImport"));
const AccessLog = lazy(() => import("src/pages/AccessLog"));
const ProxyHosts = lazy(() => import("src/pages/Nginx/ProxyHosts"));
const RedirectionHosts = lazy(() => import("src/pages/Nginx/RedirectionHosts"));
const DeadHosts = lazy(() => import("src/pages/Nginx/DeadHosts"));
const Streams = lazy(() => import("src/pages/Nginx/Streams"));

/**
 * Eyebrow und Titel des Kopfbereichs leiten sich aus der Route ab, damit die
 * Gruppenzuordnung der Sidebar und die Kopfzeile nicht auseinanderlaufen.
 * Reihenfolge zaehlt: laengere Pfade zuerst, da mit startsWith geprueft wird.
 */
const PAGE_TITLES: { path: string; eyebrow: string; title: string }[] = [
	{ path: "/nginx/proxy", eyebrow: "nav.group.routing", title: "proxy-hosts" },
	{ path: "/nginx/redirection", eyebrow: "nav.group.routing", title: "redirection-hosts" },
	{ path: "/nginx/stream", eyebrow: "nav.group.routing", title: "streams" },
	{ path: "/nginx/404", eyebrow: "nav.group.routing", title: "dead-hosts" },
	{ path: "/certificates", eyebrow: "nav.group.security", title: "certificates" },
	{ path: "/access-log", eyebrow: "nav.group.overview", title: "access-log" },
	{ path: "/access", eyebrow: "nav.group.security", title: "access-lists" },
	{ path: "/audit-log", eyebrow: "nav.group.overview", title: "auditlogs" },
	{ path: "/users", eyebrow: "nav.group.security", title: "users" },
	{ path: "/ha", eyebrow: "nav.group.system", title: "ha-cluster" },
	{ path: "/npm-import", eyebrow: "nav.group.system", title: "npm-import" },
	{ path: "/license", eyebrow: "nav.group.system", title: "license" },
	{ path: "/settings", eyebrow: "nav.group.system", title: "settings" },
];

function usePageTitle() {
	const { pathname } = useLocation();
	if (pathname === "/") return { eyebrow: "nav.group.overview", title: "dashboard" };
	return (
		PAGE_TITLES.find((p) => pathname.startsWith(p.path)) ?? {
			eyebrow: "nav.group.overview",
			title: "dashboard",
		}
	);
}

/**
 * Der Rahmen muss innerhalb des BrowserRouter liegen, weil Sidebar und Kopf die
 * aktuelle Route brauchen — deshalb eine eigene Komponente statt Inline-JSX.
 */
function Shell({ children }: { children: React.ReactNode }) {
	const [menuOpen, setMenuOpen] = useState(false);
	const { eyebrow, title } = usePageTitle();

	return (
		<SiteShell>
			<SiteSidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} />
			<SiteColumn>
				<SiteHeader eyebrow={eyebrow} title={title} onOpenMenu={() => setMenuOpen(true)} />
				<SiteContainer>{children}</SiteContainer>
				<SiteFooter />
			</SiteColumn>
		</SiteShell>
	);
}

function Router() {
	const health = useHealth();
	const { authenticated } = useAuthState();

	if (health.isLoading) {
		return <LoadingPage />;
	}

	if (health.isError || health.data?.status !== "OK") {
		return <Unhealthy />;
	}

	if (!health.data?.setup) {
		return <Setup />;
	}

	if (!authenticated) {
		return (
			<Suspense fallback={<LoadingPage />}>
				<Login />
			</Suspense>
		);
	}

	return (
		<BrowserRouter>
			<ShellSearchProvider>
				<Page>
					<Shell>
						<Suspense fallback={<LoadingPage noLogo />}>
						<Routes>
							<Route path="*" element={<ErrorNotFound />} />
							<Route path="/certificates" element={<Certificates />} />
							<Route path="/access" element={<Access />} />
							<Route path="/audit-log" element={<AuditLog />} />
							<Route path="/settings" element={<Settings />} />
							<Route path="/users" element={<Users />} />
							<Route
								path="/ha"
								element={
									<EnterpriseGate feature="HA-Cluster">
										<HA />
									</EnterpriseGate>
								}
							/>
							<Route path="/license" element={<License />} />
							<Route path="/npm-import" element={<NpmImport />} />
							<Route
								path="/access-log"
								element={
									<EnterpriseGate feature="Zugriffsprotokoll">
										<AccessLog />
									</EnterpriseGate>
								}
							/>
							<Route path="/nginx/proxy" element={<ProxyHosts />} />
							<Route path="/nginx/redirection" element={<RedirectionHosts />} />
							<Route path="/nginx/404" element={<DeadHosts />} />
							<Route path="/nginx/stream" element={<Streams />} />
							<Route path="/" element={<Dashboard />} />
						</Routes>
					</Suspense>
					</Shell>
				</Page>
			</ShellSearchProvider>
		</BrowserRouter>
	);
}

export default Router;
