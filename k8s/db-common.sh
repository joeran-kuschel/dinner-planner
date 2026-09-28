# Shared settings for the database backup scripts; each can be overridden by an
# environment variable.
KUBE_CONTEXT="${KUBE_CONTEXT:-docker-desktop}"
NAMESPACE="${NAMESPACE:-dinner-planer}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/DinnerPlanerBackups}"

# Runs a shell command in the Postgres pod, which has the credentials from the
# dinner-planer-db Secret, so they never leave the cluster.
pg_exec() {
  kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" exec -i statefulset/dinner-planer-db -- sh -c "$1"
}
