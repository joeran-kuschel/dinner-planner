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

gzip -dc "$file" | pg_exec 'psql -v ON_ERROR_STOP=1 --single-transaction -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" > /dev/null'
echo "Restored $file"
