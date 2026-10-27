import path from "node:path";
import type { Locator, Page } from "@playwright/test";
import sharp from "sharp";
import { expect, test } from "@/tests/e2e/support/test";
import { afterServerAction, createRecipe, dayCard, openAddForm, planRecipe, type IngredientRow } from "@/tests/e2e/support/helpers";

// The screenshots in documentation/images, made from sample data this script creates itself (nothing of the real data is in
// a picture). Run `npm run docs:screenshots` after a change to a screen that has one; documentation/backend/doc-screenshots.md.

const OUT = path.join(process.cwd(), "documentation/images");
const DAY = 24 * 60 * 60 * 1000;

/** A date `weeks` weeks before today, as the week address takes it (the page snaps it to that week's Monday). */
const weeksAgo = (weeks: number) => new Date(Date.now() - weeks * 7 * DAY).toISOString().slice(0, 10);

/** Save what `target` shows as `<name>.webp`: small files, since they live in the repository. */
async function shoot(target: Page | Locator, name: string) {
  const png = await target.screenshot({ animations: "disabled" });
  await sharp(png).webp({ quality: 85 }).toFile(path.join(OUT, `${name}.webp`));
}

/**
 * The whole page: the window is made as tall as the page for the shot, not a full-page screenshot, which would draw the
 * sticky navigation again in the middle of the page.
 */
async function shootPage(page: Page, name: string) {
  const { width, height } = page.viewportSize()!;
  await page.setViewportSize({ width, height: await page.evaluate(() => document.documentElement.scrollHeight) });
  await shoot(page, name);
  await page.setViewportSize({ width, height });
}

type Sample = { name: string; servings: number; tags: string[]; ingredients: IngredientRow[] };

const RECIPES: Sample[] = [
  { name: "Chickpea curry", servings: 4, tags: ["vegan", "quick"], ingredients: [
    { quantity: "400", unit: "g", name: "Chickpeas", category: "Pantry" },
    { quantity: "400", unit: "ml", name: "Coconut milk", category: "Pantry" },
    { quantity: "500", unit: "g", name: "Passata", category: "Pantry" },
    { quantity: "2", name: "Onions", category: "Fruit and vegetables" },
  ] },
  { name: "Tomato soup", servings: 4, tags: ["vegetarian", "soup"], ingredients: [
    { quantity: "400", unit: "g", name: "Chopped tomatoes", category: "Pantry" },
    { quantity: "1", name: "Onion", category: "Fruit and vegetables" },
    { quantity: "500", unit: "ml", name: "Vegetable stock", category: "Pantry" },
  ] },
  { name: "Lemon chicken traybake", servings: 4, tags: ["chicken"], ingredients: [
    { quantity: "800", unit: "g", name: "Chicken thighs", category: "Meat and fish" },
    { quantity: "2", name: "Lemons", category: "Fruit and vegetables" },
    { quantity: "600", unit: "g", name: "Potatoes", category: "Fruit and vegetables" },
  ] },
  { name: "Mushroom risotto", servings: 3, tags: ["vegetarian"], ingredients: [
    { quantity: "300", unit: "g", name: "Arborio rice", category: "Pantry" },
    { quantity: "250", unit: "g", name: "Mushrooms", category: "Fruit and vegetables" },
    { quantity: "50", unit: "g", name: "Parmesan", category: "Dairy and eggs" },
  ] },
  { name: "Spaghetti aglio e olio", servings: 2, tags: ["vegetarian", "quick", "pasta"], ingredients: [
    { quantity: "200", unit: "g", name: "Spaghetti", category: "Pantry" },
    { quantity: "4", name: "Garlic cloves", category: "Fruit and vegetables" },
    { quantity: "60", unit: "ml", name: "Olive oil", category: "Pantry" },
  ] },
  { name: "Fish tacos", servings: 4, tags: ["fish", "quick"], ingredients: [
    { quantity: "500", unit: "g", name: "White fish", category: "Meat and fish" },
    { quantity: "8", name: "Small tortillas", category: "Bakery" },
    { quantity: "1", name: "Lime", category: "Fruit and vegetables" },
  ] },
  { name: "Roast lamb", servings: 6, tags: ["sunday"], ingredients: [
    { quantity: "1.5", unit: "kg", name: "Leg of lamb", category: "Meat and fish" },
    { quantity: "1", name: "Rosemary", category: "Fruit and vegetables" },
  ] },
  { name: "Pancakes", servings: 4, tags: ["vegetarian", "sweet"], ingredients: [
    { quantity: "250", unit: "g", name: "Flour", category: "Pantry" },
    { quantity: "3", name: "Eggs", category: "Dairy and eggs" },
    { quantity: "500", unit: "ml", name: "Milk", category: "Dairy and eggs" },
  ] },
];

