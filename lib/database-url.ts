/**
 * The Postgres connection string.
 *
 * Both the Prisma CLI (via `prisma7.config.ts`) and the running app read it
 * through here, so a missing value fails with one clear message instead of an
 * opaque driver error deep in a request.
 *
 * Local development gets it from `.env`; in Kubernetes it is assembled from the
 * `dinner-planer-db` Secret by the Deployment.
 */
export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env and start Postgres with `npm run db:up`.",
    );
  }
  return url;
}
