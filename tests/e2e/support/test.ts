import { test as base } from "@playwright/test";
import { Client } from "pg";
import { createMigratedSchema, emptySchema, urlForSchema } from "../../support/migrate";
import { startServer, type E2EServer } from "./server";

export { expect } from "@playwright/test";

/**
 * Playwright's `test`, with two additions. Every spec imports `test` from here, not from `@playwright/test`.
 *
 * - Each worker has a server of its own: its own copy of the standalone server, on its own port, working in its own schema of
 *   the development database (`e2e_0`, `e2e_1` …, created from the migrations when the worker starts), so workers cannot touch
 *   each other's data and the real data in `public` is never seen. `baseURL` is that server's address. A spec that needs the
 *   address or the schema asks for `baseURL` / `server` (`server.schema`).
 * - The database is emptied before every test, so a test never sees what another one left behind and can be repeated
 *   (`--repeat-each`) or run in any order. It empties the worker's schema only, over one connection per worker.
 *
 * A worker slot (`parallelIndex`) is reused when a worker restarts after a failure, and the old server is stopped first, so the
 * port and the schema are free again.
 */
export const test = base.extend<{ emptyDatabase: void }, { server: E2EServer; database: Client }>({
  server: [
    async ({}, use, workerInfo) => {
      const base = process.env.DATABASE_URL;
      if (!base) throw new Error("DATABASE_URL is not set. Start the database with `npm run db:up`.");
      const schema = `e2e_${workerInfo.parallelIndex}`;
      // createMigratedSchema refuses `public`, so a wrong schema name fails loudly instead of wiping the development data.
      await createMigratedSchema(base, schema);
      const server = await startServer(workerInfo.parallelIndex, urlForSchema(base, schema));
      // `use` returns once the worker is done with the fixture, whatever its tests did.
      await use(server);
      await server.stop();
    },
    { scope: "worker", auto: true, timeout: 90_000 },
  ],
  baseURL: [
    async ({ server }, use) => {
      await use(server.url);
    },
    { scope: "test" },
  ],
  database: [
    async ({}, use) => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is not set. Start the database with `npm run db:up`.");
      const client = new Client({ connectionString: url });
      await client.connect();
      await use(client);
      await client.end();
    },
    { scope: "worker" },
  ],
  // Not used by any test: it only runs, before each one.
  emptyDatabase: [
    async ({ database, server }, use) => {
      await emptySchema(database, server.schema);
      await use();
    },
    { auto: true },
  ],
});
