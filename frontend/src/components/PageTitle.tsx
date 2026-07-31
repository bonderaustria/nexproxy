import { T } from "src/locale";
import styles from "./PageTitle.module.css";

interface Props {
	/** Locale-Id der Navigationsgruppe, z. B. "nav.group.system". */
	eyebrow: string;
	/** Locale-Id oder fertiger Text. */
	title: string;
	/** Optionale Beschreibung unter dem Titel. */
	subtitle?: React.ReactNode;
	/** Titel ist bereits Klartext und soll nicht uebersetzt werden. */
	rawTitle?: boolean;
}

/**
 * Seitenueberschrift fuer Seiten ohne Liste (Einstellungen, HA, Lizenz …).
 *
 * Seit der klebende Kopfbereich entfallen ist, traegt jede Seite ihren Titel
 * selbst. Gemeinsamer Baustein, damit Eyebrow und Titel ueberall gleich sitzen
 * — sonst haette jede Seite ihr eigenes <h2> mit eigenem Abstand.
 */
export function PageTitle({ eyebrow, title, subtitle, rawTitle }: Props) {
	return (
		<div className={styles.wrap}>
			<span className={styles.eyebrow}>
				<T id={eyebrow} />
			</span>
			<h1 className={styles.title}>{rawTitle ? title : <T id={title} />}</h1>
			{subtitle && <p className={styles.subtitle}>{subtitle}</p>}
		</div>
	);
}
