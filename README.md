# Dinner Planner

Plan the week's dinners, keep your recipes in one place, and get a single grocery
list for everything you need to buy.

- **This week** — one dinner slot per day. Pick a recipe, set how many people it
  is for, add a note, or type your own entry for a takeaway night. Everything
  saves as you go.
- **Recipes** — name, servings, ingredients with amounts and units, and a method.
  Quantities are written for a given number of people and scale automatically
  when you plan for more.
- **Groceries** — every ingredient from the week's meals, combined and
  deduplicated, with tick-off boxes and room to add things the recipes miss.

Runs entirely on your own machine: Postgres in Docker for development, and
Docker Desktop's Kubernetes for the real thing. Nothing leaves your laptop and there
are no accounts.

## Getting started

```bash
npm install
npm run db:up                       # Postgres in Docker, on host port 5433; creates .env with a random password
npm run db:migrate -- --name init   # create the schema
npm run db:seed                     # optional: a few recipes to start from
npm run dev
```

Then open http://localhost:3000.

The database password is not in the repository: `npm run db:up` writes a random one into `.env`
(which git ignores), and the cluster gets its own when it is first deployed. See
[documentation/backend/database-credentials.md](documentation/backend/database-credentials.md).

### In Kubernetes

Deploys to Docker Desktop's Kubernetes (turn it on in Docker Desktop under
Settings → Kubernetes) in one command:

```bash
npm run k8s:deploy   # builds the images, imports them into the cluster, applies k8s/
npm run k8s:seed     # optional sample data
```

The app is then at http://dinner.local. `k8s:deploy` prints the `/etc/hosts`
lines to add if they are missing (they need sudo, so it will not do it for
you). `npm run k8s:delete` removes it again, including its database. The first deploy creates the
database login with a random password; `npm run k8s:rotate-db-password` replaces it later.

The cluster's database is backed up every hour to `~/DinnerPlannerBackups` once
you run `npm run k8s:backup:install`; see
[documentation/backend/database-backups.md](documentation/backend/database-backups.md)
for restoring.

## Everyday commands

| Command | What it does |
| --- | --- |
| `npm run db:up` / `npm run db:down` | Start / stop the development database |
| `npm run dev` | Start the app on :3000 |
| `npm run build` / `npm start` | Production build and serve |
| `npm run db:studio` | Browse and edit the database in the browser |
| `npm run db:seed` | Re-add the sample recipes (safe to re-run) |
| `npm test` / `npm run test:e2e` | Unit and end-to-end tests |
| `npm run typecheck` / `npm run lint` | Type and lint checks |
| `npm run k8s:deploy` / `npm run k8s:status` | Deploy to Kubernetes / inspect it |
| `npm run k8s:backup` / `npm run k8s:restore -- <file>` | Back up / restore the cluster's database |

## Built with

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 ·
Prisma 7 · Postgres · Docker · Kubernetes (Docker Desktop)

See `CLAUDE.md` for the notes that matter when changing the code.

## License

[MIT](LICENSE)
