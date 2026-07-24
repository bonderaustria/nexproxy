# Security Policy

## Supported Versions

Only the latest stable release receives security updates. Older versions are not actively maintained.

| Version | Supported |
| ------- | --------- |
| 1.0.x (latest) | :white_check_mark: |
| < 1.0.0 | :x: |

Docker image: `ghcr.io/bonderaustria/nexproxy:latest`

See all releases: https://github.com/bonderaustria/nexproxy/releases

## Upstream fixes

NexProxy tracks security-relevant fixes from the upstream
[Nginx Proxy Manager](https://github.com/NginxProxyManager/nginx-proxy-manager) project and backports
them promptly — including fixes that are merged upstream but not yet in an upstream stable release.

## Reporting a Vulnerability

**Do NOT open a public GitHub Issue to report a security vulnerability.**

Use GitHub's private vulnerability reporting:
https://github.com/bonderaustria/nexproxy/security/advisories/new

Please include:
- Affected version (Docker image tag or release)
- Description of the vulnerability
- Steps to reproduce
- Potential impact

Once a fix is available, a public GitHub Security Advisory will be published.
