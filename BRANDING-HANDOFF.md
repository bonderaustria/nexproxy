# Design-Handoff: Name & Logo

> **Auftrag:** Entwickle einen **Produktnamen** und ein **Logo** für einen Fork von
> Nginx Proxy Manager. Liefere mehrere Namensvorschläge + ein Logo-Konzept für den Favoriten.
> **Namens-Richtung (vom Auftraggeber festgelegt): homelab-/community-nah** — locker,
> einprägsam, Bastler-Vibe. Kein Enterprise-Sprech.

---

## 1. Was ist das Produkt?

Ein **self-hosted Reverse-Proxy-Manager mit Web-UI** — man verwaltet damit ohne
Nginx-Wissen Weiterleitungen, SSL-Zertifikate (Let's Encrypt) und Port-Streams.
Basis ist der beliebte „Nginx Proxy Manager" (Open Source, MIT), den wir forken
und um Features erweitern, die im Original fehlen.

**Das Alleinstellungsmerkmal / die Story:**
- **Hochverfügbarkeit (HA):** zwei Nodes, automatisches Failover per Floating-IP.
- **Echte Mehrbenutzer/Mandanten:** jeder Nutzer sieht nur seine eigenen Hosts.
- **„Wir liefern Fixes, die das Original liegen lässt":** Der Solo-Maintainer des
  Originals merged/released kaum noch — bekannte, fertige Bugfixes (z.B. UDP-
  Paketverlust bei TeamSpeak/Factorio) hängen monatelang. Unser Fork bringt sie sofort.

**Geschäftsmodell (Open-Core):** Kern gratis & offen für Privatnutzer; die
Enterprise-Features (HA, Multi-User) sind für Firmen kostenpflichtig.

## 2. Zielgruppe

1. **Homelab-/Self-Hosting-Community (PRIMÄR)** — Bastler, r/selfhosted, Proxmox-Nutzer.
   Reagieren auf: sympathisch, ehrlich, „von Selbst-Hostern für Selbst-Hoster".
2. Kleine Firmen / MSPs (sekundär, für den bezahlten HA-Tier).

Der Name muss die Community zuerst abholen — Firmen folgen über die Features, nicht den Namen.

## 3. Namens-Anforderungen (WICHTIG)

**Muss:**
- **Kein „Nginx"** im Namen — „NGINX" ist eine eingetragene Marke von F5. Rechtlich tabu.
- **Nicht „NPM" / „npm"** — kollidiert mit dem Node-Paketmanager (SEO-Tod, Verwechslung).
- Sich klar vom Original „Nginx Proxy Manager" abheben (eigene Identität, kein „…Manager Plus").
- Kurz, aussprechbar, im Deutschen **und** Englischen tragbar (Community ist international).
- Als Wortmarke tauglich für: Docker-Image-Name, GitHub-Repo, Web-UI-Header, Domain.

**Soll:**
- Anspielung auf Funktion (Proxy / Gateway / Tür / Weiterleitung / Routen) ODER
  auf Homelab-Kultur — beides willkommen, Wortspiele erlaubt.
- Domain-Realismus: `.io`, `.dev`, `.app` oder `.net` sollten plausibel frei sein
  (bitte 2–3 Kandidaten mit Domain-Idee vorschlagen; Verfügbarkeit muss der
  Auftraggeber final prüfen).
- Kein negativer Beiklang in DE/EN.

**Deliverable Namen:** 6–10 Vorschläge, gruppiert, je 1 Satz Begründung + Domain-Idee.
Danach eine klare **Top-Empfehlung**.

## 4. Logo-Anforderungen

Für den empfohlenen Namen ein Logo-Konzept:

- **Stil:** modern, freundlich, tech-affin aber nicht kalt/corporate. Flat/Vektor.
  Passt zur Homelab-Ästhetik (denk an Uptime Kuma, Portainer, Gitea — nahbar, klar).
- **Formsprache-Ideen (nicht bindend):** Proxy/Gateway = etwas fließt durch ein Tor/
  einen Knotenpunkt; Routing/Verzweigung; Schutz+Weiterleitung (SSL-Schloss dezent möglich).
- **Muss funktionieren als:**
  - Quadratisches App-Icon / Favicon (erkennbar bei 16×16 px)
  - Header-Logo in der Web-UI (Icon + Wortmarke nebeneinander)
  - Monochrom (ein-farbig auf hellem und dunklem Grund)
- **Farbe:** ein bis zwei Kernfarben vorschlagen (Hex), mit heller/dunkler Variante.
  Bewusst NICHT das Nginx-Grün (#009639) kopieren — eigene Identität.
- **Deliverable Logo:** als **inline SVG** (theme-fähig, funktioniert in Light & Dark),
  plus kurze Begründung der Idee. Zeig Icon-only UND Icon+Wortmarke.

## 5. Rechtliche Leitplanken (kurz)

- MIT erlaubt den Fork voll; Pflicht ist nur der Copyright-Hinweis des Originals im Code.
- Marke/Name des Originals NICHT übernehmen. Eigener Name = eigene Marke = besser für uns.
- Logo muss eine **Eigenschöpfung** sein (keine Ableitung des Nginx-Logos).

## 6. Kontext-Verweise

- Fork-Repo: `E:\npm-fork` (Branch `stable`)
- Open-Core-Struktur: `enterprise/` (kommerziell) vs. Kern (MIT)
- Erstes Enterprise-Feature in Arbeit: Simple-HA (`enterprise/ha/`)

---

### Erwartetes Endergebnis des Design-Auftrags
1. Namensliste (6–10) + Top-Empfehlung mit Begründung + Domain-Ideen.
2. Logo-Konzept (SVG, Light/Dark, Icon-only + Wortmarke) für die Empfehlung.
3. Kurze Farb-/Font-Empfehlung als Startpunkt für die spätere UI.
