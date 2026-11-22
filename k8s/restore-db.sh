#!/usr/bin/env bash
# Restores a dump from backup-db.sh into the cluster's database. This replaces all current data.
# Usage: k8s/restore-db.sh <backup.sql.gz> [--yes]
set -euo pipefail
source "$(dirname "$0")/db-common.sh"

file="${1:-}"
if [ ! -f "$file" ]; then
  echo "Usage: $0 <backup.sql.gz> [--yes]" >&2
  exit 1
fi

if [ "${2:-}" != "--yes" ]; then
  read -r -p "This replaces all data in $NAMESPACE with $file. Type 'restore' to continue: " answer || answer=""
  if [ "$answer" != "restore" ]; then
    echo "Aborted" >&2
    exit 1
  fi
fi

# The dump goes into the pod as a file first: streaming it through `kubectl exec` stdin cut the stream off partway
# (a different row each time) on a 40 MB dump, and the single transaction then rolled everything back.
# Removed again whatever happens, a copy that stopped partway included.
trap 'pg_exec "rm -f $POD_DUMP" > /dev/null 2>&1 || true' EXIT
kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" cp "$file" "$DB_POD:$POD_DUMP"
pg_exec "gzip -t $POD_DUMP && gzip -dc $POD_DUMP | psql -v ON_ERROR_STOP=1 --single-transaction -q -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\" > /dev/null"
echo "Restored $file"
