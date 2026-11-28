import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { SEEDED_ROWS } from "./seeded-categories";

// Resolved from the working directory: vitest and playwright both run from the
// project root, and `__dirname` is not available once this module is pulled
// into an ESM graph.
const MIGRATIONS_DIR = path.join(process.cwd(), "prisma", "migrations");

/** The migrations in `prisma/migrations` as `{ name, sql }`, in order. Tests of one migration apply them in two steps. */
export function migrations(): { name: string; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
    .map((name) => ({ name, sql: fs.readFileSync(path.join(MIGRATIONS_DIR, name, "migration.sql"), "utf-8") }));
}

/** The migration SQL in `prisma/migrations`, in order. */
const migrationSql = () => migrations().map(({ sql }) => sql);

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
    // The creation time travels with the schema, so `dropStaleTestSchemas` can tell a leftover from
    // a run that is still going.
    await client.query(`COMMENT ON SCHEMA ${quoted} IS ${quoteLiteral(`created ${new Date().toISOString()}`)}`);
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
 * Delete every row of every table in `schema`, keeping the tables, then put the shop sections back as the migration made
 * them (`restoreSeededCategories`). Prisma's own bookkeeping table is left alone, and `GroceryCategory` is not emptied:
 * its ten rows are made by a migration (the app relies on them, "Other" above all) and every ingredient and grocery entry
 * needs one, so emptying it would break the next insert; a test may have added, renamed, moved or deleted sections, which
 * is why they are restored instead. Every table is named with its schema, never through the search path, so this can only
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

  const all = await client.query<{ tablename: string }>("SELECT tablename FROM pg_tables WHERE schemaname = $1", [schema]);
  const rows = all.rows.filter((row) => row.tablename !== "_prisma_migrations" && row.tablename !== "GroceryCategory");
  if (rows.length > 0) {
    // TRUNCATE ... CASCADE on the other tables does not reach GroceryCategory: the foreign keys point at it.
    const tables = rows.map((row) => `${quoteIdent(schema)}.${quoteIdent(row.tablename)}`);
    await client.query(`TRUNCATE ${tables.join(", ")} CASCADE`);
  }
  // A schema that is no copy of the app's (a test's own scratch schema) has no sections to restore.
  if (all.rows.some((row) => row.tablename === "GroceryCategory")) await restoreSeededCategories(client, schema);
}

/**
 * Make the `GroceryCategory` table of `schema` the ten rows the migration creates: sections a test added are deleted, the
 * seeded ones get their key, name (none) and position back. Nothing may be filed under a section that is deleted (the
 * foreign keys restrict it), so run this after the ingredients and grocery entries are gone.
 */
export async function restoreSeededCategories(client: Client, schema: string): Promise<void> {
  if (schema === "public") {
    throw new Error("Refusing to restore the sections of the `public` schema — that is the development data.");
  }
  const table = `${quoteIdent(schema)}."GroceryCategory"`;
  const columns = [
    SEEDED_ROWS.map((category) => category.id),
    SEEDED_ROWS.map((category) => category.key),
    SEEDED_ROWS.map((category) => category.name),
    SEEDED_ROWS.map((category) => category.position),
  ];
  await client.query(`DELETE FROM ${table} WHERE id <> ALL($1::text[])`, [columns[0]]);
  await client.query(
    `INSERT INTO ${table} (id, key, name, position)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::int[])
     ON CONFLICT (id) DO UPDATE SET key = EXCLUDED.key, name = EXCLUDED.name, position = EXCLUDED.position`,
    columns,
  );
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

/** The schemas Vitest creates, one per test file: `test_` and 12 hex digits (see `setup-server.ts`). */
const TEST_SCHEMA = /^test_[0-9a-f]{12}$/;

/** A schema older than this was left by a run that was cut off; a run takes minutes. */
const STALE_SCHEMA_AGE_MS = 60 * 60 * 1000;

/**
 * Drop the test schemas that a cut-off run left behind: named like the ones Vitest creates, stamped
 * by `createMigratedSchema` and older than `maxAgeMs`. A schema without a stamp, one that is younger
 * (another run may be using it) and every other name, `public` and `e2e` included, stays. Returns
 * the names it dropped.
 */
export async function dropStaleTestSchemas(baseUrl: string, maxAgeMs = STALE_SCHEMA_AGE_MS): Promise<string[]> {
  const client = new Client({ connectionString: baseUrl });
  await client.connect();
  try {
    const { rows } = await client.query<{ name: string; note: string | null }>(
      "SELECT nspname AS name, obj_description(oid, 'pg_namespace') AS note FROM pg_namespace WHERE nspname LIKE 'test\\_%'",
    );
    const dropped: string[] = [];
    for (const { name, note } of rows) {
      const created = Date.parse(note?.match(/^created (.+)$/)?.[1] ?? "");
      if (!TEST_SCHEMA.test(name) || Number.isNaN(created) || Date.now() - created < maxAgeMs) continue;
      await client.query(`DROP SCHEMA IF EXISTS ${quoteIdent(name)} CASCADE`);
      dropped.push(name);
    }
    return dropped;
  } finally {
    await client.end();
  }
}

function quoteLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

function quoteIdent(name: string): string {
  return `"${name.replace(/"/g, '""')}"`;
}
