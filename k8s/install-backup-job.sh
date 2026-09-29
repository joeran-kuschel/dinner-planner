#!/usr/bin/env bash
# Installs a launchd job that runs backup-db.sh every hour (and after the Mac wakes up).
# Usage: k8s/install-backup-job.sh [--uninstall]
set -euo pipefail
source "$(dirname "$0")/db-common.sh"
LABEL="com.dinnerplanner.db-backup"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
SCRIPT="$(cd "$(dirname "$0")" && pwd)/backup-db.sh"

launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true

if [ "${1:-}" = "--uninstall" ]; then
  rm -f "$PLIST"
  echo "Backup job removed. Existing backups in $BACKUP_DIR are kept."
  exit 0
fi

mkdir -p "$BACKUP_DIR" "$(dirname "$PLIST")"
cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array><string>/bin/bash</string><string>$SCRIPT</string></array>
  <key>StartInterval</key><integer>3600</integer>
  <key>RunAtLoad</key><true/>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin</string>
    <key>BACKUP_DIR</key><string>$BACKUP_DIR</string>
    <key>KUBE_CONTEXT</key><string>$KUBE_CONTEXT</string>
    <key>NAMESPACE</key><string>$NAMESPACE</string>
  </dict>
  <key>StandardOutPath</key><string>$BACKUP_DIR/backup.log</string>
  <key>StandardErrorPath</key><string>$BACKUP_DIR/backup.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "Backup job installed: hourly backups to $BACKUP_DIR (log: $BACKUP_DIR/backup.log)"
