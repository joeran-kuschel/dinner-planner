# Database backups

In Kubernetes, the database runs inside Docker Desktop's cluster. Its volume lives inside the cluster's node, so resetting
or updating Docker Desktop's Kubernetes, or `npm run k8s:delete` (which removes the whole `dinner-planer` namespace),
deletes all data. Hourly backups to a folder on the Mac protect against that.

The development database from `npm run db:up` is not backed up; it only holds test and sample data.

## How it works

- `k8s/backup-db.sh` runs `pg_dump` inside the Postgres pod (`statefulset/dinner-planer-db`) and writes a
  gzip-compressed dump to the backup folder.
- A dump is only kept if it is complete. `pg_dump` ends every full dump with `PostgreSQL database dump complete`; a dump
  without that line is discarded and the previous backups stay untouched.
- The newest 168 dumps are kept (one week of hourly backups). Older ones are deleted.
- A launchd job runs the backup every hour and right after the Mac wakes up. It only succeeds while Docker Desktop and the
  cluster are running; failed runs are logged and retried at the next interval.
- The credentials never leave the cluster: the commands run inside the Postgres pod, which gets them from the
  `dinner-planer-db` Secret.

Backups are stored outside the repository and must never be committed.

## Setup

```bash
npm run k8s:backup:install                  # install the hourly job (runs a first backup right away)
bash k8s/install-backup-job.sh --uninstall  # remove the job; existing backups are kept
```

## Manual backup and restore

```bash
npm run k8s:backup
npm run k8s:restore -- ~/DinnerPlanerBackups/dinner_planer-20260928-124534.sql.gz
```

A restore replaces **all** current data with the backup, so it asks you to type `restore` first. Pass `--yes` after the
file to skip the question in scripts. The restore runs in a single transaction: if any statement fails, nothing is
changed.

### After a cluster reset

1. Deploy the app again with `npm run k8s:deploy`. The migrations create an empty schema.
2. Restore the newest backup: `npm run k8s:restore -- "$(ls -1t ~/DinnerPlanerBackups/*.sql.gz | head -1)"`.

## Configuration

All scripts read these environment variables (shared defaults in `k8s/db-common.sh`):

| Variable | Default | Meaning |
|---|---|---|
| `BACKUP_DIR` | `~/DinnerPlanerBackups` | Folder for dumps and `backup.log` |
| `BACKUP_KEEP` | `168` | Number of dumps to keep |
| `KUBE_CONTEXT` | `docker-desktop` | kubectl context of the cluster |
| `NAMESPACE` | `dinner-planer` | Namespace of the Postgres StatefulSet |

`install-backup-job.sh` stores `BACKUP_DIR`, `KUBE_CONTEXT` and `NAMESPACE` in the launchd job, so run it again after
changing them.

## Checking the backups

```bash
tail ~/DinnerPlanerBackups/backup.log
launchctl print gui/$(id -u)/com.dinnerplaner.db-backup | grep -E "state|last exit"
```

## Limits

- Up to one hour of data can be lost between two backups.
- No backups are taken while the Mac is off or the cluster is down.
- Backups stay on this Mac. If Time Machine is turned on, it includes the folder; otherwise there is no second copy.

## Tests

`test/db-backup-scripts.test.ts` runs the scripts against a fake `kubectl` and `launchctl`. It covers complete and
incomplete dumps, an unreachable cluster, retention, the restore confirmation and the launchd job.
