---
outline: deep
---

# Guide

NexProxy is a reverse proxy with a web interface. It forwards traffic to the
services running on your network, terminates SSL for them, and takes care of
certificates — without you having to write Nginx configuration by hand.

It ships as a single Docker image.

- [Quick Setup](#quick-setup)
- [Full Setup](/setup/)
- [Screenshots](/screenshots/)

## Features

- Proxy hosts, redirections, TCP/UDP streams and 404 hosts — created in the interface, no Nginx knowledge required
- Free SSL through Let's Encrypt (HTTP or DNS challenge) and support for your own certificates, with automatic renewal
- Access lists with HTTP authentication and IP rules
- Advanced Nginx configuration for those who want it
- User management, per-user permissions and an audit log
- Migration from Nginx Proxy Manager that carries over hosts, certificates, access lists and users

Two features belong to the Enterprise edition, which is
[free for private and non-commercial use](/#editionen):

- **High availability** — floating-IP failover across two nodes
- **True multi-tenancy** — hosts isolated per user

## Hosting your home network

The basics for anyone new to self-hosting:

1. Your home router has a port forwarding section somewhere. Log in and find it.
2. Forward ports 80 and 443 to the machine running NexProxy.
3. Point your domain at your connection — either a static IP, or a dynamic DNS
   service such as DuckDNS.
4. Use NexProxy as the gateway that forwards to your other web services.

## Quick Setup

1. Install Docker and Docker Compose

- [Docker install documentation](https://docs.docker.com/get-docker/)
- [Docker Compose install documentation](https://docs.docker.com/compose/install/)

2. Create a `docker-compose.yml` file similar to this:

```yml
services:
  app:
    image: 'ghcr.io/bonderaustria/nexproxy:latest'
    restart: unless-stopped
    environment:
      TZ: "Europe/Vienna"
    ports:
      - '80:80'
      - '81:81'
      - '443:443'
    volumes:
      - ./data:/data
      - ./letsencrypt:/etc/letsencrypt
```

This is the bare minimum configuration. See the [setup documentation](/setup/) for more.

3. Bring up your stack:

```bash
docker compose up -d
```

4. Log in to the admin interface

Once the container is running, connect to it on port `81`:

[http://127.0.0.1:81](http://127.0.0.1:81)

The first startup can take a minute depending on your hardware.

## Contributing

Pull requests are welcome. CI runs on every pull request and must pass before a
change is considered.

## Getting Support

1. [Found a bug?](https://github.com/bonderaustria/nexproxy/issues)
2. [Discussions](https://github.com/bonderaustria/nexproxy/discussions)
