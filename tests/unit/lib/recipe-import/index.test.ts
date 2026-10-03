import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { allowPrivateAddresses, importRecipe } from "@/lib/recipe-import";
import { ImportError } from "@/lib/recipe-import/errors";
import { startRecipeSite } from "@/tests/support/recipe-site";

let site: Awaited<ReturnType<typeof startRecipeSite>>;
beforeAll(async () => {
  site = await startRecipeSite();
});
afterAll(() => site.close());
afterEach(() => vi.unstubAllEnvs());

describe("allowPrivateAddresses", () => {
  it("is off unless the test setting is exactly 1", () => {
    expect(allowPrivateAddresses()).toBe(false);
    for (const value of ["", "0", "true", "yes"]) {
      vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", value);
      expect(allowPrivateAddresses()).toBe(false);
    }
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    expect(allowPrivateAddresses()).toBe(true);
  });
});

describe("importRecipe", () => {
  it("never reaches this machine in the normal setup", async () => {
    await expect(importRecipe(`${site.base}/recipe`)).rejects.toMatchObject({ code: "blocked" });
  });

  it("reads the recipe of a page into the form's values", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    const values = await importRecipe(`${site.base}/recipe`);
    expect(values).toMatchObject({
      name: "Lemon pancakes",
      servings: "4",
      prepMinutes: "20",
      sourceUrl: `${site.base}/recipe`,
      tags: ["breakfast", "quick"],
      instructions: "Whisk everything.\nFry in a hot pan.",
    });
    expect(values.ingredients.map(({ quantity, unit, name }) => [quantity, unit, name])).toEqual([
      ["200", "g", "flour"],
      ["2", "", "eggs"],
      ["300", "ml", "milk"],
      ["1", "pinch", "salt"],
    ]);
  });

  it("names the page it ended up on after a redirect as the source", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    expect((await importRecipe(`${site.base}/moved`)).sourceUrl).toBe(`${site.base}/recipe`);
  });

  it("says when a page has no recipe", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    await expect(importRecipe(`${site.base}/plain`)).rejects.toMatchObject({ code: "no-recipe" });
  });

  it("passes the visitor's cancel on", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    const controller = new AbortController();
    const result = importRecipe(`${site.base}/slow`, { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(result).rejects.toBeInstanceOf(ImportError);
    await expect(result).rejects.toMatchObject({ code: "cancelled" });
  });
});
