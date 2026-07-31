import { defineConfig } from "vitepress";

const SITE = "https://nexproxy.de";
const DESCRIPTION =
	"Reverse proxy with a web interface: proxy hosts, free SSL via Let's Encrypt, access lists and high availability — set up in minutes as a Docker image.";

// https://vitepress.dev/reference/site-config
export default defineConfig({
	title: "NexProxy",
	description: DESCRIPTION,
	lang: "en",
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
			{ text: "Setup", link: "/setup/" },
			{ text: "Guide", link: "/guide/" },
			{ text: "Editions", link: "/#editions" },
		],
		sidebar: [
			{
				items: [
					{ text: "Guide", link: "/guide/" },
					{ text: "Screenshots", link: "/screenshots/" },
					{ text: "Setup", link: "/setup/" },
					{ text: "Advanced configuration", link: "/advanced-config/" },
					{ text: "Upgrading", link: "/upgrading/" },
					{ text: "FAQ", link: "/faq/" },
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
				'Released under the MIT licence. Fork of <a href="https://github.com/NginxProxyManager/nginx-proxy-manager">Nginx Proxy Manager</a>.',
			copyright: "Copyright © 2026 NexProxy",
		},
	},
});
