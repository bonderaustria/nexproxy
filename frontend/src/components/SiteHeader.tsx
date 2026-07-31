import { useNavigate } from "react-router-dom";
import { LocalePicker } from "src/components";
import { useShellSearch } from "src/context/ShellSearch";
import { useHAStatus } from "src/hooks";
import { T } from "src/locale";
import styles from "./SiteHeader.module.css";

interface Props {
	/** Eyebrow above the title — the nav group the current page belongs to. */
	eyebrow: string;
	/** Locale id for the page title. */
	title: string;
	onOpenMenu: () => void;
}

export function SiteHeader({ eyebrow, title, onOpenMenu }: Props) {
	const navigate = useNavigate();
	const { query, setQuery } = useShellSearch();

	const { data: ha } = useHAStatus();
	const selfNode = ha?.nodes?.find((n) => n.isSelf);
	const isStandby = !ha?.standalone && !!selfNode && !!ha?.activeNode && selfNode.name !== ha.activeNode;

	return (
		<>
			{isStandby && (
				<div className={styles.standby}>
					⚠ Standby-Node — nur Lesezugriff. Änderungen bitte auf der aktiven Instanz (Floating-IP)
					vornehmen.
				</div>
			)}
			<header className={styles.header}>
				<button type="button" className={`${styles.iconButton} ${styles.burger}`} onClick={onOpenMenu} aria-label="Menü öffnen">
					<span aria-hidden="true">☰</span>
				</button>

				<div>
					<span className={styles.eyebrow}>
						<T id={eyebrow} />
					</span>
					<h1 className={styles.title}>
						<T id={title} />
					</h1>
				</div>

				<div className={styles.actions}>
					<input
						type="search"
						className={styles.search}
						value={query}
						onChange={(e) => setQuery(e.target.value)}
						placeholder="Hosts, Domains durchsuchen…"
						aria-label="Suche"
					/>
					<LocalePicker />
					<button
						type="button"
						className={styles.primary}
						onClick={() => navigate("/nginx/proxy?new=1")}
					>
						+ <T id="proxy-hosts.add" />
					</button>
				</div>
			</header>
		</>
	);
}
