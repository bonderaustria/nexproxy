import { T } from "src/locale";
import styles from "./PageCard.module.css";

interface Props {
	/** Locale-Id der Ueberschrift. */
	title: string;
	/** Optionale Unterzeile, ebenfalls als Locale-Id. */
	subtitle?: string;
	/** Suchfeld anzeigen; entfaellt, wenn kein Handler uebergeben wird. */
	search?: {
		value: string;
		onChange: (value: string) => void;
		placeholder?: string;
	};
	/** Knoepfe rechts in der Kopfzeile. */
	actions?: React.ReactNode;
	children: React.ReactNode;
}

/**
 * Einheitlicher Rahmen fuer alle Listenseiten, nach dem Rezept des Dashboards:
 * Karte mit Kopfzeile (Titel, Unterzeile, Suche, Aktionen) und randlosem Inhalt.
 *
 * Bewusst als gemeinsamer Baustein statt pro Seite kopiert — sonst laufen die
 * dreizehn Listenseiten waehrend der Migration auseinander.
 */
export function PageCard({ title, subtitle, search, actions, children }: Props) {
	return (
		<div className={styles.card}>
			<div className={styles.header}>
				<div>
					<div className={styles.title}>
						<T id={title} />
					</div>
					{subtitle && (
						<div className={styles.subtitle}>
							<T id={subtitle} />
						</div>
					)}
				</div>
				{(search || actions) && (
					<div className={styles.actions}>
						{search && (
							<input
								type="search"
								className={styles.search}
								value={search.value}
								placeholder={search.placeholder ?? "Search …"}
								aria-label="Search"
								onChange={(e) => search.onChange(e.target.value)}
							/>
						)}
						{actions}
					</div>
				)}
			</div>
			<div className={styles.body}>{children}</div>
		</div>
	);
}

/** Primaeraktion in Amber — pro Seite hoechstens eine. */
export function PageCardAction({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
	return (
		<button type="button" className={styles.primary} onClick={onClick}>
			{children}
		</button>
	);
}

/** Icon-Knopf fuer Nebenaktionen wie Hilfe. */
export function PageCardIconButton({
	onClick,
	label,
	children,
}: {
	onClick: () => void;
	label: string;
	children: React.ReactNode;
}) {
	return (
		<button type="button" className={styles.iconButton} onClick={onClick} aria-label={label} title={label}>
			{children}
		</button>
	);
}
