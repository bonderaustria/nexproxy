---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "NexProxy"
  text: "Reverse proxy with a web interface"
  tagline: Expose your services safely — free SSL, access control and high availability. Up and running in minutes.
  image:
    src: /logo.svg
    alt: NexProxy
  actions:
    - theme: brand
      text: Get started
      link: /setup/
    - theme: alt
      text: Guide
      link: /guide/
    - theme: alt
      text: GitHub
      link: https://github.com/bonderaustria/nexproxy

features:
  - title: Proxy hosts in minutes
    details: Enter a domain, point it at a destination, done. Redirections, TCP and UDP streams and 404 hosts are included.
  - title: Free SSL
    details: Certificates from Let's Encrypt via HTTP or DNS challenge. Renewal happens on its own.
  - title: High availability
    details: Two nodes, one floating IP. If one fails the other takes over — without anyone stepping in.
  - title: Control who gets in
    details: Access lists with HTTP authentication and IP rules, user management with permissions and an audit log.
  - title: One Docker image
    details: Not a stack of services. One container, one database, runs on anything from a Raspberry Pi to a rack server.
  - title: Migrate without losing data
    details: Coming from Nginx Proxy Manager? The migration carries over hosts, certificates, access lists and users.
---

## Editions {#editions}

NexProxy is open source under the MIT licence. The Enterprise features live in
[`enterprise/`](https://github.com/bonderaustria/nexproxy/tree/master/enterprise)
and are **free for private, non-commercial use**.

| | Core | Enterprise |
| --- | :---: | :---: |
| Proxy hosts, redirections, streams, 404 hosts | ✅ | ✅ |
| Free SSL (Let's Encrypt) and your own certificates | ✅ | ✅ |
| Access lists and HTTP authentication | ✅ | ✅ |
| Advanced Nginx configuration | ✅ | ✅ |
| Users, permissions and audit log | ✅ | ✅ |
| **High availability** — floating-IP failover across nodes | — | ✅ |
| **True multi-tenancy** — hosts isolated per user | — | ✅ |

### Free for your homelab

Running NexProxy privately or non-commercially? You get an Enterprise licence
key at **no cost** — just write to
[justin@justfuture.at](mailto:justin@justfuture.at).

Commercial use of the Enterprise features requires a licence. The core stays
free and unrestricted either way.

## Quick start

```yml
services:
  app:
    image: 'ghcr.io/bonderaustria/nexproxy:latest'
    restart: unless-stopped
    ports:
      - '80:80'    # HTTP
      - '81:81'    # Admin interface
      - '443:443'  # HTTPS
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

```bash
docker compose up -d
```

Then open the admin interface on port `81`. The full walkthrough is in
[Setup](/setup/).
