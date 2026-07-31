---
outline: deep
---

## Certbot DNS plugins in NexProxy

NexProxy uses Certbot to issue and renew Let’s Encrypt certificates.

When you request a certificate using a DNS challenge, NexProxy installs
the corresponding Certbot DNS plugin for the provider you selected. The available
providers and package versions are defined in
⁠[certbot-dns-plugins.json](https://github.com/bonderaustria/nexproxy/blob/master/backend/certbot/dns-plugins.json).

## Important limitations

DNS plugins are maintained independently from Certbot and from NexProxy. As a result:
- Some plugins may lag behind current Certbot or dependency versions.
- A plugin may install package versions that conflict with other Certbot components.
- Support quality varies between providers, and not every plugin is regularly tested in NexProxy.

::: warning
Using more than one DNS provider in the same NexProxy instance may introduce Python
dependency conflicts between Certbot plugins.
:::

## If a DNS plugin does not work

1. Check the NexProxy container logs for Certbot or Python package installation errors.
2. Identify the plugin package and version defined for your provider in
⁠[certbot-dns-plugins.json](https://github.com/bonderaustria/nexproxy/blob/master/backend/certbot/dns-plugins.json).
3. Check [PyPI](https://pypi.org/) or the plugin project for a newer compatible release.
4. If needed, update the plugin definition, including any required dependency pins.
5. Submitting a pull request and CI will build a testable docker image for you.

## File reference

Use this file when reviewing or updating provider definitions:
- ⁠[certbot-dns-plugins.json](https://github.com/bonderaustria/nexproxy/blob/master/backend/certbot/dns-plugins.json)
