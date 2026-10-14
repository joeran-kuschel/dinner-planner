#!/usr/bin/env bash
# Gives the planner a new access key. Run with `npm run k8s:rotate-access-key`.
#
# Use it when the link has leaked or a device is lost: the old key stops working at once, and so does every cookie
# made from it, on every device. The Secret is replaced, the app restarts to read it, and each device needs the new
# link (`npm run k8s:access-link`) once.
set -euo pipefail
cd "$(dirname "$0")/.."
KUBE_CONTEXT=docker-desktop
NAMESPACE=dinner-planner
source k8s/access-secret.sh
KUBECTL=(kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE")

echo "Replacing the access key"
access_secret_manifest "$(new_access_key)" | "${KUBECTL[@]}" replace -f - >/dev/null

echo "Restarting the app"
"${KUBECTL[@]}" rollout restart deployment/dinner-planner >/dev/null
"${KUBECTL[@]}" rollout status deployment/dinner-planner --timeout=300s
echo "Done: every device is logged out. Print the new link with: npm run k8s:access-link"
