/**
 * Makes sure `.env` has the database password `docker compose` and the app need; runs before `npm run db:up`.
 * See scripts/env-lib.ts for the rules and documentation/backend/database-credentials.md for the why.
 */
import fs from "node:fs";
import { ensureEnv } from "./env-lib";

const current = fs.existsSync(".env") ? fs.readFileSync(".env", "utf-8") : undefined;
const { text, note } = ensureEnv(current, fs.readFileSync(".env.example", "utf-8"));

if (text !== current) {
  fs.writeFileSync(".env", text, { mode: 0o600 });
  if (note) console.log(note);
}
