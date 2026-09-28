#!/usr/bin/env bash
# Dumps the cluster's database to $BACKUP_DIR and keeps the newest $BACKUP_KEEP dumps.
# Run with `npm run k8s:backup`; the launchd job from install-backup-job.sh runs it hourly.
set -euo pipefail
source "$(dirname "$0")/db-common.sh"
BACKUP_KEEP="${BACKUP_KEEP:-168}"

mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/dinner_planer-$(date +%Y%m%d-%H%M%S).sql.gz"
partial="$target.partial"
trap 'rm -f "$partial"' EXIT

pg_exec 'pg_dump --clean --if-exists -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip > "$partial"

# pg_dump writes this line at the end; without it the dump is incomplete.
if ! gzip -dc "$partial" | grep -q 'PostgreSQL database dump complete'; then
  echo "$(date '+%F %T') Backup incomplete, previous backups kept" >&2
  exit 1
fi
mv "$partial" "$target"
echo "$(date '+%F %T') Backup written: $target"

ls -1t "$BACKUP_DIR"/dinner_planer-*.sql.gz | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  rm -f "$old"
done
