/**
 * Seeds a handful of recipes and plans the next few dinners, so a fresh clone
 * has something to look at. Safe to re-run: recipes are matched by name.
 *
 * Run with: npm run db:seed
 */
import type { GroceryCategory } from "../generated/prisma/enums";
import { PrismaClient } from "../generated/prisma/client";
import { createPgAdapter } from "../lib/prisma-adapter";
import { addDays, startOfWeek, today } from "../lib/week";

type SeedIngredient = [name: string, quantity: number | null, unit: string | null, category: GroceryCategory];

type SeedRecipe = {
  name: string;
  description: string;
  servings: number;
  prepMinutes: number;
  instructions: string;
  ingredients: SeedIngredient[];
};

const RECIPES: SeedRecipe[] = [
  {
    name: "Spaghetti Aglio e Olio",
    description: "Pantry pasta that comes together in the time the water boils.",
    servings: 2,
    prepMinutes: 20,
    instructions: [
      "Boil the spaghetti in well-salted water until al dente.",
      "Gently fry the sliced garlic and chilli in the olive oil until fragrant, not brown.",
      "Toss the drained pasta through the oil with a splash of pasta water.",
      "Finish off the heat with parsley and parmesan.",
    ].join("\n"),
    ingredients: [
      ["Spaghetti", 200, "g", "PANTRY"],
      ["Garlic cloves", 4, null, "PRODUCE"],
      ["Olive oil", 60, "ml", "PANTRY"],
      ["Dried chilli flakes", null, null, "PANTRY"],
      ["Flat-leaf parsley", 15, "g", "PRODUCE"],
      ["Parmesan", 30, "g", "DAIRY_EGGS"],
    ],
  },
  {
    name: "Red Lentil Dal",
    description: "Creamy, freezer-friendly, and cheap to make in bulk.",
    servings: 4,
    prepMinutes: 35,
    instructions: [
      "Sweat the onion, garlic and ginger until soft.",
      "Stir in the spices and cook for a minute to bloom them.",
      "Add lentils, tomatoes and stock; simmer 25 minutes until collapsed.",
      "Stir in coconut milk and season generously. Serve with rice.",
    ].join("\n"),
    ingredients: [
      ["Red lentils", 300, "g", "PANTRY"],
      ["Onion", 1, null, "PRODUCE"],
      ["Garlic cloves", 3, null, "PRODUCE"],
      ["Fresh ginger", 20, "g", "PRODUCE"],
      ["Ground cumin", 2, "tsp", "PANTRY"],
      ["Ground turmeric", 1, "tsp", "PANTRY"],
      ["Chopped tomatoes", 400, "g", "PANTRY"],
      ["Vegetable stock", 500, "ml", "PANTRY"],
      ["Coconut milk", 200, "ml", "PANTRY"],
      ["Basmati rice", 300, "g", "PANTRY"],
    ],
  },
  {
    name: "Sheet-Pan Chicken and Vegetables",
    description: "One tray, one wash-up. Adapts to whatever root veg is around.",
    servings: 4,
    prepMinutes: 50,
    instructions: [
      "Heat the oven to 200°C fan.",
      "Toss the chopped vegetables with oil, salt and half the herbs.",
      "Nestle in the chicken thighs, skin up, and scatter over the rest of the herbs.",
      "Roast 40-45 minutes until the skin is crisp and the veg is caramelised.",
    ].join("\n"),
    ingredients: [
      ["Chicken thighs", 8, null, "MEAT_FISH"],
      ["Potatoes", 800, "g", "PRODUCE"],
      ["Carrots", 400, "g", "PRODUCE"],
      ["Red onion", 2, null, "PRODUCE"],
      ["Olive oil", 45, "ml", "PANTRY"],
      ["Dried oregano", 2, "tsp", "PANTRY"],
      ["Lemon", 1, null, "PRODUCE"],
    ],
  },
  {
    name: "Shakshuka",
    description: "Eggs poached in spiced tomato. Dinner that pretends to be brunch.",
    servings: 2,
    prepMinutes: 30,
    instructions: [
      "Soften the peppers and onion in olive oil over a low heat.",
      "Add garlic, cumin and paprika, then the tomatoes; simmer until thick.",
      "Make four wells, crack in the eggs, cover and cook until just set.",
      "Scatter with feta and coriander; eat with plenty of bread.",
    ].join("\n"),
    ingredients: [
      ["Eggs", 4, null, "DAIRY_EGGS"],
      ["Red peppers", 2, null, "PRODUCE"],
      ["Onion", 1, null, "PRODUCE"],
      ["Garlic cloves", 2, null, "PRODUCE"],
      ["Chopped tomatoes", 400, "g", "PANTRY"],
      ["Ground cumin", 1, "tsp", "PANTRY"],
      ["Smoked paprika", 1, "tsp", "PANTRY"],
      ["Feta", 100, "g", "DAIRY_EGGS"],
      ["Crusty bread", 1, null, "BAKERY"],
    ],
  },
];

const prisma = new PrismaClient({ adapter: createPgAdapter() });

async function main() {
  const byName = new Map<string, string>();

  for (const recipe of RECIPES) {
    const existing = await prisma.recipe.findFirst({ where: { name: recipe.name } });

    // Replacing the ingredients wholesale keeps a re-run from duplicating lines.
    const data = {
      name: recipe.name,
      description: recipe.description,
      servings: recipe.servings,
      prepMinutes: recipe.prepMinutes,
      instructions: recipe.instructions,
      ingredients: {
        create: recipe.ingredients.map(([name, quantity, unit, category], position) => ({
          name,
          quantity,
          unit,
          category,
          position,
        })),
      },
    };

    const saved = existing
      ? await prisma.recipe.update({
          where: { id: existing.id },
          data: { ...data, ingredients: { deleteMany: {}, ...data.ingredients } },
        })
      : await prisma.recipe.create({ data });

    byName.set(saved.name, saved.id);
    console.log(`${existing ? "updated" : "created"} recipe: ${saved.name}`);
  }

  // Plan the first four dinners of the current week.
  const weekStart = startOfWeek(today());
  const plan: [offset: number, recipeName: string, servings: number][] = [
    [0, "Spaghetti Aglio e Olio", 2],
    [1, "Red Lentil Dal", 4],
    [2, "Shakshuka", 2],
    [3, "Sheet-Pan Chicken and Vegetables", 4],
  ];

  for (const [offset, recipeName, servings] of plan) {
    const date = addDays(weekStart, offset);
    const recipeId = byName.get(recipeName)!;
    await prisma.plannedMeal.upsert({
      where: { date },
      update: { recipeId, servings, customTitle: null },
      create: { date, recipeId, servings },
    });
    console.log(`planned ${date.toISOString().slice(0, 10)}: ${recipeName}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
