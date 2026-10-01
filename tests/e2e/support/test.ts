import { test as base } from "@playwright/test";
import { Client } from "pg";
import { E2E_SCHEMA } from "../../../playwright.config";
import { emptySchema } from "../../support/migrate";

export { expect } from "@playwright/test";

/**
 * Playwright's `test`, with one addition: the database is emptied before every test, so a test
 * never sees what another one left behind and can be repeated (`--repeat-each`) or run in any
 * order. Every spec imports `test` from here, not from `@playwright/test`.
 *
 * It empties the `e2e` schema only (see `E2E_SCHEMA`), over one connection per worker. That is
 * safe because the tests run one after another: with several workers on the one schema, a reset
 * would pull the data from under a test that is running (each worker would need a schema of its own).
 */
export const test = base.extend<{ emptyDatabase: void }, { database: Client }>({
  database: [
    async ({}, use) => {
      const url = process.env.DATABASE_URL;
      if (!url) throw new Error("DATABASE_URL is not set. Start the database with `npm run db:up`.");
      const client = new Client({ connectionString: url });
      await client.connect();
      // `use` returns once the worker is done with the fixture, whatever its tests did.
      await use(client);
      await client.end();
    },
    { scope: "worker" },
  ],
  // Not used by any test: it only runs, before each one.
  emptyDatabase: [
    async ({ database }, use, testInfo) => {
      if (testInfo.config.workers > 1) {
        throw new Error("The end-to-end tests empty one shared schema before each test, so they need `workers: 1`.");
      }
      await emptySchema(database, E2E_SCHEMA);
      await use();
    },
    { auto: true },
  ],
});
