import fs from "node:fs";
import path from "node:path";
import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { createMigratedSchema, dropSchema, emptySchema } from "@/tests/support/migrate";

/** The connection of this test file's own schema, which is also where `prisma` writes. */
const url = new URL(process.env.DATABASE_URL!);
const SCHEMA = url.searchParams.get("schema")!;
url.search = "";
const BASE_URL = url.toString();

let client: Client;
beforeEach(async () => {
  client = new Client({ connectionString: BASE_URL });
  await client.connect();
});
afterEach(async () => {
  await client.end();
});

const count = async (schema: string, table: string) =>
  Number((await client.query(`SELECT count(*) FROM "${schema}"."${table}"`)).rows[0].count);

/** Something in every table: a recipe with ingredients, a photo and tags, a planned day, a grocery row. */
async function fillEveryTable() {
  const recipe = await prisma.recipe.create({
    data: {
      name: "Soup",
      ingredients: { create: [{ name: "Leek" }] },
      tags: { create: [{ name: "quick" }] },
      photo: {
        create: { full: new Uint8Array([1]), fullWidth: 1, fullHeight: 1, thumb: new Uint8Array([1]), alt: "A soup" },
      },
    },
  });
  await prisma.plannedMeal.create({ data: { date: new Date("2027-01-04T00:00:00Z"), recipeId: recipe.id } });
  await prisma.groceryEntry.create({ data: { weekStart: new Date("2027-01-04T00:00:00Z"), key: "leek|", label: "Leek" } });
}

describe("emptySchema", () => {
  it("deletes the rows of every table, join tables and photos included", async () => {
    await fillEveryTable();
    expect(await count(SCHEMA, "_RecipeToTag")).toBe(1);

    await emptySchema(client, SCHEMA);

    for (const table of ["Recipe", "Ingredient", "RecipePhoto", "Tag", "_RecipeToTag", "PlannedMeal", "GroceryEntry"]) {
      expect(await count(SCHEMA, table), table).toBe(0);
    }
  });

  it("also empties a table it has never heard of, so a new model needs no change here", async () => {
    await client.query(`CREATE TABLE "${SCHEMA}"."NewModel" (id int)`);
    await client.query(`INSERT INTO "${SCHEMA}"."NewModel" VALUES (1)`);

    await emptySchema(client, SCHEMA);

    expect(await count(SCHEMA, "NewModel")).toBe(0);
  });

  it("keeps the tables, so the next test can write again", async () => {
    await fillEveryTable();
    await emptySchema(client, SCHEMA);
    await expect(prisma.recipe.create({ data: { name: "Again" } })).resolves.toMatchObject({ name: "Again" });
  });

  it("is a no-op on an empty database", async () => {
    await emptySchema(client, SCHEMA);
    await expect(emptySchema(client, SCHEMA)).resolves.toBeUndefined();
  });

  it("leaves the tables of any other schema alone", async () => {
    const other = `${SCHEMA}_other`;
    await createMigratedSchema(BASE_URL, other);
    try {
      await client.query(`INSERT INTO "${other}"."Recipe" (id, name, "updatedAt") VALUES ('x', 'Kept', now())`);
      await fillEveryTable();

      await emptySchema(client, SCHEMA);

      expect(await count(other, "Recipe")).toBe(1);
      expect(await count(SCHEMA, "Recipe")).toBe(0);
    } finally {
      await dropSchema(BASE_URL, other);
    }
  });

  it("never touches the development data in `public`", async () => {
    await expect(emptySchema(client, "public")).rejects.toThrow(/public/);
  });

  it("quotes a schema name instead of reading it as SQL", async () => {
    const odd = 'x"; DROP TABLE "Recipe"; --';
    await client.query(`CREATE SCHEMA "${odd.replace(/"/g, '""')}"`);
    await client.query(`CREATE TABLE "${odd.replace(/"/g, '""')}"."Thing" (id int)`);
    await client.query(`INSERT INTO "${odd.replace(/"/g, '""')}"."Thing" VALUES (1)`);
    try {
      await prisma.recipe.create({ data: { name: "Must survive" } });

      await emptySchema(client, odd);

      const { rows } = await client.query(`SELECT count(*) FROM "${odd.replace(/"/g, '""')}"."Thing"`);
      expect(Number(rows[0].count)).toBe(0);
      await expect(prisma.recipe.count()).resolves.toBe(1);
    } finally {
      await client.query(`DROP SCHEMA "${odd.replace(/"/g, '""')}" CASCADE`);
    }
  });
});

describe("the end-to-end specs", () => {
  const dir = path.join(process.cwd(), "tests", "e2e");
  const specs = fs.readdirSync(dir).filter((file) => file.endsWith(".spec.ts"));

  /** The names a spec imports from Playwright itself (`import { … } from "@playwright/test"`), either quote. */
  const playwrightImports = (source: string) =>
    [...source.matchAll(/import\s*(type\s*)?\{([^}]*)\}\s*from\s*["']@playwright\/test["']/g)].flatMap((match) =>
      match[2]
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean)
        .map((name) => (match[1] ? `type ${name}` : name)),
    );

  it.each(specs)("%s takes `test` from the support module that empties the database", (spec) => {
    const source = fs.readFileSync(path.join(dir, spec), "utf8");
    // A spec getting `test` (or `expect`'s test-bound twin, `defineConfig`-style helpers, or `require`)
    // from Playwright itself would run on whatever the previous test left. Types are fine.
    expect(playwrightImports(source).filter((name) => !name.startsWith("type "))).toEqual([]);
    expect(source).not.toMatch(/require\(\s*["']@playwright\/test["']\s*\)/);
    expect(source).toMatch(/import\s*\{[^}]*\btest\b[^}]*\}\s*from\s*["']@\/tests\/e2e\/support\/test["']/);
  });

  it("recognises what it guards against", () => {
    expect(playwrightImports(`import { test, expect } from "@playwright/test";`)).toEqual(["test", "expect"]);
    expect(playwrightImports(`import { test as t } from '@playwright/test';`)).toEqual(["test as t"]);
    expect(playwrightImports(`import { type Page, test } from "@playwright/test";`)).toEqual(["type Page", "test"]);
    expect(playwrightImports(`import type { Page } from "@playwright/test";`)).toEqual(["type Page"]);
  });

  it("has specs to check", () => {
    expect(specs.length).toBeGreaterThan(5);
  });
});
