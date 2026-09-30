import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma } from "@/lib/db";
import { addDays, dayKey, startOfWeek, today } from "@/lib/week";

// Runs prisma/seed.ts the way `npm run db:seed` and the k8s seed Job do (tsx),
// against this test file's own schema: the child inherits DATABASE_URL, which
// tests/support/setup-server.ts has pointed at that schema.
function seed() {
  const result = spawnSync(path.join(process.cwd(), "node_modules", ".bin", "tsx"), ["prisma/seed.ts"], {
    encoding: "utf8",
    env: process.env,
  });
  expect(result.stderr).toBe("");
  expect(result.status).toBe(0);
  return result.stdout;
}

const SEEDED = ["Red Lentil Dal", "Shakshuka", "Sheet-Pan Chicken and Vegetables", "Spaghetti Aglio e Olio"];

/** The planned days as "YYYY-MM-DD recipe name × servings". */
async function plan(): Promise<string[]> {
  const meals = await prisma.plannedMeal.findMany({ include: { recipe: true }, orderBy: { date: "asc" } });
  return meals.map((meal) => `${dayKey(meal.date)} ${meal.recipe?.name ?? meal.customTitle} × ${meal.servings}`);
}

describe("prisma/seed.ts", () => {
  it("files the sample ingredients under shop sections", async () => {
    seed();

    const ingredients = await prisma.ingredient.findMany({ where: { name: { in: ["Parmesan", "Chicken thighs", "Crusty bread", "Spaghetti"] } } });
    expect(Object.fromEntries(ingredients.map((i) => [i.name, i.category]))).toEqual({
      Parmesan: "DAIRY_EGGS",
      "Chicken thighs": "MEAT_FISH",
      "Crusty bread": "BAKERY",
      Spaghetti: "PANTRY",
    });
  });

  it("creates the sample recipes with their ingredients in order", async () => {
    const output = seed();

    const recipes = await prisma.recipe.findMany({
      include: { ingredients: { orderBy: { position: "asc" } } },
      orderBy: { name: "asc" },
    });
    expect(recipes.map((recipe) => recipe.name)).toEqual(SEEDED);
    const aglio = recipes.find((recipe) => recipe.name === "Spaghetti Aglio e Olio")!;
    expect(aglio.servings).toBe(2);
    expect(aglio.ingredients.map(({ name, quantity, unit, position }) => [name, quantity, unit, position])).toEqual([
      ["Spaghetti", 200, "g", 0],
      ["Garlic cloves", 4, null, 1],
      ["Olive oil", 60, "ml", 2],
      ["Dried chilli flakes", null, null, 3],
      ["Flat-leaf parsley", 15, "g", 4],
      ["Parmesan", 30, "g", 5],
    ]);
    expect(output).toContain("created recipe: Shakshuka");
  });

  it("plans Monday to Thursday of the current week", async () => {
    const weekBefore = startOfWeek(today());
    seed();
    const weekAfter = startOfWeek(today());

    // Tolerates a run that crosses midnight into a new week.
    const expected = (monday: Date) => [
      `${dayKey(monday)} Spaghetti Aglio e Olio × 2`,
      `${dayKey(addDays(monday, 1))} Red Lentil Dal × 4`,
      `${dayKey(addDays(monday, 2))} Shakshuka × 2`,
      `${dayKey(addDays(monday, 3))} Sheet-Pan Chicken and Vegetables × 4`,
    ];
    expect([expected(weekBefore), expected(weekAfter)]).toContainEqual(await plan());
  });

  it("is safe to re-run: no duplicate recipes, ingredients or days", async () => {
    seed();
    const output = seed();

    await expect(prisma.recipe.count()).resolves.toBe(4);
    await expect(prisma.ingredient.count()).resolves.toBe(6 + 10 + 7 + 9);
    await expect(prisma.plannedMeal.count()).resolves.toBe(4);
    expect(output).toContain("updated recipe: Red Lentil Dal");
    expect(output).not.toContain("created recipe");
  });

  it("restores an edited sample recipe and leaves the user's own recipes alone", async () => {
    seed();
    const dal = await prisma.recipe.findFirstOrThrow({ where: { name: "Red Lentil Dal" } });
    await prisma.recipe.update({
      where: { id: dal.id },
      data: { servings: 9, ingredients: { deleteMany: {}, create: [{ name: "Only this", position: 0 }] } },
    });
    await prisma.recipe.create({ data: { name: "My own recipe" } });

    seed();

    const restored = await prisma.recipe.findUniqueOrThrow({
      where: { id: dal.id },
      include: { ingredients: { orderBy: { position: "asc" } } },
    });
    expect(restored.servings).toBe(4);
    expect(restored.ingredients.map((ingredient) => ingredient.name)).toContain("Red lentils");
    expect(restored.ingredients.map((ingredient) => ingredient.name)).not.toContain("Only this");
    await expect(prisma.recipe.count({ where: { name: "My own recipe" } })).resolves.toBe(1);
  });

  it("leaves Friday to Sunday of the current week untouched", async () => {
    const friday = addDays(startOfWeek(today()), 4);
    await prisma.plannedMeal.create({ data: { date: friday, customTitle: "Pizza night", servings: 3 } });

    seed();

    await expect(prisma.plannedMeal.findUnique({ where: { date: friday } })).resolves.toMatchObject({
      customTitle: "Pizza night",
      recipeId: null,
      servings: 3,
    });
  });
});
