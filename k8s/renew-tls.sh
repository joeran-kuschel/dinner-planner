#!/usr/bin/env bash
# Gives https://dinner.local a fresh certificate. Run with `npm run k8s:renew-tls`.
#
# mkcert certificates last about two years and three months. When the browser says the certificate has expired, run
# this: it makes a new one and replaces the dinner-planner-tls Secret. The ingress controller picks the new Secret up
# by itself, so nothing restarts. It needs mkcert and its certificate authority, as deploy.sh does.
set -euo pipefail
cd "$(dirname "$0")/.."
KUBE_CONTEXT=docker-desktop
NAMESPACE=dinner-planner
HOST=dinner.local
source k8s/tls-secret.sh

require_mkcert "$HOST"
KUBECTL=(kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE")
if "${KUBECTL[@]}" get secret "$TLS_SECRET" >/dev/null 2>&1; then
  tls_secret_manifest "$HOST" | "${KUBECTL[@]}" replace -f - >/dev/null
else
  tls_secret_manifest "$HOST" | "${KUBECTL[@]}" create -f - >/dev/null
fi
echo "Done: https://$HOST has a new certificate."
