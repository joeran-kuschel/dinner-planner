import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { allowPrivateAddresses, importPhoto, importRecipe } from "@/lib/recipe-import";
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
    const { values, photoUrl } = await importRecipe(`${site.base}/recipe`);
    expect(photoUrl).toBeNull();
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
    expect((await importRecipe(`${site.base}/moved`)).values.sourceUrl).toBe(`${site.base}/recipe`);
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

describe("importRecipe and the picture", () => {
  beforeEach(() => vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1"));

  it.each([
    ["a plain address", "/recipe-photo", "/photo.jpg"],
    ["an object with a url", "/recipe-photo-object", "/photo.png"],
    ["the first of a list, against the page", "/recipe-photo-list", "/photo.webp"],
  ])("names the picture given as %s", async (_label, page, picture) => {
    const { photoUrl } = await importRecipe(`${site.base}${page}`);
    expect(photoUrl).toBe(`${site.base}${picture}`);
  });

  it("names none for a page without one", async () => {
    expect((await importRecipe(`${site.base}/recipe`)).photoUrl).toBeNull();
  });
});

describe("importPhoto", () => {
  beforeEach(() => vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1"));

  it.each([
    ["/photo.jpg", "image/jpeg"],
    ["/photo.png", "image/png"],
    ["/photo.webp", "image/webp"],
    ["/photo-moved", "image/jpeg"],
  ])("returns %s as %s", async (path, type) => {
    const photo = await importPhoto(`${site.base}${path}`);
    expect(photo.type).toBe(type);
    expect(photo.bytes.length).toBeGreaterThan(100);
  });

  it.each([
    ["a page that only calls itself a picture", "/fake.jpg"],
    ["an SVG, which can hold a script", "/vector.svg"],
    ["a GIF, which a photo cannot be", "/photo.gif"],
  ])("refuses %s", async (_label, path) => {
    await expect(importPhoto(`${site.base}${path}`)).rejects.toMatchObject({ code: "not-image" });
  });

  it("refuses a web page, a missing picture and one over the size of a photo", async () => {
    await expect(importPhoto(`${site.base}/recipe`)).rejects.toMatchObject({ code: "not-image" });
    await expect(importPhoto(`${site.base}/nothing-here.jpg`)).rejects.toMatchObject({ code: "unreachable" });
    await expect(importPhoto(`${site.base}/too-big.jpg`)).rejects.toMatchObject({ code: "too-large" });
  });

  it("stops when the visitor cancels", async () => {
    const controller = new AbortController();
    const result = importPhoto(`${site.base}/slow`, { signal: controller.signal });
    setTimeout(() => controller.abort(), 100);
    await expect(result).rejects.toMatchObject({ code: "cancelled" });
  });

  it("applies the same address rules as the page", async () => {
    vi.unstubAllEnvs();
    await expect(importPhoto(`${site.base}/photo.jpg`)).rejects.toMatchObject({ code: "blocked" });
    await expect(importPhoto("http://169.254.169.254/x.jpg")).rejects.toMatchObject({ code: "blocked" });
    await expect(importPhoto("ftp://example.com/x.jpg")).rejects.toMatchObject({ code: "invalid-url" });
  });
});
