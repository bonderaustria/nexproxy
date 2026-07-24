#!/bin/sh
# Health-Check fuer keepalived: prueft, ob NPM WIRKLICH ausliefert,
# nicht nur ob der Prozess laeuft. Exit 0 = gesund, Exit 1 = Failover ausloesen.
#
# Geprueft wird der oeffentliche Nginx-Port (80). Optional laesst sich zusaetzlich
# die Admin-API (81) pruefen, damit auch eine haengende Backend-App erkannt wird.

set -eu

PUBLIC_PORT="${NPM_PUBLIC_PORT:-80}"
ADMIN_PORT="${NPM_ADMIN_PORT:-81}"
TIMEOUT="${NPM_HEALTH_TIMEOUT:-2}"

# 1) Oeffentlicher Nginx muss antworten (irgendein HTTP-Status zaehlt als "lebt").
curl -sf -m "$TIMEOUT" -o /dev/null "http://127.0.0.1:${PUBLIC_PORT}/" \
  || curl -s  -m "$TIMEOUT" -o /dev/null -w '%{http_code}' "http://127.0.0.1:${PUBLIC_PORT}/" \
  | grep -qE '^[0-9]{3}$' \
  || exit 1

# 2) Admin-API/Backend muss ebenfalls erreichbar sein (erkennt haengendes Backend).
curl -sf -m "$TIMEOUT" -o /dev/null "http://127.0.0.1:${ADMIN_PORT}/api/" \
  || curl -s  -m "$TIMEOUT" -o /dev/null -w '%{http_code}' "http://127.0.0.1:${ADMIN_PORT}/api/" \
  | grep -qE '^(200|401)$' \
  || exit 1

exit 0
