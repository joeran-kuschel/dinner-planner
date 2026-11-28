# Kubernetes deployment

The app runs in **Docker Desktop's Kubernetes** (context `docker-desktop`), in the `dinner-planner` namespace, and is reached at
`https://dinner.local`. `npm run k8s:deploy` is the whole workflow: it checks the cluster and the ingress controller, builds both image
targets, imports them into the cluster node and applies `k8s/`. Re-run it to push a code change.

## Images

- **Images are imported into the node, not pulled.** Docker Desktop runs Kubernetes as a kind node with its own image store, and it routes
  pulls through a registry mirror that cannot see local images. So `deploy.sh` pipes each image into the node
  (`docker save … | docker exec -i <node> ctr -n k8s.io images import -`), and the manifests use `imagePullPolicy: Never`.
  `tests/infra/k8s.test.ts` checks both.
- **Every build gets a fresh timestamp tag.** With a fixed `:dev` tag the pod spec does not change, so Kubernetes sees nothing to roll out
  and the old pod keeps running. `deploy.sh` builds `repo:<timestamp>` and substitutes it into the rendered manifests; the checked-in
  manifests keep `:dev`. `k8s/seed.sh` reads the tag back off the running Deployment rather than guessing.
- **A deploy cleans up after itself:** see [Image cleanup and disk space](image-cleanup.md).
- The two images are separate on purpose: the app image runs Next's standalone output and carries no Prisma CLI, schema or `tsx`; the
  migrator image has those and no Next server.
- **`prisma`, `tsx` and `dotenv` are runtime dependencies, not dev ones.** The migrator image installs with `--omit=dev`; moving any of them
  to `devDependencies` breaks migrations and seeding in the cluster with `Cannot find module 'dotenv/config'`.

## The cluster

- **Every script pins `--context docker-desktop`.** Never let a deploy follow whatever context happens to be current
  (`tests/infra/k8s.test.ts` checks this too).
- **The nginx ingress controller is shared** with other apps on this cluster (e.g. the time tracking tool). `deploy.sh` only checks that it
  exists and prints the install command if not; it never installs or changes it.
- **Migrations run as an init container**, not as a Job, so a pod can never serve traffic against a schema it does not understand.
  `prisma migrate deploy` only applies what is unrecorded, so repeating it is a no-op. Seeding is separate and manual (`npm run k8s:seed`):
  it must not resurrect sample recipes on every restart.
- **Postgres is a StatefulSet with a PersistentVolumeClaim.** `PGDATA` points at a subdirectory because Postgres refuses to initialise into
  a volume that already contains `lost+found`.
- **The database volume lives inside the kind node.** Resetting or updating Docker Desktop's Kubernetes deletes it, and so does
  `npm run k8s:delete`, which removes the whole namespace. See [Database backups](database-backups.md) (hourly dumps, restore); run
  `npm run k8s:backup` before anything risky.
- **Only the app's pods may reach the database:** see [Network policy for the database](database-network-policy.md).

## Secrets

None of these is a manifest: `deploy.sh` creates each once with `kubectl create` (never `apply`) and then leaves it alone.

- **Database password** (`dinner-planner-db`): Postgres reads `POSTGRES_PASSWORD` only when it creates the data directory, so a new
  password in the Secret alone locks the app out. Never `kubectl apply -k k8s` by hand (no Secret, Postgres does not start).
  [Database credentials](database-credentials.md).
- **Access key** (`dinner-planner-access`): the app container reads it as `ACCESS_KEY` and does not start without it. After the first
  deploy open `npm run k8s:access-link`'s link once on each device; until then the app answers 401 there. [Access key](access-key.md).
- **Certificate** (`dinner-planner-tls`, mkcert's): no certificate or key is ever in the repository (`tests/infra/k8s.test.ts` checks).
  Without mkcert and its certificate authority (`brew install mkcert && mkcert -install`) the first deploy stops with those commands and
  installs nothing. [TLS](tls.md).

## The address

Docker Desktop publishes the ingress controller's LoadBalancer on `localhost:80` and the HTTPS port its Service names (443; 8443 on a
cluster where another program holds 443, then the address is `https://dinner.local:8443`, which `deploy.sh` and
`npm run k8s:access-link` read from the Service, `k8s/ingress-address.sh`). `/etc/hosts` needs `127.0.0.1 dinner.local` **and**
`::1 dinner.local`: without the IPv6 line, macOS asks Bonjour about the `.local` name first and every request takes 5 seconds longer.
`deploy.sh` prints missing lines; it never edits `/etc/hosts`.
