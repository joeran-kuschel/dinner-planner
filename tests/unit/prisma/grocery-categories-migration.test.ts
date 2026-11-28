import { Client } from "pg";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { SEEDED_CATEGORIES } from "@/lib/grocery-category";
import { dropSchema, migrations } from "@/tests/support/migrate";

// The migration that turns the `GroceryCategory` enum into a table runs on the user's real data in the
// cluster, with no way back. This applies every migration before it, fills the old enum columns with every
// value, runs it and looks at what is left.

const BEFORE = "20261026115507_recipe_favorite";
const MIGRATION = "20261128190000_grocery_categories_table";
const OLD_VALUES = ["PRODUCE", "BAKERY", "MEAT_FISH", "DAIRY_EGGS", "PASTA_RICE", "PANTRY", "HERBS_SPICES", "FROZEN", "DRINKS", "OTHER"];

const url = new URL(process.env.DATABASE_URL!);
const SCHEMA = `${url.searchParams.get("schema")}_catmig`;
url.search = "";

let client: Client;

const apply = async (names: (name: string) => boolean) => {
  for (const { name, sql } of migrations().filter(({ name }) => names(name))) await client.query(sql);
};

beforeEach(async () => {
  client = new Client({ connectionString: url.toString() });
  await client.connect();
  await client.query(`DROP SCHEMA IF EXISTS "${SCHEMA}" CASCADE`);
  await client.query(`CREATE SCHEMA "${SCHEMA}"`);
  await client.query(`SET search_path TO "${SCHEMA}"`);
});

afterEach(async () => {
  await client.end();
  await dropSchema(url.toString(), SCHEMA);
});

/** One recipe with an ingredient, and one grocery entry, for every value of the old enum. */
async function fillOldSchema() {
  await client.query(`INSERT INTO "Recipe" (id, name, "updatedAt") VALUES ('r1', 'Everything', now())`);
  for (const [index, value] of OLD_VALUES.entries()) {
    await client.query(`INSERT INTO "Ingredient" (id, "recipeId", name, category, position) VALUES ($1, 'r1', $2, $3::"GroceryCategory", $4)`, [
      `i-${value}`,
      `Ingredient ${value}`,
      value,
      index,
    ]);
    await client.query(
      `INSERT INTO "GroceryEntry" (id, "weekStart", key, label, category, manual, checked) VALUES ($1, '2026-09-28', $2, $3, $4::"GroceryCategory", $5, $6)`,
      [`e-${value}`, `${value.toLowerCase()}|`, `Entry ${value}`, value, index % 2 === 0, index % 3 === 0],
    );
  }
}

describe("the grocery_categories_table migration", () => {
  it("keeps the category of every ingredient and grocery entry, and their tick state", async () => {
    await apply((name) => name <= BEFORE);
    await fillOldSchema();

    await apply((name) => name === MIGRATION);

    const ingredients = await client.query(`SELECT id, "categoryId" FROM "Ingredient" ORDER BY position`);
    expect(ingredients.rows).toEqual(OLD_VALUES.map((value) => ({ id: `i-${value}`, categoryId: `cat_${value.toLowerCase()}` })));
    const entries = await client.query(`SELECT id, "categoryId", manual, checked, label FROM "GroceryEntry" ORDER BY label`);
    expect(entries.rows).toHaveLength(OLD_VALUES.length);
    for (const row of entries.rows) {
      const index = OLD_VALUES.indexOf(row.id.slice(2));
      expect(row).toEqual({
        id: `e-${OLD_VALUES[index]}`,
        categoryId: `cat_${OLD_VALUES[index].toLowerCase()}`,
        manual: index % 2 === 0,
        checked: index % 3 === 0,
        label: `Entry ${OLD_VALUES[index]}`,
      });
    }
  });

  it("creates exactly the rows the app's SEEDED_CATEGORIES describe", async () => {
    await apply((name) => name <= MIGRATION);

    const { rows } = await client.query(`SELECT id, key, name, position FROM "GroceryCategory" ORDER BY position`);
    expect(rows).toEqual(SEEDED_CATEGORIES.map((category) => ({ ...category })));
  });

  it("drops the old enum and the old columns", async () => {
    await apply((name) => name <= BEFORE);
    await apply((name) => name === MIGRATION);

    const types = await client.query(
      `SELECT t.typname, t.typtype FROM pg_type t JOIN pg_namespace n ON n.oid = t.typnamespace WHERE n.nspname = $1 AND t.typname LIKE 'GroceryCategory%' AND t.typtype = 'e'`,
      [SCHEMA],
    );
    expect(types.rows).toEqual([]);
    const columns = await client.query(
      `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = $1 AND column_name IN ('category', 'categoryId') ORDER BY table_name, column_name`,
      [SCHEMA],
    );
    expect(columns.rows).toEqual([
      { table_name: "GroceryEntry", column_name: "categoryId" },
      { table_name: "Ingredient", column_name: "categoryId" },
    ]);
  });

  it("migrates an empty database too", async () => {
    await apply((name) => name <= MIGRATION);

    const { rows } = await client.query(`SELECT count(*)::int AS n FROM "GroceryCategory"`);
    expect(rows[0].n).toBe(10);
  });

  it("makes the category required and refuses one that does not exist, and deleting one in use", async () => {
    await apply((name) => name <= BEFORE);
    await fillOldSchema();
    await apply((name) => name === MIGRATION);

    await expect(client.query(`INSERT INTO "Ingredient" (id, "recipeId", name, "categoryId") VALUES ('x', 'r1', 'X', 'cat_nope')`)).rejects.toThrow(/foreign key/);
    await expect(client.query(`INSERT INTO "Ingredient" (id, "recipeId", name, "categoryId") VALUES ('x', 'r1', 'X', NULL)`)).rejects.toThrow(/null value/);
    await expect(client.query(`DELETE FROM "GroceryCategory" WHERE id = 'cat_produce'`)).rejects.toThrow(/foreign key/);
  });
});
