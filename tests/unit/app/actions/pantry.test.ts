import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/db";
import { MAX_STAPLE_LENGTH, MAX_STAPLES } from "@/lib/pantry";
import { formData } from "@/tests/support/db";
import { addPantryStaple, removePantryStaple } from "@/app/actions/pantry";

const names = async () => (await prisma.pantryStaple.findMany({ orderBy: { name: "asc" } })).map((s) => s.name);

beforeEach(() => {
  vi.mocked(revalidatePath).mockClear();
});

describe("addPantryStaple", () => {
  it("stores the name normalised and refreshes the grocery list", async () => {
    await addPantryStaple(formData({ name: "  Olive   OIL " }));
    expect(await names()).toEqual(["olive oil"]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/groceries"]]);
  });

  it("keeps one staple when the same name is added again, in any case", async () => {
    await addPantryStaple(formData({ name: "Salt" }));
    await addPantryStaple(formData({ name: "salt " }));
    await addPantryStaple(formData({ name: "SALT" }));
    expect(await names()).toEqual(["salt"]);
  });

  it.each([["blank", "   "], ["empty", ""]])("ignores a %s name", async (_label, name) => {
    await addPantryStaple(formData({ name }));
    expect(await names()).toEqual([]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("ignores a missing name field", async () => {
    await addPantryStaple(formData({}));
    expect(await names()).toEqual([]);
  });

  it("accepts the longest name and ignores one character more", async () => {
    await addPantryStaple(formData({ name: "x".repeat(MAX_STAPLE_LENGTH) }));
    await addPantryStaple(formData({ name: "y".repeat(MAX_STAPLE_LENGTH + 1) }));
    expect(await names()).toEqual(["x".repeat(MAX_STAPLE_LENGTH)]);
  });

  it("drops NUL characters instead of crashing", async () => {
    await addPantryStaple(formData({ name: "sa\u0000lt" }));
    expect(await names()).toEqual(["salt"]);
  });

  it("stops at the largest number of staples, but still accepts one that is there already", async () => {
    await prisma.pantryStaple.createMany({
      data: Array.from({ length: MAX_STAPLES }, (_, i) => ({ name: `staple ${i}` })),
    });

    await addPantryStaple(formData({ name: "one too many" }));
    expect(await prisma.pantryStaple.count()).toBe(MAX_STAPLES);
    expect(await prisma.pantryStaple.findUnique({ where: { name: "one too many" } })).toBeNull();

    vi.mocked(revalidatePath).mockClear();
    await addPantryStaple(formData({ name: "Staple 7" }));
    expect(await prisma.pantryStaple.count()).toBe(MAX_STAPLES);
    expect(revalidatePath).toHaveBeenCalledWith("/groceries");
  });
});

describe("removePantryStaple", () => {
  it("removes only the given staple and refreshes the grocery list", async () => {
    const salt = await prisma.pantryStaple.create({ data: { name: "salt" } });
    await prisma.pantryStaple.create({ data: { name: "oil" } });

    await removePantryStaple(formData({ id: salt.id }));

    expect(await names()).toEqual(["oil"]);
    expect(vi.mocked(revalidatePath).mock.calls).toEqual([["/groceries"]]);
  });

  it("accepts an id padded with whitespace", async () => {
    const salt = await prisma.pantryStaple.create({ data: { name: "salt" } });
    await removePantryStaple(formData({ id: ` ${salt.id} ` }));
    expect(await names()).toEqual([]);
  });

  it("does nothing for an id that is gone already, such as one removed in another tab", async () => {
    await prisma.pantryStaple.create({ data: { name: "salt" } });
    await removePantryStaple(formData({ id: "gone" }));
    expect(await names()).toEqual(["salt"]);
  });

  it("throws without an id and changes nothing", async () => {
    await prisma.pantryStaple.create({ data: { name: "salt" } });
    await expect(removePantryStaple(formData({}))).rejects.toThrow(/`id`/);
    expect(await names()).toEqual(["salt"]);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
