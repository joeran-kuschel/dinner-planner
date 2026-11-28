import { describe, expect, it } from "vitest";
import {
  OTHER_CATEGORY_ID,
  SEEDED_CATEGORIES,
  type CategoryRow,
  categoryName,
  otherCategoryId,
  parseCategoryId,
  seedCategoryId,
  seededCategory,
} from "@/lib/grocery-category";
import { testI18n } from "@/tests/support/i18n";

const KEYS = SEEDED_CATEGORIES.map((category) => category.key);

describe("SEEDED_CATEGORIES", () => {
  it("walks through the shop and ends with Other", () => {
    expect(KEYS).toEqual([
      "PRODUCE",
      "BAKERY",
      "MEAT_FISH",
      "DAIRY_EGGS",
      "PASTA_RICE",
      "PANTRY",
      "HERBS_SPICES",
      "FROZEN",
      "DRINKS",
      "OTHER",
    ]);
  });

  it("numbers the positions from 0 without a gap", () => {
    expect(SEEDED_CATEGORIES.map((category) => category.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("has fixed ids made of the key and no name, so the names stay translated", () => {
    expect(SEEDED_CATEGORIES.map((category) => category.id)).toEqual(KEYS.map((key) => `cat_${key!.toLowerCase()}`));
    expect(SEEDED_CATEGORIES.every((category) => category.name === null)).toBe(true);
  });

  it("finds a row by its key, and Other has the fallback's id", () => {
    expect(seededCategory("DAIRY_EGGS")).toMatchObject({ id: "cat_dairy_eggs", position: 3 });
    expect(seededCategory("OTHER").id).toBe(OTHER_CATEGORY_ID);
    expect(OTHER_CATEGORY_ID).toBe(seedCategoryId("OTHER"));
  });
});

describe("categoryName", () => {
  it.each(KEYS)("names the seeded %s in both languages", (key) => {
    const row = SEEDED_CATEGORIES.find((category) => category.key === key)!;
    const en = categoryName(row, testI18n("en"));
    const de = categoryName(row, testI18n("de"));
    expect(en).not.toBe(key);
    expect(de).toBeTruthy();
    if (key !== "OTHER") expect(de).not.toBe(en);
  });

  it("names the added sections in English and German", () => {
    const en = testI18n("en");
    const de = testI18n("de");
    expect(categoryName(seededCategory("PASTA_RICE"), en)).toBe("Pasta, rice, etc.");
    expect(categoryName(seededCategory("PASTA_RICE"), de)).toBe("Nudeln, Reis usw.");
    expect(categoryName(seededCategory("HERBS_SPICES"), en)).toBe("Herbs & spices");
    expect(categoryName(seededCategory("HERBS_SPICES"), de)).toBe("Kräuter & Gewürze");
  });

  it("shows the user's name in every language, also for a seeded key", () => {
    const named: CategoryRow = { id: "cat_bakery", key: "BAKERY", name: "Baker Ben", position: 1 };
    expect(categoryName(named, testI18n("en"))).toBe("Baker Ben");
    expect(categoryName(named, testI18n("de"))).toBe("Baker Ben");
  });

  it("shows the name of a category the user added, which has no key", () => {
    expect(categoryName({ key: null, name: "Market" }, testI18n("de"))).toBe("Market");
  });

  it("falls back to the key text of an unknown key, and to nothing for a row with neither", () => {
    expect(categoryName({ key: "SWEETS", name: null }, testI18n("en"))).toBe("SWEETS");
    expect(categoryName({ key: null, name: null }, testI18n("en"))).toBe("");
    expect(categoryName({ key: null, name: "" }, testI18n("en"))).toBe("");
  });
});

describe("parseCategoryId", () => {
  const user: CategoryRow = { id: "cuid_market", key: null, name: "Market", position: 3 };
  const rows = [seededCategory("PRODUCE"), seededCategory("BAKERY"), user, seededCategory("OTHER")];

  it.each(rows)("accepts the id of $id", (row) => {
    expect(parseCategoryId(row.id, rows)).toBe(row.id);
  });

  it.each([null, undefined, "", "cat_unknown", "PRODUCE", "cat_PRODUCE", " cat_produce", "cat_produce ", "cat_produce'; --", new File([], "x")])(
    "falls back to Other for %j",
    (value) => {
      expect(parseCategoryId(value, rows)).toBe("cat_other");
    },
  );

  it("falls back to the row that has the key OTHER, whatever its id", () => {
    const odd = [seededCategory("PRODUCE"), { id: "x1", key: "OTHER", name: null, position: 1 }];
    expect(parseCategoryId("nope", odd)).toBe("x1");
  });
});

describe("otherCategoryId", () => {
  it("finds Other by its key, wherever it is in the list", () => {
    expect(otherCategoryId([seededCategory("OTHER"), seededCategory("PRODUCE")])).toBe("cat_other");
    expect(otherCategoryId([{ id: "x1", key: "OTHER", name: null, position: 5 }, seededCategory("PRODUCE")])).toBe("x1");
  });

  it("takes the last row when there is no OTHER row", () => {
    const rows: CategoryRow[] = [
      { id: "a", key: null, name: "A", position: 0 },
      { id: "b", key: null, name: "B", position: 1 },
    ];
    expect(otherCategoryId(rows)).toBe("b");
  });

  it("uses the fixed id when the list is empty", () => {
    expect(otherCategoryId([])).toBe(OTHER_CATEGORY_ID);
    expect(parseCategoryId("anything", [])).toBe(OTHER_CATEGORY_ID);
  });
});