test("takes every screenshot of the documentation", async ({ page }) => {
  test.setTimeout(240_000);
  const ids: Record<string, string> = {};

  // Sample recipes, planned and favorite so every screen has something to show.
  for (const recipe of RECIPES) ids[recipe.name] = await createRecipe(page, recipe);
  await page.goto(`/?week=${weeksAgo(5)}`);
  await planRecipe(page, "Monday", "Spaghetti aglio e olio");
  await page.goto(`/?week=${weeksAgo(12)}`);
  await planRecipe(page, "Monday", "Roast lamb");
  for (const name of ["Mushroom risotto", "Spaghetti aglio e olio"]) {
    await page.goto(`/recipes/${ids[name]}`);
    await afterServerAction(page, () => page.getByRole("button", { name: "Favorite", exact: true }).click());
  }

  // This week: the days before Friday, so there are free days left whatever day it is today.
  await page.goto("/");
  await planRecipe(page, "Monday", "Chickpea curry");
  await planRecipe(page, "Tuesday", "Tomato soup");
  await planRecipe(page, "Thursday", "Lemon chicken traybake");

  // The leftovers dialog, then a day that is leftovers.
  await dayCard(page, "Friday").getByRole("button", { name: "Leftovers on Friday" }).click();
  const leftovers = page.getByRole("dialog", { name: "Leftovers on Friday" });
  await leftovers.getByRole("radio", { name: /Chickpea curry/ }).check();
  await shoot(page, "leftovers-dialog");
  await page.keyboard.press("Escape");
  await dayCard(page, "Wednesday").getByRole("button", { name: "Leftovers on Wednesday" }).click();
  const wednesday = page.getByRole("dialog", { name: "Leftovers on Wednesday" });
  await wednesday.getByRole("radio", { name: /Chickpea curry/ }).check();
  await wednesday.getByRole("button", { name: "Save" }).click();
  await expect(wednesday).toBeHidden();

  const cookAgain = page.getByRole("region", { name: "Cook again" });
  await expect(cookAgain).toBeVisible();
  await shootPage(page, "week-plan");
  await shoot(cookAgain, "cook-again");

  // The same page on a phone: the column goes below the days.
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(cookAgain).toBeVisible();
  await shootPage(page, "week-plan-phone");
  await page.setViewportSize({ width: 1280, height: 800 });

  await page.goto("/recipes");
  await expect(page.getByRole("heading", { level: 2, name: "Pancakes" })).toBeVisible();
  await shootPage(page, "recipes");

  await page.goto(`/recipes/${ids["Chickpea curry"]}/edit`);
  await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue("Chickpea curry");
  await shootPage(page, "recipe-form");

  // The grocery list, with a hand-added item and two lines ticked off.
  await page.goto("/groceries");
  await openAddForm(page);
  await page.getByRole("textbox", { name: "Item", exact: true }).fill("Washing-up liquid");
  await afterServerAction(page, () => page.getByRole("button", { name: "Add", exact: true }).click());
  for (const line of ["Coconut milk", "Onion"]) await page.getByRole("checkbox", { name: `Tick off ${line}`, exact: true }).check();
  await shootPage(page, "groceries");

  // The merge dialog, with the other tomato line chosen.
  await page.getByRole("button", { name: "Merge Passata with another line", exact: true }).click();
  const merge = page.getByRole("dialog", { name: "Merge Passata" });
  await merge.getByRole("radio", { name: /Chopped tomatoes/ }).check();
  await shoot(page, "grocery-merge-dialog");
  await page.keyboard.press("Escape");
});
