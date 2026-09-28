import { config as loadEnv } from "dotenv";
import { E2E_SCHEMA } from "../playwright.config";
import { createMigratedSchema } from "../test/migrate";

// Run by playwright.config.ts before the server starts. Wrapped in a function
// rather than using top-level await: tsx compiles this to CommonJS, which does
// not support it.
async function main() {
  loadEnv({ quiet: true });

  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) {
    throw new Error("DATABASE_URL is not set. Start the local database with `npm run db:up`.");
  }

  // createMigratedSchema refuses to touch `public`, so a wrong schema name here
  // fails loudly instead of wiping the development data.
  await createMigratedSchema(baseUrl, E2E_SCHEMA);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
