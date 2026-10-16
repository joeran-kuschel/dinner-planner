import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_SHELF_ITEMS, MAX_SHELF_NAME, MAX_SHELF_UNIT } from "@/lib/shelf";
import { formData } from "@/tests/support/db";
import { addShelfItem, removeShelfItem, updateShelfItem } from "@/app/actions/shelf";

const rows = () => prisma.shelfItem.findMany({ orderBy: { boughtOn: "asc" } });
const refreshed = () => vi.mocked(revalidatePath).mock.calls;

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
});

describe("addShelfItem", () => {
  it("stores the entry with its amount, unit, day and section, and refreshes the shelf and the list", async () => {
    await addShelfItem(
      formData({ label: "  Milk ", quantity: "1,5", unit: "l", boughtOn: "2026-10-12", category: "DAIRY_EGGS" }),
    );
    const [item] = await rows();
    expect(item).toMatchObject({ name: "milk", label: "Milk", quantity: 1.5, unit: "l", category: "DAIRY_EGGS", sourceKey: null });
    expect(item.boughtOn.toISOString()).toBe("2026-10-12T00:00:00.000Z");
    expect(refreshed()).toEqual([["/shelf"], ["/groceries"]]);
  });

  it("keeps every purchase of the same name", async () => {
    await addShelfItem(formData({ label: "Milk", boughtOn: "2026-10-01" }));
    await addShelfItem(formData({ label: "milk", boughtOn: "2026-10-01" }));
    expect(await rows()).toHaveLength(2);
  });

  it("takes today when no day is sent, and no amount, unit or section when none is", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 9, 14, 23, 30));
    try {
      await addShelfItem(formData({ label: "Rice", quantity: "abc", category: "NOPE" }));
    } finally {
      vi.useRealTimers();
    }
    const [item] = await rows();
    expect(item).toMatchObject({ quantity: null, unit: null, category: "OTHER" });
    expect(item.boughtOn.toISOString()).toBe("2026-10-14T00:00:00.000Z");
  });

  it.each([
    ["a blank name", { label: "   " }],
    ["no name", {}],
    ["a name too long", { label: "x".repeat(MAX_SHELF_NAME + 1) }],
    ["a label too long once its spaces are collapsed", { label: `milk${" ".repeat(MAX_SHELF_NAME)}x` }],
    ["an invalid day", { label: "Milk", boughtOn: "2026-13-45" }],
    ["a day that is no day", { label: "Milk", boughtOn: "yesterday" }],
  ])("ignores %s", async (_what, fields) => {
    await addShelfItem(formData(fields));
    expect(await rows()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("accepts the longest name and cuts a unit that is too long", async () => {
    await addShelfItem(formData({ label: "x".repeat(MAX_SHELF_NAME), unit: "u".repeat(MAX_SHELF_UNIT + 5) }));
    const [item] = await rows();
    expect(item.name).toHaveLength(MAX_SHELF_NAME);
    expect(item.unit).toHaveLength(MAX_SHELF_UNIT);
  });

  it("ignores a new entry at the limit", async () => {
    await prisma.shelfItem.createMany({
      data: Array.from({ length: MAX_SHELF_ITEMS }, (_, i) => ({ name: `n${i}`, label: `n${i}`, boughtOn: new Date(0) })),
    });
    await addShelfItem(formData({ label: "One more" }));
    expect(await prisma.shelfItem.count()).toBe(MAX_SHELF_ITEMS);
  });
});

describe("updateShelfItem", () => {
  async function seed() {
    return prisma.shelfItem.create({
      data: { name: "milk", label: "Milk", quantity: 1, unit: "l", boughtOn: new Date("2026-10-01T00:00:00Z"), sourceKey: "milk|", sourceWeek: new Date("2026-09-28T00:00:00Z") },
    });
  }

  it("changes every field, and keeps the link to the grocery line that made the entry", async () => {
    const item = await seed();
    await updateShelfItem(
      formData({ id: item.id, label: "Oat milk", quantity: "2", unit: "bottles", boughtOn: "2026-10-09", category: "DRINKS" }),
    );
    const [changed] = await rows();
    expect(changed).toMatchObject({ name: "oat milk", label: "Oat milk", quantity: 2, unit: "bottles", category: "DRINKS", sourceKey: "milk|" });
    expect(changed.boughtOn.toISOString()).toBe("2026-10-09T00:00:00.000Z");
    expect(refreshed()).toEqual([["/shelf"], ["/groceries"]]);
  });

  it("clears the amount when the field is emptied", async () => {
    const item = await seed();
    await updateShelfItem(formData({ id: item.id, label: "Milk", quantity: "", unit: "", boughtOn: "2026-10-01" }));
    expect((await rows())[0]).toMatchObject({ quantity: null, unit: null });
  });

  it.each([
    ["a blank name", { label: " ", boughtOn: "2026-10-09" }],
    ["no day", { label: "Milk" }],
    ["an invalid day", { label: "Milk", boughtOn: "2026-02-31" }],
  ])("ignores %s and changes nothing", async (_what, fields) => {
    const item = await seed();
    await updateShelfItem(formData({ id: item.id, ...fields }));
    expect((await rows())[0]).toMatchObject({ label: "Milk", quantity: 1 });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("is no error for an entry removed in another tab, but a missing id throws", async () => {
    await expect(updateShelfItem(formData({ id: "gone", label: "Milk", boughtOn: "2026-10-09" }))).resolves.toBeUndefined();
    expect(await rows()).toEqual([]);
    await expect(updateShelfItem(formData({ label: "Milk", boughtOn: "2026-10-09" }))).rejects.toThrow("missing `id`");
  });
});

describe("removeShelfItem", () => {
  it("removes only the given entry", async () => {
    const a = await prisma.shelfItem.create({ data: { name: "milk", label: "Milk", boughtOn: new Date(0) } });
    await prisma.shelfItem.create({ data: { name: "milk", label: "Milk", boughtOn: new Date(1000) } });
    await removeShelfItem(formData({ id: a.id }));
    expect(await rows()).toHaveLength(1);
    expect(refreshed()).toEqual([["/shelf"], ["/groceries"]]);
  });

  it("is no error for an entry that is gone, but a missing id throws", async () => {
    await expect(removeShelfItem(formData({ id: "gone" }))).resolves.toBeUndefined();
    await expect(removeShelfItem(formData({}))).rejects.toThrow("missing `id`");
  });
});
