import { PrismaPg } from "@prisma/adapter-pg";
import { requireDatabaseUrl } from "./database-url";

/**
 * Build the Postgres driver adapter from `DATABASE_URL`.
 *
 * `?schema=` has to be handed to the adapter explicitly: the Prisma CLI honours
 * that parameter, but the `pg` driver treats it as an unknown connection option
 * and ignores it. Without this, an app or test pointed at a named schema would
 * silently read and write `public` instead — which is how the test suite ended
 * up sharing the development data.
 */
export function createPgAdapter(): PrismaPg {
  const connectionString = requireDatabaseUrl();
  const schema = new URL(connectionString).searchParams.get("schema");
  return new PrismaPg({ connectionString }, schema ? { schema } : undefined);
}
