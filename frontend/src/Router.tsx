import { lazy, Suspense, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import {
	EnterpriseGate,
	ErrorNotFound,
	LoadingPage,
	Page,
	SiteColumn,
	SiteContainer,
	SiteFooter,
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
 * Der Rahmen muss innerhalb des BrowserRouter liegen, weil die Sidebar die
 * aktuelle Route braucht — deshalb eine eigene Komponente statt Inline-JSX.
 *
 * Der klebende Kopfbereich ist entfallen: Auf den Listenseiten zeigte er Titel,
 * Suche und Primaeraktion ein zweites Mal, direkt ueber derselben Angabe in der
 * Seitenkarte. Sprachwahl und Menue-Knopf sind in die Sidebar gewandert, den
 * Seitentitel traegt jetzt die jeweilige Seite selbst.
 */
function Shell({ children }: { children: React.ReactNode }) {
	const [menuOpen, setMenuOpen] = useState(false);

	return (
		<SiteShell>
			<SiteSidebar open={menuOpen} onNavigate={() => setMenuOpen(false)} onOpenMenu={() => setMenuOpen(true)} />
			<SiteColumn>
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
