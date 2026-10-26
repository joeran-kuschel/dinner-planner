import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { daysSinceLastPlanned } from "@/lib/recipe-activity";
import { parseDayKey } from "@/lib/week";

const day = (key: string) => parseDayKey(key)!;
const TODAY = day("2026-10-26");

async function recipe(name: string) {
  return prisma.recipe.create({ data: { name } });
}
const plan = (date: string, recipeId: string | null, customTitle: string | null = null) =>
  prisma.plannedMeal.create({ data: { date: day(date), recipeId, customTitle } });

describe("daysSinceLastPlanned", () => {
  it("is the days since the latest day a recipe was planned for, up to today", async () => {
    const soup = await recipe("Soup");
    await plan("2026-08-04", soup.id);
    await plan("2026-10-05", soup.id);

    expect((await daysSinceLastPlanned(TODAY)).get(soup.id)).toBe(21);
  });

  it("counts today as 0 and ignores days planned ahead", async () => {
    const soup = await recipe("Soup");
    const stew = await recipe("Stew");
    await plan("2026-10-26", soup.id);
    await plan("2026-10-30", stew.id);
    await plan("2026-10-10", stew.id);

    const days = await daysSinceLastPlanned(TODAY);
    expect(days.get(soup.id)).toBe(0);
    expect(days.get(stew.id)).toBe(16);
  });

  it("has nothing for a recipe never planned or only planned ahead", async () => {
    const never = await recipe("Never");
    const ahead = await recipe("Ahead");
    await plan("2026-11-02", ahead.id);

    const days = await daysSinceLastPlanned(TODAY);
    expect(days.has(never.id)).toBe(false);
    expect(days.has(ahead.id)).toBe(false);
  });

  it("ignores a one-off dinner and a leftovers day, which name no recipe", async () => {
    const soup = await recipe("Soup");
    await plan("2026-10-20", soup.id);
    await plan("2026-10-21", null, "Eating out");
    await prisma.plannedMeal.create({ data: { date: day("2026-10-22"), leftoversOf: day("2026-10-20") } });

    const days = await daysSinceLastPlanned(TODAY);
    expect([...days.keys()]).toEqual([soup.id]);
    expect(days.get(soup.id)).toBe(6);
  });

  it("is empty without planned days", async () => {
    expect((await daysSinceLastPlanned(TODAY)).size).toBe(0);
  });
});
