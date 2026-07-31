import { defineConfig } from "vitepress";

const SITE = "https://nexproxy.de";
const DESCRIPTION =
	"Reverse Proxy mit Weboberfläche: Proxy-Hosts, kostenloses SSL über Let's Encrypt, Zugriffslisten und Hochverfügbarkeit — als Docker-Image in Minuten eingerichtet.";

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: "NexProxy",
	description: DESCRIPTION,
	lang: "de-DE",
	head: [
		["link", { rel: "icon", href: "/icon.png" }],
		["meta", { name: "description", content: DESCRIPTION }],
		["meta", { property: "og:title", content: "NexProxy" }],
		["meta", { property: "og:description", content: DESCRIPTION }],
		["meta", { property: "og:type", content: "website" }],
		["meta", { property: "og:url", content: `${SITE}/` }],
		["meta", { property: "og:image", content: `${SITE}/icon.png` }],
		["meta", { name: "twitter:card", content: "summary_large_image" }],
		["meta", { name: "twitter:title", content: "NexProxy" }],
		["meta", { name: "twitter:description", content: DESCRIPTION }],
		["meta", { name: "twitter:image", content: `${SITE}/icon.png` }],
		["meta", { name: "twitter:alt", content: "NexProxy" }],
		// Bewusst KEIN Analytics-Schnipsel: hier stand die Tracking-ID des
		// Ursprungsprojekts, die Besucherdaten an fremde Konten geschickt haette.
		// Wenn Statistiken gewuenscht sind, gehoert eine eigene, datensparsame
		// Loesung her (z. B. Plausible) — und dann mit Hinweis in der
		// Datenschutzerklaerung.
	],
	sitemap: {
		hostname: SITE,
	},
	metaChunk: true,
	srcDir: "./src",
	outDir: "./dist",
	// Dunkel als Standard: die Anwendung selbst ist eine reine Dunkelanwendung,
	// und die Website soll denselben Eindruck machen. Der Umschalter bleibt.
	appearance: "dark",
	themeConfig: {
		// https://vitepress.dev/reference/default-theme-config
		logo: { src: "/logo.svg", width: 24, height: 24 },
		nav: [
			{ text: "Einrichtung", link: "/setup/" },
			{ text: "Anleitung", link: "/guide/" },
			{ text: "Editionen", link: "/#editionen" },
		],
		sidebar: [
			{
				items: [
					{ text: "Anleitung", link: "/guide/" },
					{ text: "Screenshots", link: "/screenshots/" },
					{ text: "Einrichtung", link: "/setup/" },
					{ text: "Erweiterte Konfiguration", link: "/advanced-config/" },
					{ text: "Aktualisieren", link: "/upgrading/" },
					{ text: "Häufige Fragen", link: "/faq/" },
					{ text: "Certbot", link: "/certbot/" },
				],
			},
		],
		socialLinks: [{ icon: "github", link: "https://github.com/bonderaustria/nexproxy" }],
		search: {
			provider: "local",
		},
		footer: {
			// Der Hinweis auf das Ursprungsprojekt bleibt: NexProxy ist ein Fork,
			// und die MIT-Lizenz verlangt, dass der urspruengliche Copyright-Hinweis
			// erhalten bleibt (siehe LICENSE).
			message:
				'Veröffentlicht unter der MIT-Lizenz. Fork von <a href="https://github.com/NginxProxyManager/nginx-proxy-manager">Nginx Proxy Manager</a>.',
			copyright: "Copyright © 2026 NexProxy",
		},
	},
});
