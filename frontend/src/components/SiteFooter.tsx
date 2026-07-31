import { useCheckVersion, useHealth } from "src/hooks";
import { T } from "src/locale";
import styles from "./SiteFooter.module.css";

const DOCS_URL = "https://github.com/bonderaustria/nexproxy#readme";
const SUPPORT_URL = "https://github.com/bonderaustria/nexproxy/issues";

export function SiteFooter() {
	const health = useHealth();
	const { data: versionData } = useCheckVersion();

	const getVersion = () => {
		if (!health.data) {
			return "";
		}
		const v = health.data.version;
		return `v${v.major}.${v.minor}.${v.revision}`;
	};

	const version = getVersion();

	return (
		<footer className={styles.footer}>
			<span>© 2026 NexProxy</span>
			<span className={styles.sep} aria-hidden="true">
				·
			</span>
			<a className={styles.link} href={DOCS_URL} target="_blank" rel="noreferrer">
				<T id="footer.documentation" />
			</a>
			<span className={styles.sep} aria-hidden="true">
				·
			</span>
			<a className={styles.link} href={SUPPORT_URL} target="_blank" rel="noreferrer">
				<T id="footer.support" />
			</a>

			{versionData?.updateAvailable && versionData?.latest && (
				<a
					className={styles.update}
					href={`https://github.com/bonderaustria/nexproxy/releases/tag/${versionData.latest}`}
					target="_blank"
					rel="noopener"
					title={`New version ${versionData.latest} is available`}
				>
					<T id="update-available" data={{ latestVersion: versionData.latest }} />
				</a>
			)}

			{version && (
				<a
					className={styles.version}
					href={`https://github.com/bonderaustria/nexproxy/releases/tag/${version}`}
					target="_blank"
					rel="noopener"
				>
					{version}
				</a>
			)}
		</footer>
	);
}
