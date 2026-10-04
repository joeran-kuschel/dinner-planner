# The dinner-planner-db Secret: the database login, kept out of the repository. Sourced by deploy.sh, which
# creates it once with a random password, and by rotate-db-password.sh, which replaces the password.
# The app, the migrator, the seed job and Postgres itself read it through `envFrom` (app.yaml, postgres.yaml).
DB_SECRET=dinner-planner-db

# A password that needs no escaping in a URL or a SQL string.
new_db_password() { openssl rand -hex 24; }

# The Secret's manifest: db_secret_manifest <user> <password> <database>. Piped into `kubectl apply -f -`, so the
# password never appears in a command line.
db_secret_manifest() {
  cat <<MANIFEST
apiVersion: v1
kind: Secret
metadata:
  name: ${DB_SECRET}
  namespace: dinner-planner
stringData:
  POSTGRES_USER: $1
  POSTGRES_PASSWORD: $2
  POSTGRES_DB: $3
  # Read by the app and the migration job. The host is the dinner-planner-db Service.
  DATABASE_URL: postgresql://$1:$2@dinner-planner-db:5432/$3
MANIFEST
}
