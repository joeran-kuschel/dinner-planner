import { Client } from "pg";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";

describe("server test setup", () => {
  it("runs in a time zone other than UTC", () => {
    expect(new Date("2026-07-01T00:00:00Z").getTimezoneOffset()).not.toBe(0);
  });

  it("uses a migrated throwaway schema, not the app's data", async () => {
    expect(new URL(process.env.DATABASE_URL!).searchParams.get("schema")).not.toBe("public");
    await expect(prisma.recipe.count()).resolves.toBe(0);
  });

  // The pg driver ignores `?schema=`; lib/prisma-adapter.ts has to pass it on.
  // Without that, tests would silently write into the development data.
  it("writes into the test file's own schema", async () => {
    const url = new URL(process.env.DATABASE_URL!);
    const schema = url.searchParams.get("schema")!;
    url.search = "";
    await prisma.recipe.create({ data: { name: "Schema check" } });

    const client = new Client({ connectionString: url.toString() });
    await client.connect();
    try {
      const { rows } = await client.query(`SELECT name FROM "${schema}"."Recipe"`);
      expect(rows).toEqual([{ name: "Schema check" }]);
    } finally {
      await client.end();
    }
  });

  it("starts every test with empty tables", async () => {
    await prisma.recipe.create({ data: { name: "Leftover from another test" } });
    await expect(prisma.recipe.count()).resolves.toBe(1);
  });

  it("really is empty again", async () => {
    await expect(prisma.recipe.count()).resolves.toBe(0);
  });
});
