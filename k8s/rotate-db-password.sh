#!/usr/bin/env bash
# Gives the cluster's database a new random password. Run with `npm run k8s:rotate-db-password`.
#
# Postgres reads POSTGRES_PASSWORD only when it creates the data directory, so changing the Secret alone would lock
# the app out. This script backs the database up first, puts the new password into the Secret, changes it in
# Postgres (over the pod's local socket, which needs no password), and restarts Postgres and the app so both read
# the Secret again. If Postgres refuses, the old Secret is put back. The password only ever travels through stdin.
set -euo pipefail
cd "$(dirname "$0")/.."
source k8s/db-common.sh
source k8s/db-secret.sh
KUBECTL=(kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE")

secret_field() { "${KUBECTL[@]}" get secret "$DB_SECRET" -o "go-template={{index .data \"$1\" | base64decode}}"; }

DB_USER="$(secret_field POSTGRES_USER)"
DB_NAME="$(secret_field POSTGRES_DB)"
OLD_PASSWORD="$(secret_field POSTGRES_PASSWORD)"
NEW_PASSWORD="$(new_db_password)"

echo "Backing up the database first"
bash k8s/backup-db.sh

echo "Replacing the password"
db_secret_manifest "$DB_USER" "$NEW_PASSWORD" "$DB_NAME" | "${KUBECTL[@]}" apply -f - >/dev/null
if ! printf "ALTER ROLE :\"dbuser\" WITH PASSWORD '%s';\n" "$NEW_PASSWORD" \
  | pg_exec 'psql -v ON_ERROR_STOP=1 -q -v dbuser="$POSTGRES_USER" -U "$POSTGRES_USER" -d "$POSTGRES_DB"'; then
  db_secret_manifest "$DB_USER" "$OLD_PASSWORD" "$DB_NAME" | "${KUBECTL[@]}" apply -f - >/dev/null
  echo "Postgres refused the new password. The old Secret is back and nothing has changed." >&2
  exit 1
fi

echo "Restarting Postgres and the app"
"${KUBECTL[@]}" rollout restart statefulset/dinner-planner-db deployment/dinner-planner >/dev/null
"${KUBECTL[@]}" rollout status statefulset/dinner-planner-db --timeout=300s
"${KUBECTL[@]}" rollout status deployment/dinner-planner --timeout=300s
echo "Done: the database has a new password, and only the $DB_SECRET Secret knows it."
