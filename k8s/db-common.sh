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

# The Postgres pod (the one replica of statefulset/dinner-planner-db; a StatefulSet's first pod has a fixed name) and where restore-db.sh puts the dump inside it.
DB_POD="dinner-planner-db-0"
POD_DUMP="/tmp/restore.sql.gz"

# The tables restore-db.sh counts after a restore, so the user sees what came back.
COUNTS_SQL='SELECT $$Recipe$$, count(*) FROM "Recipe" UNION ALL SELECT $$RecipePhoto$$, count(*) FROM "RecipePhoto" UNION ALL SELECT $$Ingredient$$, count(*) FROM "Ingredient" UNION ALL SELECT $$PlannedMeal$$, count(*) FROM "PlannedMeal" UNION ALL SELECT $$GroceryEntry$$, count(*) FROM "GroceryEntry" UNION ALL SELECT $$Tag$$, count(*) FROM "Tag";'
