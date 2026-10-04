# Database credentials

No file in the repository holds a database password. It lives in three places, none of them committed:

| Where | Password lives in | Created by |
|---|---|---|
| Local development and tests | `.env` (git-ignored), as `POSTGRES_PASSWORD` and inside `DATABASE_URL` | `npm run db:up` |
| The cluster | the `dinner-planner-db` Secret | `npm run k8s:deploy`, the first time |
| GitHub Actions | a throwaway in `.github/workflows/check.yml`, for a database that exists only on the runner | — |

The user (`dinner`) and the database name (`dinner_planner`) are not secret and stay in `compose.yaml`, `.env.example`
and `k8s/db-secret.sh`.

## Locally

`npm run db:up` first runs `scripts/ensure-env.ts` (rules in `scripts/env-lib.ts`), then `docker compose up`:

- **No `.env`:** it is created from `.env.example` with a random password (48 hex characters, which need no escaping
  in a URL) instead of the placeholder `change-me`, readable by you only.
- **An older `.env` with a `DATABASE_URL` but no `POSTGRES_PASSWORD`:** the password in that URL is copied into
  `POSTGRES_PASSWORD`. The existing Docker volume was created with it, and Postgres ignores a changed
  `POSTGRES_PASSWORD` for a data directory that exists.
- **A `.env` with `POSTGRES_PASSWORD`:** left alone.

`compose.yaml` has no default for the password. Started without `.env`, `docker compose` stops with a message that
points at `npm run db:up`. The app, Prisma, the tests and Playwright all read `DATABASE_URL` from `.env` as before.

To give the local database a new password, change both lines of `.env` and recreate the volume
(`npm run db:down && docker volume rm dinner-planner_dinner-planner-pgdata && npm run db:up`), which empties the
development data; `npm run db:migrate` and `npm run db:seed` bring the schema and the sample recipes back.

## In the cluster

The Secret is not a manifest in `k8s/`. `deploy.sh` makes sure the namespace exists, then:

- **No Secret yet:** it renders one from `k8s/db-secret.sh` with a random password and applies it. The password goes
  through stdin only, so it is in no command line, log or output.
- **A Secret exists:** it is kept. A new password in the Secret alone would lock the app out of the existing database,
  because Postgres reads `POSTGRES_PASSWORD` only when it creates the data directory.

The app, the migration init container, the seed job and Postgres itself read the Secret through `envFrom`
(`app.yaml`, `postgres.yaml`, `seed-job.yaml`). The backup scripts run inside the Postgres pod and reach the database
over its local socket, so they need no password.

Because the Secret is no longer in the kustomization, `kubectl apply -k k8s` on its own would leave Postgres without
its Secret and unable to start. Always deploy with `npm run k8s:deploy`. `npm run k8s:delete` removes the namespace,
and the Secret with it; the next deploy creates a new one together with a new, empty database volume.

### Changing the password: `npm run k8s:rotate-db-password`

1. Reads the user, database and current password from the Secret.
2. Takes a backup (`k8s/backup-db.sh`); an incomplete dump stops everything before anything has changed.
3. Applies a Secret with the new random password.
4. Runs `ALTER ROLE … WITH PASSWORD` in the Postgres pod, with the statement on stdin. If Postgres refuses, the old
   Secret is applied again and the script fails: nothing has changed.
5. Restarts Postgres and the app (`rollout restart`) and waits for both, so they read the Secret again.

Run it once on a cluster that was deployed before the Secret moved out of the repository: that Secret still has the
old, published password until it is rotated. Rotating again is safe at any time.

## Tests

- `tests/infra/ensure-env.test.ts`: the three `.env` cases, a different password every time, and URL-safe characters.
- `tests/infra/compose.test.ts`: compose takes its password from `.env`, `.env.example` is consistent, `.env` is ignored.
- `tests/infra/k8s-deploy-scripts.test.ts`: the first deploy creates the Secret with a random password that appears
  nowhere but stdin, and a later deploy keeps it.
- `tests/infra/db-rotate-script.test.ts`: the order of the steps, the rollback when Postgres refuses, no change after a
  failed backup, and no password in a command line or output.
- `tests/infra/k8s.test.ts`: no password, and no `kind: Secret`, in the manifests, the scripts, compose or the README.
