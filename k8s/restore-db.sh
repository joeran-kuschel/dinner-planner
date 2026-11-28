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

# One transaction that only commits when psql has read the whole dump: BEGIN first, COMMIT and then the marker query last,
# chained with && so a dump that stops decompressing partway sends neither. The marker comes after COMMIT, so it also proves the commit went through. A stream that ends anywhere else leaves the
# transaction open, and Postgres rolls it back. (--single-transaction would COMMIT a stream that ends exactly between two
# statements and report success: the partial restore of issue #107.) Only the marker coming back counts as success.
if ! output=$(pg_exec "gzip -t $POD_DUMP && { echo 'BEGIN;'; gzip -dc $POD_DUMP && echo 'COMMIT;' && echo \"SELECT 'restore-complete';\"; } | psql -v ON_ERROR_STOP=1 -q -t -A -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\""); then
  echo "Restore failed: the restore was rolled back or did not complete (see above)" >&2
  exit 1
fi
if ! grep -qx 'restore-complete' <<< "$output"; then
  echo "Restore did not finish (the dump ended early): it was rolled back or not committed" >&2
  exit 1
fi

echo "Restored $file"
# What came back, so a restore into an empty database is not taken for a good one. The restore is done, so a failure here only warns.
if ! counts=$(printf '%s\n' "$COUNTS_SQL" | pg_exec 'psql -v ON_ERROR_STOP=1 -t -A -F " " -U "$POSTGRES_USER" -d "$POSTGRES_DB"'); then
  echo "Restored, but the row counts could not be read" >&2
  exit 0
fi
echo "Rows now in the database:"
awk '{ printf "  %-14s %s\n", $1, $2 }' <<< "$counts"
