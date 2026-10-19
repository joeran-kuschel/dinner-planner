import { describe, expect, it } from "vitest";
import { createCanonicaliser } from "@/lib/ingredients/canonical";
import { canonicalRows, withCanonicalKeys } from "@/lib/ingredients/rows";

const canon = createCanonicaliser({ locale: "en" });
const row = (
  key: string,
  extra: Partial<{ checked: boolean; manual: boolean; dismissed: boolean; id: string; label: string; quantity: number | null }> = {},
) => ({
  key,
  checked: false,
  manual: false,
  dismissed: false,
  id: key,
  ...extra,
});

describe("canonicalRows", () => {
  it("moves a row stored under an old key to the canonical one", () => {
    expect(canonicalRows([row("tomatoes|g", { checked: true })], canon)).toEqual([
      { key: "~tomato|g", checked: true, manual: false, dismissed: false, id: "tomatoes|g" },
    ]);
  });

  it("leaves rows of different lines apart", () => {
    expect(canonicalRows([row("tomatoes|g"), row("tomatoes|")], canon).map((r) => r.key)).toEqual(["~tomato|g", "~tomato|"]);
  });

  it("lets the row stored with exactly the canonical key win, ticked or not", () => {
    const rows = canonicalRows([row("tomatoes|g", { checked: true }), row("~tomato|g", { checked: false })], canon);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "~tomato|g", checked: false });
  });

  it("without an exact row prefers a hand-added row", () => {
    const rows = canonicalRows([row("tomatoes|g"), row("Tomaten|g", { manual: true, id: "by-hand" })], canon);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "by-hand", manual: true, key: "~tomato|g" });
  });

  it("without an exact or a manual row takes the first", () => {
    const rows = canonicalRows([row("tomatoes|g", { id: "first" }), row("Tomaten|g", { id: "second" })], canon);
    expect(rows.map((r) => r.id)).toEqual(["first"]);
  });

  it("counts a merged line as ticked only when every part was", () => {
    expect(canonicalRows([row("tomatoes|g", { checked: true }), row("Tomaten|g", { checked: true })], canon)[0].checked).toBe(true);
    expect(canonicalRows([row("tomatoes|g", { checked: true }), row("Tomaten|g", { checked: false })], canon)[0].checked).toBe(false);
  });

  it("keeps a hand-added extra stored under an old key listed when a tick row is written under the canonical key", () => {
    const rows = canonicalRows(
      [
        row("milch|l", { manual: true, id: "extra", label: "Milch", quantity: 2 }),
        row("~milk|ml", { manual: false, checked: true, id: "tick" }),
      ],
      canon,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "~milk|ml", manual: true, id: "extra", label: "Milch", quantity: 2, checked: true, dismissed: false });
  });

  it("makes two live hand-added legacy rows one line with the first row's amount", () => {
    const rows = canonicalRows(
      [row("Tomaten|g", { manual: true, id: "first", quantity: 100 }), row("tomatoes|g", { manual: true, id: "second", quantity: 300 })],
      canon,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "first", quantity: 100 });
  });

  it("takes the details of a live row over a dismissed hand-added legacy row", () => {
    const rows = canonicalRows(
      [
        row("Tomaten|g", { manual: true, dismissed: true, id: "gone", quantity: 1 }),
        row("tomatoes|g", { manual: true, id: "live", quantity: 2 }),
      ],
      canon,
    );
    expect(rows[0]).toMatchObject({ id: "live", quantity: 2, dismissed: false });
  });

  it("hides the line when the row written with exactly the canonical key is dismissed", () => {
    const rows = canonicalRows(
      [row("Tomaten|g", { manual: true, id: "live" }), row("~tomato|g", { dismissed: true, id: "exact" })],
      canon,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "live", dismissed: true });
  });

  it("takes dismissed from the details row when there is no exact row", () => {
    const rows = canonicalRows([row("Tomaten|g", { manual: true, dismissed: true }), row("tomatoes|g", { manual: true, dismissed: true })], canon);
    expect(rows[0].dismissed).toBe(true);
  });

  it("uses every() for checked when no row has exactly the canonical key", () => {
    const some = canonicalRows([row("Tomaten|g", { manual: true, checked: true }), row("tomatoes|g", { manual: true })], canon);
    const all = canonicalRows([row("Tomaten|g", { manual: true, checked: true }), row("tomatoes|g", { manual: true, checked: true })], canon);
    expect(some[0].checked).toBe(false);
    expect(all[0].checked).toBe(true);
  });

  it("returns nothing for no rows", () => {
    expect(canonicalRows([], canon)).toEqual([]);
  });

  it("follows a merge rule: rows of a merged name read as the target's", () => {
    const merging = createCanonicaliser({
      locale: "en",
      rules: [{ from: "aubergine", to: "eggplant", fromLabel: "Aubergine", toLabel: "Eggplant" }],
    });
    expect(canonicalRows([row("aubergine|", { checked: true })], merging).map((r) => r.key)).toEqual(["eggplant|"]);
  });
});

describe("withCanonicalKeys", () => {
  it("re-keys every row and keeps the rest", () => {
    expect(withCanonicalKeys([{ key: "Tomaten|EL", x: 1 }, { key: "milk|", x: 2 }], canon)).toEqual([
      { key: "~tomato|tbsp", x: 1 },
      { key: "~milk|", x: 2 },
    ]);
  });
});
