import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";

// Resolved from the working directory: vitest and playwright both run from the
// project root, and `__dirname` is not available once this module is pulled
// into an ESM graph.
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

/** The migration SQL in `prisma/migrations`, in order. */
function migrationSql(): string[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => fs.readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf-8"));
}

/** `postgresql://…/db?schema=<name>` — the form Prisma expects. */
export function urlForSchema(baseUrl: string, schema: string): string {
  const url = new URL(baseUrl);
  url.searchParams.set("schema", schema);
  return url.toString();
}

/**
 * Drop and recreate `schema` in the database `baseUrl` points at, with every
 * migration from `prisma/migrations` applied.
 *
 * Isolation is per schema rather than per database: a schema is created and
 * dropped far more cheaply than a database, and `?schema=` is all Prisma needs
 * to be pointed at it. Tests and the end-to-end server use this instead of
 * `prisma migrate`, so they never touch the development data in `public`.
 */
export async function createMigratedSchema(baseUrl: string, schema: string): Promise<void> {
  if (schema === "public") {
    throw new Error("Refusing to recreate the `public` schema — that is the development data.");
  }

  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    const quoted = quoteIdent(schema);
    await client.query(`DROP SCHEMA IF EXISTS ${quoted} CASCADE`);
    await client.query(`CREATE SCHEMA ${quoted}`);
    // The migration SQL is written unqualified, so it lands wherever the search
    // path points — which is how one schema per test file stays isolated.
    await client.query(`SET search_path TO ${quoted}`);
    for (const sql of migrationSql()) {
      await client.query(sql);
    }
  } finally {
    await client.end();
  }
}

/**
 * Delete every row of every table in `schema`, keeping the tables. Prisma's own bookkeeping table is
 * left alone. Every table is named with its schema, never through the search path, so this can only
 * ever reach `schema`.
 *
 * The end-to-end tests call this before each test, so that none of them sees what another left
 * behind. It takes the tables from the database rather than from a list, so a new model is emptied
 * without anyone remembering to add it.
 */
export async function emptySchema(client: Client, schema: string): Promise<void> {
  if (schema === "public") {
    throw new Error("Refusing to empty the `public` schema — that is the development data.");
  }

  const { rows } = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname = $1 AND tablename <> '_prisma_migrations'",
    [schema],
  );
  if (rows.length === 0) return;
  const tables = rows.map((row) => `${quoteIdent(schema)}.${quoteIdent(row.tablename)}`);
  await client.query(`TRUNCATE ${tables.join(", ")} CASCADE`);
}

/** Remove a schema created by `createMigratedSchema`. */
export async function dropSchema(baseUrl: string, schema: string): Promise<void> {
  if (schema === "public") return;

  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(schema)} CASCADE`);
  } finally {
    await client.end();
  }
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
