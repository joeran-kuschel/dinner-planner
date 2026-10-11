#!/usr/bin/env bash
# Gives http://dinner.local a new random password. Run with `npm run k8s:rotate-auth-password`.
#
# The Secret only holds a hash, so this is also how you get a password back after losing it. The new password is
# printed once and is in no file. nginx reads the Secret again by itself: nothing restarts, and the old password
# stops working within seconds. The password only ever travels through stdin.
set -euo pipefail
cd "$(dirname "$0")/.."
source k8s/db-common.sh
source k8s/auth-secret.sh
KUBECTL=(kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE")

if ! "${KUBECTL[@]}" get secret "$AUTH_SECRET" >/dev/null 2>&1; then
  echo "The $AUTH_SECRET Secret does not exist yet. Run 'npm run k8s:deploy' first." >&2
  exit 1
fi

PASSWORD="$(new_auth_password)"
auth_secret_manifest "$AUTH_USER" "$PASSWORD" | "${KUBECTL[@]}" apply -f - >/dev/null
echo "http://dinner.local has a new login. Save it now, it is not shown again:"
echo
echo "  user:     $AUTH_USER"
echo "  password: $PASSWORD"
