---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "NexProxy"
  text: "Reverse Proxy mit Weboberfläche"
  tagline: Dienste sicher veröffentlichen — mit kostenlosem SSL, Zugriffslisten und Hochverfügbarkeit. In Minuten eingerichtet.
  image:
    src: /logo.svg
    alt: NexProxy
  actions:
    - theme: brand
      text: Loslegen
      link: /setup/
    - theme: alt
      text: Anleitung
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/bonderaustria/nexproxy

features:
  - title: Proxy-Hosts in Minuten
    details: Domain eintragen, Ziel angeben, fertig. Weiterleitungen, TCP- und UDP-Streams sowie 404-Hosts gehören dazu.
  - title: Kostenloses SSL
    details: Zertifikate über Let's Encrypt, per HTTP- oder DNS-Prüfung. Die Verlängerung läuft von selbst.
  - title: Hochverfügbarkeit
    details: Zwei Nodes, eine Floating-IP. Fällt einer aus, übernimmt der andere — ohne dass jemand eingreifen muss.
  - title: Zugriff steuern
    details: Zugriffslisten mit HTTP-Authentifizierung und IP-Regeln, Benutzerverwaltung mit Rechten und Prüfprotokoll.
  - title: Ein Docker-Image
    details: Kein Baukasten aus Diensten. Ein Container, eine Datenbank, läuft auf allem von Raspberry Pi bis Serverschrank.
  - title: Umstieg ohne Datenverlust
    details: Kommst du von Nginx Proxy Manager, übernimmt die Migration Hosts, Zertifikate, Zugriffslisten und Benutzer.
---

## Editionen {#editionen}

NexProxy ist quelloffen unter der MIT-Lizenz. Die Enterprise-Funktionen liegen im
Verzeichnis [`enterprise/`](https://github.com/bonderaustria/nexproxy/tree/master/enterprise)
und sind für private, nicht-kommerzielle Nutzung **kostenlos**.

| | Core | Enterprise |
| --- | :---: | :---: |
| Proxy-Hosts, Weiterleitungen, Streams, 404-Hosts | ✅ | ✅ |
| Kostenloses SSL (Let's Encrypt) und eigene Zertifikate | ✅ | ✅ |
| Zugriffslisten und HTTP-Authentifizierung | ✅ | ✅ |
| Erweiterte Nginx-Konfiguration | ✅ | ✅ |
| Benutzer, Rechte und Prüfprotokoll | ✅ | ✅ |
| **Hochverfügbarkeit** — Floating-IP-Failover über mehrere Nodes | — | ✅ |
| **Echte Mandantentrennung** — Hosts je Benutzer isoliert | — | ✅ |

### Im Homelab kostenlos

Betreibst du NexProxy privat oder nicht-kommerziell, bekommst du einen
Enterprise-Lizenzschlüssel **gratis** — schreib einfach an
[justin@justfuture.at](mailto:justin@justfuture.at).

Für den kommerziellen Einsatz braucht Enterprise eine Lizenz. Der Core-Teil
bleibt in jedem Fall frei und ohne Einschränkung nutzbar.

## Schnellstart

```yml
services:
  app:
    image: 'ghcr.io/bonderaustria/nexproxy:latest'
    restart: unless-stopped
    ports:
      - '80:80'    # HTTP
      - '81:81'    # Verwaltungsoberfläche
      - '443:443'  # HTTPS
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

```bash
docker compose up -d
```

Danach die Oberfläche auf Port `81` öffnen. Die ausführliche Anleitung steht
unter [Einrichtung](/setup/).
