import { config as loadEnv } from "dotenv";
import { dropStaleTestSchemas } from "./migrate";

/**
 * Vitest global setup: a run that is killed (Ctrl-C, a time limit, a crash) never reaches the
 * `afterAll` that drops its schemas, and they pile up in the development database. This removes
 * the ones that are old enough to be leftovers, before the files of this run create theirs.
 */
export default async function dropStaleSchemas() {
  loadEnv({ quiet: true });
  const baseUrl = process.env.DATABASE_URL;
  if (!baseUrl) return; // setup-server.ts explains the missing variable
  await dropStaleTestSchemas(baseUrl);
}
