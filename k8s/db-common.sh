# Shared settings for the database backup scripts; each can be overridden by an
# environment variable.
KUBE_CONTEXT="${KUBE_CONTEXT:-docker-desktop}"
NAMESPACE="${NAMESPACE:-dinner-planner}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/DinnerPlannerBackups}"

# Runs a shell command in the Postgres pod, which has the credentials from the
# dinner-planner-db Secret, so they never leave the cluster.
pg_exec() {
  kubectl --context "$KUBE_CONTEXT" -n "$NAMESPACE" exec -i statefulset/dinner-planner-db -- sh -c "$1"
}
