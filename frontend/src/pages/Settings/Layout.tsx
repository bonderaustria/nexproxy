import { PageCard, PageTitle } from "src/components";
import DefaultSite from "./DefaultSite";

export default function Layout() {
	return (
		<div>
			<PageTitle eyebrow="nav.group.system" title="settings" />

			{/* Die frühere Rubrikenspalte links enthielt genau einen Eintrag, der
			    zugleich der Titel der Karte war — sie ist entfallen. Kommen weitere
			    Rubriken dazu, gehoeren sie als Reiter in die Kopfzeile der Karte. */}
			<PageCard title="settings.default-site">
				<DefaultSite />
			</PageCard>
		</div>
	);
}
