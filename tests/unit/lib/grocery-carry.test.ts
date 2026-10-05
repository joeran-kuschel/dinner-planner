import { describe, expect, it } from "vitest";
import { carriedEntries, type CarryRow } from "@/lib/grocery-carry";
import { parseDayKey } from "@/lib/week";

const week = (key: string) => parseDayKey(key)!;
const W1 = week("2026-09-07");
const W2 = week("2026-09-14");
const W3 = week("2026-09-21");
const W4 = week("2026-09-28");

function row(weekStart: Date, fields: Partial<CarryRow> = {}): CarryRow {
  return {
    weekStart,
    key: "wine|",
    label: "Wine",
    quantity: null,
    unit: null,
    category: "OTHER",
    manual: true,
    checked: false,
    dismissed: false,
    ...fields,
  };
}

const keys = (rows: CarryRow[], weekStart: Date) => carriedEntries(rows, weekStart).map((entry) => entry.key);

describe("carriedEntries", () => {
  it("carries an unticked hand-added entry into the next week, one week old", () => {
    expect(carriedEntries([row(W1)], W2)).toEqual([
      { key: "wine|", label: "Wine", quantity: null, unit: null, category: "OTHER", weeksAgo: 1 },
    ]);
  });

  it("keeps carrying it every week until it is ticked, counting its age from the week it was added", () => {
    expect(carriedEntries([row(W1)], W4)[0].weeksAgo).toBe(3);
  });

  it("loses nothing when weeks were skipped (no rows at all in between)", () => {
    expect(keys([row(W1)], week("2027-03-01"))).toEqual(["wine|"]);
  });

  it("does not carry into the week it was added in, or into an earlier one", () => {
    expect(keys([row(W2)], W2)).toEqual([]);
    expect(keys([row(W2)], W1)).toEqual([]);
  });

  it("stops after a week in which it was ticked, and the tick week itself shows it ticked", () => {
    const rows = [row(W1), row(W2, { checked: true })];

    expect(keys(rows, W2)).toEqual(["wine|"]);
    expect(keys(rows, W3)).toEqual([]);
    expect(keys(rows, W4)).toEqual([]);
  });

  it("carries on again when it is unticked", () => {
    expect(keys([row(W1), row(W2, { checked: false })], W4)).toEqual(["wine|"]);
  });

  it("stops after a week in which it was deleted (dismissed), and earlier weeks still carry it", () => {
    const rows = [row(W1), row(W3, { dismissed: true })];

    expect(keys(rows, W3)).toEqual(["wine|"]);
    expect(keys(rows, W4)).toEqual([]);
  });

  it("starts again when the item is added anew after it ended", () => {
    const rows = [row(W1, { checked: true }), row(W3)];

    expect(keys(rows, W2)).toEqual([]);
    expect(carriedEntries(rows, W4)).toMatchObject([{ key: "wine|", weeksAgo: 1 }]);
  });

  it("is one line per item however many weeks added it", () => {
    expect(carriedEntries([row(W1), row(W2)], W4)).toHaveLength(1);
    expect(carriedEntries([row(W1), row(W2)], W4)[0].weeksAgo).toBe(3);
  });

  it("takes the amount, unit and section from the latest unticked row", () => {
    const rows = [row(W1, { quantity: 1, unit: "bottle", category: "DRINKS" }), row(W2, { quantity: 3, unit: "bottle", category: "OTHER" })];

    expect(carriedEntries(rows, W3)[0]).toMatchObject({ quantity: 3, unit: "bottle", category: "OTHER" });
  });

  it("keeps items apart by their key", () => {
    const rows = [row(W1), row(W1, { key: "soap|", label: "Soap" }), row(W2, { key: "soap|", label: "Soap", checked: true })];

    expect(keys(rows, W4)).toEqual(["wine|"]);
  });

  it("ends when the same item is ticked in a week as a line from the plan (it was bought)", () => {
    const rows = [row(W1), row(W2, { manual: false, checked: true })];

    expect(keys(rows, W3)).toEqual([]);
  });

  it("ignores an unticked row that is not hand-added", () => {
    expect(keys([row(W1, { manual: false })], W2)).toEqual([]);
  });

  it("does not depend on the order of the rows", () => {
    expect(keys([row(W2, { checked: true }), row(W1)], W4)).toEqual([]);
  });
});
