import styles from "./SiteContainer.module.css";

interface Props {
	children: React.ReactNode;
}

/** Inhaltsbereich zwischen Kopf und Fuss. */
export function SiteContainer({ children }: Props) {
	return <main className={styles.main}>{children}</main>;
}

/** Aussenraster: Sidebar + rechte Spalte. */
export function SiteShell({ children }: Props) {
	return <div className={styles.shell}>{children}</div>;
}

/** Rechte Spalte: Kopf, Inhalt, Fuss. */
export function SiteColumn({ children }: Props) {
	return <div className={styles.column}>{children}</div>;
}
