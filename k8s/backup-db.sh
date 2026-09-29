#!/usr/bin/env bash
# Dumps the cluster's database to $BACKUP_DIR and thins out the older dumps.
# Run with `npm run k8s:backup`; the launchd job from install-backup-job.sh runs it hourly.
#
# Retention: every dump of the last $BACKUP_KEEP_HOURLY_HOURS hours, then only the
# newest dump of each day for $BACKUP_KEEP_DAILY_DAYS days, nothing older. Recipe photos
# live in the database and do not compress, so keeping every hourly dump for a week
# would grow with every recipe added.
set -euo pipefail
source "$(dirname "$0")/db-common.sh"
BACKUP_KEEP_HOURLY_HOURS="${BACKUP_KEEP_HOURLY_HOURS:-24}"
BACKUP_KEEP_DAILY_DAYS="${BACKUP_KEEP_DAILY_DAYS:-30}"

mkdir -p "$BACKUP_DIR"
target="$BACKUP_DIR/dinner_planner-$(date +%Y%m%d-%H%M%S).sql.gz"
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

# A backup is worth more than its tidying: a bad setting must not stop the dump above, so it is
# only reported here, after the dump is safe, and nothing is deleted.
for setting in BACKUP_KEEP_HOURLY_HOURS BACKUP_KEEP_DAILY_DAYS; do
  case "${!setting}" in
    '' | *[!0-9]*)
      echo "$(date '+%F %T') Backup written, but older dumps were not thinned out: $setting must be a whole number, not '${!setting}'" >&2
      exit 1
      ;;
  esac
done

# The oldest moment still kept hourly, and the oldest day still kept daily, written
# like the timestamps in the file names so that they compare as text. BSD date (macOS)
# first, GNU date second.
hourly_cutoff=$(date -v-"${BACKUP_KEEP_HOURLY_HOURS}"H +%Y%m%d-%H%M%S 2>/dev/null ||
  date -d "${BACKUP_KEEP_HOURLY_HOURS} hours ago" +%Y%m%d-%H%M%S)
daily_cutoff=$(date -v-"${BACKUP_KEEP_DAILY_DAYS}"d +%Y%m%d 2>/dev/null ||
  date -d "${BACKUP_KEEP_DAILY_DAYS} days ago" +%Y%m%d)

# Newest first, so the first dump seen for a day is that day's newest. A day that
# already has a kept dump (hourly or daily) needs no second one.
last_kept_day=""
printf '%s\n' "$BACKUP_DIR"/dinner_planner-*.sql.gz | sort -r | while read -r old; do
  stamp="${old##*/dinner_planner-}"
  stamp="${stamp%.sql.gz}"
  day="${stamp%%-*}"
  if [[ "$stamp" < "$hourly_cutoff" ]] && { [[ "$day" < "$daily_cutoff" ]] || [[ "$day" == "$last_kept_day" ]]; }; then
    rm -f "$old"
  else
    last_kept_day="$day"
  fi
done
