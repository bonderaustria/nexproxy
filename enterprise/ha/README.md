# Simple HA — Active-Passive Failover (Enterprise)

> Teil des kommerziellen `enterprise/`-Moduls. Nicht von der MIT-Lizenz des Kerns abgedeckt — siehe `enterprise/LICENSE`.

Zwei NPM-Nodes teilen sich eine Floating-IP (VIP). Fällt der aktive Node aus
(Node tot **oder** NPM liefert nicht mehr aus), übernimmt der Standby innerhalb
weniger Sekunden die VIP. Für Clients bleibt die Adresse gleich.

```
              Clients / Router
                    │
             VIP 192.168.20.200          ← hierhin zeigt alles
                    │
       ┌────────────┴────────────┐
   Node A (MASTER)          Node B (BACKUP)
   NPM + keepalived  ◄─VRRP─►  NPM + keepalived
       └────────────┬────────────┘
                    ▼
        MariaDB (shared)  +  NFS (/etc/letsencrypt)
        eigener Host — z.B. LXC 117
```

## Was geteilt wird

| Zustand | Wo | Warum |
|---|---|---|
| Proxy-Hosts, Zertifikat-Metadaten, User | **MariaDB** (ein Host) | Beide Nodes lesen dieselbe Config |
| Let's-Encrypt-Certs (`/etc/letsencrypt`) | **NFS-Volume** | Standby muss TLS sofort ausliefern können |
| Generierte Nginx-Configs (`/data/nginx`) | **lokal pro Node** | Jeder Node erzeugt sie selbst aus der DB |

## Bewusster Kompromiss (Phase 1)

Diese Stufe schützt gegen **Node-/NPM-Ausfall**, **nicht** gegen DB-Ausfall —
die MariaDB ist hier der Single-Point-of-Failure. DB-HA (Galera/Replikation)
ist ein späterer Ausbau.

## Deployment (zwei echte Hosts im selben LAN)

Echtes VRRP-IP-Takeover braucht zwei getrennte Hosts (VMs/LXCs) im selben L2-Netz.

1. Auf **beiden** Hosts NPM (dieses Fork-Image) installieren, beide auf dieselbe
   MariaDB zeigen lassen (`DB_MYSQL_HOST=…`) und `/etc/letsencrypt` per NFS mounten.
2. `keepalived` installieren: `apt install keepalived`.
3. `check_npm.sh` nach `/etc/keepalived/check_npm.sh` kopieren (`chmod +x`).
4. `keepalived.master.conf` auf Node A bzw. `keepalived.backup.conf` auf Node B
   nach `/etc/keepalived/keepalived.conf` kopieren.
5. In beiden Configs anpassen: `interface`, VIP, `auth_pass`, `virtual_router_id`.
6. `systemctl enable --now keepalived` auf beiden Hosts.

### Failover testen
```bash
# Auf Node A NPM stoppen -> VIP muss auf Node B wandern:
systemctl stop openresty   # bzw. den NPM-Dienst/Container
ip addr show eth0 | grep 192.168.20.200   # auf Node B jetzt sichtbar
```

## Lokaler Proof-of-Concept (ein Host, ohne IP-Takeover)

`docker-compose.ha-poc.yml` startet zwei NPM-Nodes gegen eine gemeinsame MariaDB.
Beweist den geteilten Zustand (Config-Sync + Cert-Sharing); das VIP-Failover
selbst ist damit **nicht** testbar (dafür zwei Hosts nötig).

```bash
docker compose -f docker-compose.ha-poc.yml up -d
# node-a Admin: http://localhost:8181   node-b Admin: http://localhost:8281
```
