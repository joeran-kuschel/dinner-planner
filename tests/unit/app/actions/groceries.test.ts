import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { groceryKey } from "@/lib/grocery";
import { addDays, dayKey, parseDayKey, startOfWeek } from "@/lib/week";
import { formData } from "@/tests/support/db";
import { MAX_MERGE_RULES, MAX_RULE_LABEL, MAX_RULE_NAME } from "@/lib/ingredients/merge-rules";
import {
  addGroceryExtra,
  keepGroceryNameSeparate,
  mergeGroceryLines,
  removeGroceryExtra,
  toggleGroceryLine,
  unkeepGroceryName,
  unmergeGroceryLines,
} from "@/app/actions/groceries";

// Fixed Mondays, so the tests never depend on the real clock.
const WEEK = parseDayKey("2026-09-28")!;
const NEXT_WEEK = addDays(WEEK, 7);

function entries(weekStart = WEEK) {
  return prisma.groceryEntry.findMany({ where: { weekStart }, orderBy: { key: "asc" } });
}

function expectGroceriesRevalidated() {
  expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/groceries"]]);
}

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
});

describe("toggleGroceryLine", () => {
  const tomatoes = { weekStart: dayKey(WEEK), key: groceryKey("Tomatoes", "g"), label: "Tomatoes" };

  it("creates a tick row for a derived line the first time it is ticked", async () => {
    await toggleGroceryLine(formData({ ...tomatoes, checked: "true" }));

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "tomatoes|g",
      label: "Tomatoes",
      checked: true,
      manual: false,
      quantity: null,
      unit: null,
    });
    expect(rows[0].weekStart.toISOString()).toBe("2026-09-28T00:00:00.000Z");
    expectGroceriesRevalidated();
  });

  it("unticks the existing row instead of adding another", async () => {
    await toggleGroceryLine(formData({ ...tomatoes, checked: "true" }));
    await toggleGroceryLine(formData({ ...tomatoes, checked: "false" }));

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0].checked).toBe(false);
  });

  it.each([["missing", undefined], ["empty", ""], ["TRUE in capitals", "TRUE"], ["on", "on"], ["1", "1"]])(
    "stores unchecked when `checked` is %s",
    async (_label, checked) => {
      await toggleGroceryLine(formData(checked === undefined ? tomatoes : { ...tomatoes, checked }));

      expect((await entries())[0].checked).toBe(false);
    },
  );

  it("accepts `checked` padded with whitespace", async () => {
    await toggleGroceryLine(formData({ ...tomatoes, checked: " true " }));

    expect((await entries())[0].checked).toBe(true);
  });

  it("falls back to the key as label when no label is sent", async () => {
    await toggleGroceryLine(formData({ weekStart: dayKey(WEEK), key: "salt|", label: "  ", checked: "true" }));

    expect((await entries())[0].label).toBe("salt|");
  });

  it("keeps an existing row's label, manual flag and amount when ticking it", async () => {
    await prisma.groceryEntry.create({
      data: { weekStart: WEEK, key: "wine|", label: "Wine", quantity: 2, manual: true },
    });

    await toggleGroceryLine(formData({ weekStart: dayKey(WEEK), key: "wine|", label: "Other", checked: "true" }));

    expect((await entries())[0]).toMatchObject({ label: "Wine", manual: true, quantity: 2, checked: true });
  });

  it("keeps tick state per week", async () => {
    await toggleGroceryLine(formData({ ...tomatoes, checked: "true" }));
    await toggleGroceryLine(formData({ ...tomatoes, weekStart: dayKey(NEXT_WEEK), checked: "false" }));

    expect((await entries(WEEK))[0].checked).toBe(true);
    expect((await entries(NEXT_WEEK))[0].checked).toBe(false);
  });

  it("ignores extra form fields", async () => {
    await toggleGroceryLine(
      formData({ ...tomatoes, checked: "true", manual: "true", quantity: "5", id: "chosen" }),
    );

    expect((await entries())[0]).toMatchObject({ manual: false, quantity: null });
    expect((await entries())[0].id).not.toBe("chosen");
  });

  it.each([["missing", undefined], ["empty", ""], ["whitespace-only", "   "]])(
    "throws for a %s key without writing",
    async (_label, key) => {
      const fields: Record<string, string> = { weekStart: dayKey(WEEK), label: "x", checked: "true" };
      if (key !== undefined) fields.key = key;

      await expect(toggleGroceryLine(formData(fields))).rejects.toThrow("toggleGroceryLine: missing `key`");

      expect(await prisma.groceryEntry.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each([["missing", undefined], ["empty", ""], ["malformed", "2026-09-31"], ["an instant", "2026-09-28T00:00Z"]])(
    "throws for a %s weekStart without writing",
    async (_label, weekStart) => {
      const fields: Record<string, string> = { key: "salt|", checked: "true" };
      if (weekStart !== undefined) fields.weekStart = weekStart;

      await expect(toggleGroceryLine(formData(fields))).rejects.toThrow(/`weekStart`/);

      expect(await prisma.groceryEntry.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("stores a non-Monday weekStart under its Monday, where the grocery page reads it", async () => {
    await toggleGroceryLine(formData({ ...tomatoes, weekStart: dayKey(addDays(WEEK, 2)), checked: "true" }));

    const rows = await entries(WEEK);
    expect(rows).toHaveLength(1);
    expect(rows[0].weekStart).toEqual(startOfWeek(addDays(WEEK, 2)));
  });
});

describe("addGroceryExtra", () => {
  it("drops NUL characters from the label instead of crashing", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Dish\u0000 soap" }));

    expect((await entries())[0]).toMatchObject({ label: "Dish soap" });
  });

  it("adds a non-Monday weekStart's extra to its Monday", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(addDays(WEEK, 4)), label: "Wine" }));

    expect(await entries(WEEK)).toHaveLength(1);
  });

  it("adds a manual extra with a normalised key, revalidating the list", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "  Red Wine ", quantity: "2", unit: " Bottles " }));

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      key: "~red-wine|bottles",
      label: "Red Wine",
      quantity: 2,
      unit: "Bottles",
      manual: true,
      checked: false,
    });
    expectGroceriesRevalidated();
  });

  it("files an extra under the chosen category, and under Other by default", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Wine", category: "DRINKS" }));
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Bin bags" }));

    const rows = await entries();
    expect(rows.map((row) => [row.label, row.category])).toEqual([
      ["Bin bags", "OTHER"],
      ["Wine", "DRINKS"],
    ]);
  });

  it("files an extra under Other when the category is not one of ours", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Wine", category: "LIQUOR" }));
    expect((await entries())[0].category).toBe("OTHER");
  });

  it("moves an extra to another category when it is added again", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Wine", category: "PANTRY" }));
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Wine", category: "DRINKS" }));

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0].category).toBe("DRINKS");
  });

  it("stores no unit and no amount when they are left empty", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Dish soap", quantity: "", unit: "  " }));

    expect((await entries())[0]).toMatchObject({ key: "dish soap|", quantity: null, unit: null });
  });

  it.each([
    ["a decimal comma", "1,5", 1.5],
    ["a decimal point", "0.5", 0.5],
    ["zero", "0", null],
    ["negative", "-1", null],
    ["not a number", "some", null],
    ["whitespace-only", "  ", null],
    ["missing", undefined, null],
  ])("parses a quantity given as %s", async (_label, quantity, expected) => {
    const fields: Record<string, string> = { weekStart: dayKey(WEEK), label: "Milk", unit: "l" };
    if (quantity !== undefined) fields.quantity = quantity;

    await addGroceryExtra(formData(fields));

    expect((await entries())[0].quantity).toBe(expected);
  });

  it("updates the amount when the same extra is added again, ignoring case and spacing", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Wine", quantity: "1", unit: "bottle" }));
    await prisma.groceryEntry.updateMany({ data: { checked: true } });

    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: " WINE ", quantity: "3", unit: "Bottle" }));

    const rows = await entries();
    expect(rows).toHaveLength(1);
    // The latest spelling wins; a tick survives the update.
    expect(rows[0]).toMatchObject({ label: "WINE", quantity: 3, unit: "Bottle", checked: true });
  });

  it("keeps the same name with different units as separate extras", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Tomatoes", quantity: "500", unit: "g" }));
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Tomatoes", quantity: "2" }));

    expect((await entries()).map((row) => row.key)).toEqual(["~tomato|", "~tomato|g"]);
  });

  it("keeps extras per week", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Wine", quantity: "1" }));
    await addGroceryExtra(formData({ weekStart: dayKey(NEXT_WEEK), label: "Wine", quantity: "4" }));

    expect((await entries(WEEK))[0].quantity).toBe(1);
    expect((await entries(NEXT_WEEK))[0].quantity).toBe(4);
  });

  it("ignores extra form fields", async () => {
    await addGroceryExtra(
      formData({ weekStart: dayKey(WEEK), label: "Bread", checked: "true", manual: "false", key: "evil|" }),
    );

    expect((await entries())[0]).toMatchObject({ key: "bread|", manual: true, checked: false });
  });

  it.each([["missing", undefined], ["empty", ""], ["whitespace-only", " \t "]])(
    "does nothing for a %s label",
    async (_label, label) => {
      const fields: Record<string, string> = { weekStart: dayKey(WEEK), quantity: "1" };
      if (label !== undefined) fields.label = label;

      await addGroceryExtra(formData(fields));

      expect(await prisma.groceryEntry.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it.each([["missing", undefined], ["whitespace-only", "  "], ["malformed", "28.09.2026"]])(
    "throws for a %s weekStart without writing",
    async (_label, weekStart) => {
      const fields: Record<string, string> = { label: "Wine" };
      if (weekStart !== undefined) fields.weekStart = weekStart;

      await expect(addGroceryExtra(formData(fields))).rejects.toThrow(/`weekStart`/);

      expect(await prisma.groceryEntry.count()).toBe(0);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe("removeGroceryExtra", () => {
  it("removes only the given extra", async () => {
    const wine = await prisma.groceryEntry.create({
      data: { weekStart: WEEK, key: "wine|", label: "Wine", manual: true },
    });
    await prisma.groceryEntry.create({ data: { weekStart: WEEK, key: "soap|", label: "Soap", manual: true } });

    await removeGroceryExtra(formData({ id: wine.id }));

    expect((await entries()).map((row) => row.key)).toEqual(["soap|"]);
    expectGroceriesRevalidated();
  });

  it("accepts an id padded with whitespace", async () => {
    const wine = await prisma.groceryEntry.create({
      data: { weekStart: WEEK, key: "wine|", label: "Wine", manual: true },
    });

    await removeGroceryExtra(formData({ id: ` ${wine.id} ` }));

    expect(await prisma.groceryEntry.count()).toBe(0);
  });

  it("fails for an unknown id without revalidating", async () => {
    await prisma.groceryEntry.create({ data: { weekStart: WEEK, key: "wine|", label: "Wine", manual: true } });

    await expect(removeGroceryExtra(formData({ id: "no-such-entry" }))).rejects.toThrow();

    expect(await prisma.groceryEntry.count()).toBe(1);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it.each([["missing", undefined], ["empty", ""], ["whitespace-only", "   "]])(
    "throws for a %s id",
    async (_label, id) => {
      await expect(removeGroceryExtra(formData(id === undefined ? {} : { id }))).rejects.toThrow(
        "removeGroceryExtra: missing `id`",
      );

      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});

describe("entries carried over from an earlier week", () => {
  const wine = { weekStart: dayKey(NEXT_WEEK), key: "wine|bottles", label: "Wine" };

  beforeEach(async () => {
    await prisma.groceryEntry.create({
      data: { weekStart: WEEK, key: "wine|bottles", label: "Wine", quantity: 2, unit: "bottles", category: "DRINKS", manual: true },
    });
  });

  it("ticking one writes a hand-added row for this week with its details, and leaves the earlier week alone", async () => {
    await toggleGroceryLine(formData({ ...wine, checked: "true", carried: "1", quantity: "2", unit: "bottles", category: "DRINKS" }));

    expect(await entries(NEXT_WEEK)).toMatchObject([
      { key: "wine|bottles", label: "Wine", quantity: 2, unit: "bottles", category: "DRINKS", manual: true, checked: true, dismissed: false },
    ]);
    expect(await entries()).toMatchObject([{ checked: false, manual: true }]);
  });

  it("ticking it again after unticking updates the same row", async () => {
    const fields = { ...wine, carried: "1", quantity: "2", unit: "bottles", category: "DRINKS" };
    await toggleGroceryLine(formData({ ...fields, checked: "true" }));
    await toggleGroceryLine(formData({ ...fields, checked: "false" }));

    expect(await entries(NEXT_WEEK)).toMatchObject([{ checked: false, manual: true }]);
  });

  it("a tick without `carried` still writes a plain tick row", async () => {
    await toggleGroceryLine(formData({ ...wine, checked: "true" }));

    expect(await entries(NEXT_WEEK)).toMatchObject([{ manual: false, quantity: null, checked: true }]);
  });

  it("deleting one in this week writes a dismissed row and leaves the earlier week's entry", async () => {
    await removeGroceryExtra(formData({ ...wine, carried: "1" }));

    expect(await entries(NEXT_WEEK)).toMatchObject([{ key: "wine|bottles", manual: true, dismissed: true, checked: false }]);
    expect(await entries()).toHaveLength(1);
    expectGroceriesRevalidated();
  });

  it("deleting one that was ticked in this week dismisses it, unticked", async () => {
    await toggleGroceryLine(formData({ ...wine, checked: "true", carried: "1", quantity: "2", unit: "bottles", category: "DRINKS" }));

    await removeGroceryExtra(formData({ ...wine, carried: "1" }));

    expect(await entries(NEXT_WEEK)).toMatchObject([{ dismissed: true, checked: false }]);
  });

  it("throws for a carried deletion without a key", async () => {
    await expect(removeGroceryExtra(formData({ weekStart: dayKey(NEXT_WEEK), carried: "1" }))).rejects.toThrow(/`key`/);
  });

  it("adding the same item again in this week brings back a dismissed one", async () => {
    await removeGroceryExtra(formData({ ...wine, carried: "1" }));

    await addGroceryExtra(formData({ weekStart: dayKey(NEXT_WEEK), label: "Wine", unit: "bottles", quantity: "1" }));

    expect(await entries(NEXT_WEEK)).toMatchObject([{ manual: true, dismissed: false, quantity: 1 }]);
  });
});

describe("addGroceryExtra and the dictionary", () => {
  it("stores the canonical key of a name in the dictionary and keeps the label as typed", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Tomaten", quantity: "500", unit: "Gramm" }));

    expect((await entries())[0]).toMatchObject({ key: "~tomato|g", label: "Tomaten", unit: "Gramm", quantity: 500 });
  });

  it("adds the same ingredient in another language to the same row", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Tomaten", quantity: "1", unit: "g" }));
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "tomatoes", quantity: "2", unit: "grams" }));

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "~tomato|g", label: "tomatoes", quantity: 2 });
  });

  it("stores the rule target's key for a merged name", async () => {
    await prisma.groceryMergeRule.create({
      data: { fromName: "aubergine", toName: "eggplant", fromLabel: "Aubergine", toLabel: "Eggplant" },
    });

    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Aubergine", unit: "kg" }));

    expect((await entries())[0]).toMatchObject({ key: "eggplant|g", label: "Aubergine", unit: "kg" });
  });

  it("counts garlic cloves as garlic in cloves", async () => {
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Knoblauchzehen" }));

    expect((await entries())[0].key).toBe("~garlic|clove");
  });
});

const rules = () => prisma.groceryMergeRule.findMany({ orderBy: { fromName: "asc" } });
const merge = (fields: Record<string, string>) => mergeGroceryLines(formData(fields));

describe("mergeGroceryLines", () => {
  it("stores the rule, revalidates the list and says it merged", async () => {
    const result = await merge({ from: "aubergine", to: "eggplant", fromLabel: "Aubergine", toLabel: "Eggplant" });

    expect(result).toBe("merged");
    expect(await rules()).toEqual([
      expect.objectContaining({ fromName: "aubergine", toName: "eggplant", fromLabel: "Aubergine", toLabel: "Eggplant" }),
    ]);
    expectGroceriesRevalidated();
  });

  it("merges dictionary groups by their ids and normalises typed names", async () => {
    await merge({ from: "~shallot", to: "  RED   Onion ", fromLabel: "Shallot", toLabel: "Red Onion" });

    expect(await rules()).toEqual([expect.objectContaining({ fromName: "~shallot", toName: "red onion" })]);
  });

  it("falls back to the ids as labels when none are sent", async () => {
    await merge({ from: "a", to: "b" });

    expect(await rules()).toEqual([expect.objectContaining({ fromLabel: "a", toLabel: "b" })]);
  });

  it("cuts long labels to 80 characters", async () => {
    await merge({ from: "a", to: "b", fromLabel: "x".repeat(200), toLabel: "y".repeat(200) });

    const [rule] = await rules();
    expect(rule.fromLabel).toHaveLength(MAX_RULE_LABEL);
    expect(rule.toLabel).toHaveLength(MAX_RULE_LABEL);
  });

  it("stores a 150-character name whole", async () => {
    expect(await merge({ from: "n".repeat(150), to: "b" })).toBe("merged");

    expect((await rules())[0].fromName).toBe("n".repeat(150));
  });

  it("accepts a name of exactly 200 characters", async () => {
    expect(await merge({ from: "n".repeat(MAX_RULE_NAME), to: "b" })).toBe("merged");
  });

  it.each([["from", { from: "n".repeat(201), to: "b" }], ["to", { from: "a", to: "n".repeat(201) }]])(
    "answers invalid for a %s name longer than 200 characters, writing and revalidating nothing",
    async (_label, fields) => {
      expect(await merge(fields)).toBe("invalid");

      expect(await rules()).toEqual([]);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("measures the length after normalising", async () => {
    expect(await merge({ from: `  ${"n".repeat(200)}  `, to: "b" })).toBe("merged");
  });

  it("moves a name that is merged again instead of adding a second rule", async () => {
    await merge({ from: "a", to: "b", fromLabel: "A", toLabel: "B" });
    await merge({ from: "a", to: "c", fromLabel: "A2", toLabel: "C" });

    expect(await rules()).toEqual([expect.objectContaining({ fromName: "a", toName: "c", fromLabel: "A2", toLabel: "C" })]);
  });

  it.each([
    ["no from", { to: "b" }],
    ["no to", { from: "a" }],
    ["blank names", { from: "  ", to: " " }],
    ["nothing at all", {}],
    ["the same name", { from: "a", to: "a" }],
    ["the same name in another spelling", { from: "A ", to: " a" }],
    ["the same group", { from: "~tomato", to: "~tomato" }],
  ])("answers invalid for %s, writing and revalidating nothing", async (_label, fields) => {
    expect(await merge(fields)).toBe("invalid");

    expect(await rules()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("answers invalid for a merge that would send two names round in a circle", async () => {
    await merge({ from: "a", to: "b" });
    await merge({ from: "b", to: "c" });
    vi.mocked(revalidatePath).mockClear();

    expect(await merge({ from: "c", to: "a" })).toBe("invalid");
    expect(await merge({ from: "b", to: "a" })).toBe("invalid");

    expect((await rules()).map((rule) => rule.fromName)).toEqual(["a", "b"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ignores extra form fields", async () => {
    await merge({ from: "a", to: "b", id: "evil", createdAt: "2000-01-01" });

    const [rule] = await rules();
    expect(rule.id).not.toBe("evil");
    expect(rule.createdAt.getFullYear()).toBeGreaterThan(2000);
  });

  describe("limit", () => {
    const fill = () =>
      prisma.groceryMergeRule.createMany({
        data: Array.from({ length: MAX_MERGE_RULES }, (_, i) => ({
          fromName: `from ${i}`,
          toName: `to ${i}`,
          fromLabel: `From ${i}`,
          toLabel: `To ${i}`,
        })),
      });

    it("refuses a new rule once there are 300", async () => {
      await fill();

      expect(await merge({ from: "one more", to: "target" })).toBe("limit");

      expect(await prisma.groceryMergeRule.count()).toBe(MAX_MERGE_RULES);
      expect(revalidatePath).not.toHaveBeenCalled();
    });

    it("still moves a name that has a rule already", async () => {
      await fill();

      expect(await merge({ from: "from 7", to: "elsewhere", toLabel: "Elsewhere" })).toBe("merged");

      expect(await prisma.groceryMergeRule.count()).toBe(MAX_MERGE_RULES);
      expect(await prisma.groceryMergeRule.findUnique({ where: { fromName: "from 7" } })).toMatchObject({ toName: "elsewhere" });
    });

    it("allows the 300th rule", async () => {
      await prisma.groceryMergeRule.createMany({
        data: Array.from({ length: MAX_MERGE_RULES - 1 }, (_, i) => ({
          fromName: `from ${i}`,
          toName: `to ${i}`,
          fromLabel: "F",
          toLabel: "T",
        })),
      });

      expect(await merge({ from: "last", to: "target" })).toBe("merged");
    });
  });
});

describe("unmergeGroceryLines", () => {
  it("removes only the given rule and revalidates the list", async () => {
    await merge({ from: "a", to: "b" });
    await merge({ from: "c", to: "d" });
    const [a] = await rules();
    vi.mocked(revalidatePath).mockClear();

    await unmergeGroceryLines(formData({ id: a.id }));

    expect((await rules()).map((rule) => rule.fromName)).toEqual(["c"]);
    expectGroceriesRevalidated();
  });

  it("accepts an id padded with whitespace", async () => {
    await merge({ from: "a", to: "b" });
    const [rule] = await rules();

    await unmergeGroceryLines(formData({ id: ` ${rule.id} ` }));

    expect(await rules()).toEqual([]);
  });

  it("does not fail for an unknown id, as the rule may be undone in another tab already", async () => {
    await merge({ from: "a", to: "b" });

    await unmergeGroceryLines(formData({ id: "nope" }));

    expect(await rules()).toHaveLength(1);
  });

  it.each([["missing", {}], ["empty", { id: "" }], ["whitespace-only", { id: "  " }]])(
    "throws for a %s id without touching the rules",
    async (_label, fields) => {
      await merge({ from: "a", to: "b" });
      vi.mocked(revalidatePath).mockClear();

      await expect(unmergeGroceryLines(formData(fields))).rejects.toThrow(/`id`/);

      expect(await rules()).toHaveLength(1);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );

  it("splits the lines again: the name is its own line once more", async () => {
    await merge({ from: "aubergine", to: "eggplant" });
    const [rule] = await rules();
    await unmergeGroceryLines(formData({ id: rule.id }));

    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Aubergine" }));

    expect((await entries())[0].key).toBe("aubergine|");
  });
});

const kept = () => prisma.groceryKeepSeparate.findMany({ orderBy: { name: "asc" } });
const keep = (fields: Record<string, string>) => keepGroceryNameSeparate(formData(fields));

describe("keepGroceryNameSeparate", () => {
  it("stores the name normalised and as typed, revalidates the list and says it kept it", async () => {
    expect(await keep({ label: "  Tomaten " })).toBe("kept");

    expect(await kept()).toEqual([expect.objectContaining({ name: "tomaten", label: "Tomaten" })]);
    expectGroceriesRevalidated();
  });

  it("keeps one row when the same name is kept again, in any case", async () => {
    await keep({ label: "Tomaten" });
    await keep({ label: "TOMATEN " });

    expect(await kept()).toHaveLength(1);
  });

  it.each([["missing", {}], ["blank", { label: "   " }], ["a bar only", { label: "|" }]])("answers invalid for a %s name", async (_what, fields) => {
    expect(await keep(fields)).toBe("invalid");
    expect(await kept()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("cuts the label and refuses a name that is too long to be an ingredient", async () => {
    await keep({ label: "x".repeat(MAX_RULE_LABEL + 20) });
    expect((await kept())[0].label).toHaveLength(MAX_RULE_LABEL);
    expect(MAX_RULE_NAME).toBeGreaterThanOrEqual(MAX_RULE_LABEL);
  });

  it("stops at the limit, but still accepts a name that is kept already", async () => {
    await prisma.groceryKeepSeparate.createMany({
      data: Array.from({ length: MAX_MERGE_RULES }, (_, i) => ({ name: `n${i}`, label: `n${i}` })),
    });

    expect(await keep({ label: "one more" })).toBe("limit");
    expect(await keep({ label: "n3" })).toBe("kept");
    expect(await prisma.groceryKeepSeparate.count()).toBe(MAX_MERGE_RULES);
  });
});

describe("unkeepGroceryName", () => {
  it("removes only the given name and revalidates the list", async () => {
    await keep({ label: "Tomaten" });
    await keep({ label: "Quinces" });
    const [quinces] = await kept();
    vi.mocked(revalidatePath).mockClear();

    await unkeepGroceryName(formData({ id: quinces.id }));

    expect((await kept()).map((row) => row.name)).toEqual(["tomaten"]);
    expectGroceriesRevalidated();
  });

  it("does not fail for an id that is gone, but throws for a missing one", async () => {
    await unkeepGroceryName(formData({ id: "nope" }));
    await expect(unkeepGroceryName(formData({}))).rejects.toThrow("missing `id`");
  });
});

describe("addGroceryExtra and the plural fold", () => {
  const add = (label: string) => addGroceryExtra(formData({ weekStart: dayKey(WEEK), label, quantity: "1" }));

  it("keys an extra like the page does: a plural of a name on the page is that name", async () => {
    const recipe = await prisma.recipe.create({
      data: { name: "Tart", servings: 2, ingredients: { create: [{ name: "quince", quantity: 1, unit: null, position: 0 }] } },
    });
    await prisma.plannedMeal.create({ data: { date: WEEK, recipeId: recipe.id, servings: 2 } });

    await add("Quinces");

    expect((await entries())[0]).toMatchObject({ key: "quince|", label: "Quinces" });
  });

  it("makes one row of a plural and its singular both added by hand: the second goes into the row of the first", async () => {
    await add("Quinces");
    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "quince", quantity: "2" }));

    const rows = await entries();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ label: "quince", quantity: 2 });
  });

  it("does not count an earlier week's entry that was ticked or deleted", async () => {
    await prisma.groceryEntry.create({ data: { weekStart: addDays(WEEK, -7), key: "quince|", label: "quince", manual: true, checked: true } });

    await add("Quinces");

    expect((await entries())[0].key).toBe("quinces|");
  });

  it("counts a carried entry", async () => {
    await prisma.groceryEntry.create({ data: { weekStart: addDays(WEEK, -7), key: "quince|", label: "quince", manual: true } });

    await add("Quinces");

    expect((await entries())[0].key).toBe("quince|");
  });
});

describe("addGroceryExtra and the names kept apart", () => {
  it("stores the key of the name as typed for a name that is kept on its own line", async () => {
    await keep({ label: "Tomaten" });

    await addGroceryExtra(formData({ weekStart: dayKey(WEEK), label: "Tomaten", quantity: "1", unit: "g" }));

    expect((await entries())[0]).toMatchObject({ key: "tomaten|g", label: "Tomaten" });
  });
});
