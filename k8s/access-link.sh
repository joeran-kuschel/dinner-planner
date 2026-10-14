#!/usr/bin/env bash
# Prints the private link that gives a browser access to the planner. Run with `npm run k8s:access-link`.
#
# Open the link once on each device (or scan the QR code, when `qrencode` is installed). The page behind it takes the key
# from the address after `#`, which never leaves the browser until it is posted to the app, and sets a cookie. The key
# is shown in this terminal only: treat the link like a password.
set -euo pipefail
cd "$(dirname "$0")/.."
KUBE_CONTEXT=docker-desktop
NAMESPACE=dinner-planner
HOST=dinner.local
source k8s/access-secret.sh

KEY="$(kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" get secret "$ACCESS_SECRET" -o 'go-template={{index .data "ACCESS_KEY" | base64decode}}')"
LINK="$(access_link "$HOST" "$KEY")"

echo "Open this link once on each device that should use the planner:"
echo
echo "  $LINK"
if command -v qrencode >/dev/null 2>&1; then
  echo
  qrencode -t ANSIUTF8 "$LINK"
fi
echo
echo "Anyone with the link has full access. If it gets out, run: npm run k8s:rotate-access-key"
