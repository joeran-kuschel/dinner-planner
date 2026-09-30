import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { groceryKey } from "@/lib/grocery";
import { addDays, dayKey, parseDayKey, startOfWeek } from "@/lib/week";
import { formData } from "@/tests/support/db";
import { addGroceryExtra, removeGroceryExtra, resetGroceryTicks, toggleGroceryLine } from "@/app/actions/groceries";

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
      key: "red wine|bottles",
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

    expect((await entries()).map((row) => row.key)).toEqual(["tomatoes|", "tomatoes|g"]);
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

describe("resetGroceryTicks", () => {
  it("unticks every line of the week but keeps extras and other weeks", async () => {
    await prisma.groceryEntry.createMany({
      data: [
        { weekStart: WEEK, key: "tomatoes|g", label: "Tomatoes", checked: true },
        { weekStart: WEEK, key: "wine|", label: "Wine", manual: true, quantity: 2, checked: true },
        { weekStart: WEEK, key: "soap|", label: "Soap", manual: true, checked: false },
        { weekStart: NEXT_WEEK, key: "tomatoes|g", label: "Tomatoes", checked: true },
      ],
    });

    await resetGroceryTicks(formData({ weekStart: dayKey(WEEK) }));

    const thisWeek = await entries(WEEK);
    expect(thisWeek.map((row) => [row.key, row.checked, row.manual])).toEqual([
      ["soap|", false, true],
      ["tomatoes|g", false, false],
      ["wine|", false, true],
    ]);
    expect(thisWeek.find((row) => row.key === "wine|")?.quantity).toBe(2);
    expect((await entries(NEXT_WEEK))[0].checked).toBe(true);
    expectGroceriesRevalidated();
  });

  it("succeeds on a week without any rows", async () => {
    await resetGroceryTicks(formData({ weekStart: dayKey(WEEK) }));

    expectGroceriesRevalidated();
  });

  it.each([["missing", undefined], ["empty", ""], ["malformed", "next week"]])(
    "throws for a %s weekStart without changing anything",
    async (_label, weekStart) => {
      await prisma.groceryEntry.create({
        data: { weekStart: WEEK, key: "salt|", label: "Salt", checked: true },
      });

      await expect(resetGroceryTicks(formData(weekStart === undefined ? {} : { weekStart }))).rejects.toThrow(
        /`weekStart`/,
      );

      expect((await entries())[0].checked).toBe(true);
      expect(revalidatePath).not.toHaveBeenCalled();
    },
  );
});
