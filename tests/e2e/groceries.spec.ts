import { expect, test } from "@playwright/test";
import {
  createRecipe,
  fillIngredients,
  groceryRow,
  planOnce,
  planRecipe,
  setServings,
  unique,
} from "@/tests/e2e/support/helpers";

// Each test works in a week of its own, so the list holds only its own lines.

test.describe("groceries", () => {
  test("consolidates the week's recipes into one list scaled to the planned servings", async ({
    page,
  }) => {
    const risotto = unique("Risotto");
    const pilaf = unique("Pilaf");
    await createRecipe(page, {
      name: risotto,
      servings: 2,
      ingredients: [
        { quantity: "400", unit: "g", name: "Rice" },
        { quantity: "1", name: "Onion" },
        { name: "Salt" },
      ],
    });
    await createRecipe(page, {
      name: pilaf,
      servings: 4,
      ingredients: [
        { quantity: "200", unit: "g", name: "Rice" },
        { quantity: "1", name: "Salt" },
        { quantity: "2", unit: "cloves", name: "Garlic" },
      ],
    });

    await page.goto("/?week=2027-04-05");
    await planRecipe(page, "Monday", risotto);
    await setServings(page, "Monday", 3); // x1.5
    await planRecipe(page, "Tuesday", pilaf); // 2 of 4: x0.5
    // A one-off dinner adds nothing to the list.
    await planOnce(page, "Wednesday", unique("Eating out"));

    await page.getByRole("link", { name: "Grocery list for this week" }).click();
    await expect(page).toHaveURL("/groceries?week=2027-04-05");
    await expect(page.getByText(/ · from \d+ recipes?$/)).toHaveText(
      "5 Apr – 11 Apr 2027 · from 2 recipes",
    );

    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(4);
    // 600 g + 100 g, merged by name and unit.
    await expect(groceryRow(page, "Rice")).toContainText("700 g");
    await expect(groceryRow(page, "Rice")).toContainText(risotto);
    await expect(groceryRow(page, "Rice")).toContainText(pilaf);
    await expect(groceryRow(page, "Onion")).toContainText(/1\.5$/);
    await expect(groceryRow(page, "Garlic")).toContainText("1 cloves");
    // One unquantified source makes the merged line "to taste".
    await expect(groceryRow(page, "Salt")).toContainText("to taste");
  });

  test("ticking an item persists across a reload", async ({ page }) => {
    const name = unique("Carrot salad");
    await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "3", name: "Carrots" },
        { quantity: "1", name: "Lemon" },
      ],
    });
    await page.goto("/?week=2027-04-12");
    await planRecipe(page, "Monday", name);

    await page.goto("/groceries?week=2027-04-12");
    const carrots = page.getByRole("checkbox", { name: "Tick off Carrots", exact: true });
    await expect(carrots).not.toBeChecked();
    // A controlled checkbox: it only shows as ticked once the server has saved it.
    await carrots.click();
    await expect(carrots).toBeChecked();
    await expect(page.getByRole("heading", { name: "In the basket (1)" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Tick off Carrots", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Tick off Lemon", exact: true })).not.toBeChecked();

    await page.getByRole("button", { name: "Untick everything" }).click();
    await expect(page.getByRole("checkbox", { name: "Tick off Carrots", exact: true })).not.toBeChecked();
    await expect(page.getByRole("heading", { name: /^In the basket/ })).toHaveCount(0);
  });

  test("adds a manual item, keeps it after reload and removes it again", async ({ page }) => {
    const item = unique("Milk");
    await page.goto("/groceries?week=2027-04-19");
    await expect(page.getByText("Nothing to buy yet.", { exact: false })).toBeVisible();

    await page.getByLabel("Amount", { exact: true }).fill("1,5");
    await page.getByLabel("Unit", { exact: true }).fill("l");
    await page.getByLabel("Item", { exact: true }).fill(item);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = groceryRow(page, item);
    await expect(row).toContainText("added by hand");
    await expect(row).toContainText("1.5 l");
    await expect(page.getByLabel("Item", { exact: true })).toHaveValue("");

    await page.reload();
    await expect(groceryRow(page, item)).toContainText("1.5 l");

    await page.getByRole("button", { name: `Remove ${item}`, exact: true }).click();
    await expect(groceryRow(page, item)).toHaveCount(0);
  });

  test("editing a planned recipe updates the list straight away", async ({ page }) => {
    const name = unique("Pasta");
    const id = await createRecipe(page, {
      name,
      servings: 2,
      ingredients: [{ quantity: "250", unit: "g", name: "Spaghetti" }],
    });
    await page.goto("/?week=2027-04-26");
    await planRecipe(page, "Friday", name);

    await page.goto("/groceries?week=2027-04-26");
    await expect(groceryRow(page, "Spaghetti")).toContainText("250 g");
    const spaghetti = page.getByRole("checkbox", { name: "Tick off Spaghetti", exact: true });
    await spaghetti.click();
    await expect(spaghetti).toBeChecked();

    await page.goto(`/recipes/${id}/edit`);
    await fillIngredients(page, [
      { quantity: "500", unit: "g", name: "Spaghetti" },
      { name: "Basil" },
    ]);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(`/recipes/${id}`);

    await page.goto("/groceries?week=2027-04-26");
    await expect(groceryRow(page, "Spaghetti")).toContainText("500 g");
    // Same name and unit, so the tick carries over.
    await expect(page.getByRole("checkbox", { name: "Tick off Spaghetti", exact: true })).toBeChecked();
    await expect(groceryRow(page, "Basil")).toContainText("to taste");
  });

  test("moves between weeks with the week navigation, staying on the grocery list", async ({ page }) => {
    // Any day of the week opens the week from its Monday.
    await page.goto("/groceries?week=2027-05-12");
    await expect(page.getByText("10 May – 16 May 2027")).toBeVisible();

    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL("/groceries?week=2027-05-03");
    await expect(page.getByText("3 May – 9 May 2027")).toBeVisible();

    await page.getByRole("link", { name: "Next week" }).click();
    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL("/groceries?week=2027-05-17");
    await expect(page.getByText("17 May – 23 May 2027")).toBeVisible();

    // The menu's "This week" opens the plan, so this one is named differently.
    await page.getByRole("link", { name: "This week's list" }).click();
    await expect(page).toHaveURL("/groceries");
    await expect(page.getByRole("heading", { level: 1, name: "Grocery list" })).toBeVisible();
  });

  test("still opens the plan of the week being shopped for", async ({ page }) => {
    await page.goto("/groceries?week=2027-05-19");
    await page.getByRole("link", { name: "Edit the plan" }).click();
    await expect(page).toHaveURL("/?week=2027-05-17");
  });
});
