import { randomBytes } from "node:crypto";

export const PLACEHOLDER = "change-me";

export type EnvResult = { text: string; note?: string };

/** The password in a `.env` line `DATABASE_URL="postgresql://user:password@host…"`, if there is one. */
function passwordInUrl(env: string): string | undefined {
  const url = /^DATABASE_URL=["']?([^"'\n]+)["']?\s*$/m.exec(env)?.[1];
  if (!url) return undefined;
  try {
    return decodeURIComponent(new URL(url).password) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * The `.env` text with a database password in it, for `docker compose` (POSTGRES_PASSWORD) and for the app
 * (DATABASE_URL). A `.env` that already has one is left alone. A `.env` from before this existed keeps the password
 * its DATABASE_URL has, because the Postgres volume was created with it and ignores a new one. Otherwise the example
 * is filled in with a random password; hex, so it needs no escaping in a URL.
 */
export function ensureEnv(current: string | undefined, example: string, generate = () => randomBytes(24).toString("hex")): EnvResult {
  if (current && /^POSTGRES_PASSWORD=/m.test(current)) return { text: current };

  if (current && passwordInUrl(current)) {
    return {
      text: `${current.replace(/\n*$/, "\n")}POSTGRES_PASSWORD="${passwordInUrl(current)}"\n`,
      note: "Added POSTGRES_PASSWORD to .env, with the password your DATABASE_URL already has: the existing database keeps it.",
    };
  }

  const password = generate();
  const created = example.replaceAll(PLACEHOLDER, password);
  if (!current) return { text: created, note: "Created .env with a random database password." };

  const lines = created.split("\n").filter((line) => /^(POSTGRES_PASSWORD|DATABASE_URL)=/.test(line));
  const kept = current.replace(/^DATABASE_URL=.*\n?/m, "").replace(/\n*$/, "\n");
  return { text: `${kept}${lines.join("\n")}\n`, note: "Added a random database password to .env." };
}
