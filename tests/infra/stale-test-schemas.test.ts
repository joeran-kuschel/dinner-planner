import { randomBytes } from "node:crypto";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createMigratedSchema, dropStaleTestSchemas, dropSchema } from "@/tests/support/migrate";

// The base address, without the `?schema=` that setup-server.ts added for this file.
const baseUrl = (() => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.delete("schema");
  return url.toString();
})();

const hexName = () => `test_${randomBytes(6).toString("hex")}`;
const hoursAgo = (hours: number) => new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

let client: Client;
const created: string[] = [];

/** A bare schema with the given note, the way a cut-off run would have left it. */
async function leave(name: string, note: string | null) {
  await client.query(`CREATE SCHEMA "${name}"`);
  if (note) await client.query(`COMMENT ON SCHEMA "${name}" IS '${note}'`);
  created.push(name);
}

async function exists(name: string) {
  const { rowCount } = await client.query("SELECT 1 FROM pg_namespace WHERE nspname = $1", [name]);
  return rowCount === 1;
}

beforeEach(async () => {
  client = new Client({ connectionString: baseUrl });
  await client.connect();
});

afterEach(async () => {
  for (const name of created.splice(0)) await client.query(`DROP SCHEMA IF EXISTS "${name}" CASCADE`);
  await client.end();
});

describe("createMigratedSchema", () => {
  it("stamps the schema with its creation time", async () => {
    const name = hexName();
    created.push(name);
    await createMigratedSchema(baseUrl, name);
    const { rows } = await client.query<{ note: string }>(
      "SELECT obj_description(oid, 'pg_namespace') AS note FROM pg_namespace WHERE nspname = $1",
      [name],
    );
    expect(rows[0].note).toMatch(/^created \d{4}-\d{2}-\d{2}T/);
    await dropSchema(baseUrl, name);
  });
});

describe("dropStaleTestSchemas", () => {
  it("drops a test schema that is older than the limit", async () => {
    const name = hexName();
    await leave(name, `created ${hoursAgo(2)}`);
    expect(await dropStaleTestSchemas(baseUrl)).toContain(name);
    expect(await exists(name)).toBe(false);
  });

  it("keeps a younger schema, which another run may still be using", async () => {
    const name = hexName();
    await leave(name, `created ${hoursAgo(0.5)}`);
    expect(await dropStaleTestSchemas(baseUrl)).not.toContain(name);
    expect(await exists(name)).toBe(true);
  });

  it("keeps a schema without a stamp, or with one it cannot read", async () => {
    const bare = hexName();
    const odd = hexName();
    await leave(bare, null);
    await leave(odd, "created yesterday-ish");
    expect(await dropStaleTestSchemas(baseUrl)).not.toEqual(expect.arrayContaining([bare, odd]));
    expect(await exists(bare)).toBe(true);
    expect(await exists(odd)).toBe(true);
  });

  it("only ever touches names like the ones Vitest creates, however old the stamp", async () => {
    const other = "test_not_a_vitest_schema";
    await leave(other, `created ${hoursAgo(48)}`);
    expect(await dropStaleTestSchemas(baseUrl)).not.toContain(other);
    expect(await exists(other)).toBe(true);
    expect(await exists("public")).toBe(true);
  });

  it("keeps this file's own schema, which was created a moment ago", async () => {
    const own = new URL(process.env.DATABASE_URL!).searchParams.get("schema")!;
    expect(await dropStaleTestSchemas(baseUrl)).not.toContain(own);
    expect(await exists(own)).toBe(true);
  });
});
