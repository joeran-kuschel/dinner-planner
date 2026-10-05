import { describe, expect, it } from "vitest";
import { isDinner, isPlanned, LEFTOVERS_DAYS, leftoverCountFor, leftoverSourcesFor } from "@/lib/leftovers";
import { addDays, dayKey } from "@/lib/week";

const DAY = new Date("2026-09-28T00:00:00Z");
const row = (fields: Partial<{ recipeId: string; customTitle: string; leftoversOf: Date }>) => ({
  recipeId: null,
  customTitle: null,
  leftoversOf: null,
  ...fields,
});

describe("isDinner", () => {
  it("is true for a recipe and for a typed name", () => {
    expect(isDinner(row({ recipeId: "r1" }))).toBe(true);
    expect(isDinner(row({ customTitle: "Pizza" }))).toBe(true);
  });

  it("is false for nothing, an empty row and leftovers", () => {
    expect(isDinner(null)).toBe(false);
    expect(isDinner(undefined)).toBe(false);
    expect(isDinner(row({}))).toBe(false);
    expect(isDinner(row({ leftoversOf: DAY }))).toBe(false);
  });
});

describe("isPlanned", () => {
  it("is true for a dinner and for leftovers", () => {
    expect(isPlanned(row({ recipeId: "r1" }))).toBe(true);
    expect(isPlanned(row({ customTitle: "Pizza" }))).toBe(true);
    expect(isPlanned(row({ leftoversOf: DAY }))).toBe(true);
  });

  it("is false for nothing and for an empty row", () => {
    expect(isPlanned(null)).toBe(false);
    expect(isPlanned(row({}))).toBe(false);
  });
});

it("lets a day eat the rest of a dinner up to six days back", () => {
  expect(LEFTOVERS_DAYS).toBe(6);
});

describe("leftoverSourcesFor", () => {
  const WEDNESDAY = new Date("2026-09-30T00:00:00Z");
  const meals = (rows: Record<string, ReturnType<typeof row>>) => new Map(Object.entries(rows));
  const names = new Map([["r1", "Risotto"]]);

  it("lists the dinners of the six days before, the nearest first, named by recipe or title", () => {
    const rows = meals({
      "2026-09-29": row({ recipeId: "r1" }),
      "2026-09-28": row({ customTitle: "Pizza" }),
      "2026-09-24": row({ customTitle: "Soup" }),
    });

    expect(leftoverSourcesFor(WEDNESDAY, rows, names, "en")).toEqual([
      { key: "2026-09-29", weekday: "Tuesday", dateLabel: "29 Sept", title: "Risotto" },
      { key: "2026-09-28", weekday: "Monday", dateLabel: "28 Sept", title: "Pizza" },
      { key: "2026-09-24", weekday: "Thursday", dateLabel: "24 Sept", title: "Soup" },
    ]);
  });

  it("leaves out empty days, leftovers, the day itself, later days and days beyond six back", () => {
    const rows = meals({
      "2026-09-29": row({ leftoversOf: new Date("2026-09-28T00:00:00Z") }),
      "2026-09-27": row({}),
      "2026-09-30": row({ customTitle: "Today" }),
      "2026-10-01": row({ customTitle: "Later" }),
      "2026-09-23": row({ customTitle: "Too early" }),
    });

    expect(leftoverSourcesFor(WEDNESDAY, rows, names, "en")).toEqual([]);
  });

  it("is in German for a German page", () => {
    const rows = meals({ "2026-09-29": row({ customTitle: "Pizza" }) });
    expect(leftoverSourcesFor(WEDNESDAY, rows, names, "de")[0]).toMatchObject({ weekday: "Dienstag" });
  });

  it("reaches exactly LEFTOVERS_DAYS back", () => {
    const rows = meals({ [dayKey(addDays(WEDNESDAY, -LEFTOVERS_DAYS))]: row({ customTitle: "Edge" }) });
    expect(leftoverSourcesFor(WEDNESDAY, rows, names, "en")).toHaveLength(1);
  });
});

describe("leftoverCountFor", () => {
  it("counts the days that eat the rest of the dinner on that day", () => {
    const monday = new Date("2026-09-28T00:00:00Z");
    const other = new Date("2026-09-29T00:00:00Z");
    expect(leftoverCountFor(monday, [row({ leftoversOf: monday }), row({ leftoversOf: monday }), row({ leftoversOf: other }), row({})])).toBe(2);
    expect(leftoverCountFor(other, [])).toBe(0);
  });
});
