import { type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { confirmAction, createRecipe, expectAccessible, fillIngredients, unique } from "@/tests/e2e/support/helpers";

function ingredientItems(page: Page) {
  return page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name: "Ingredients", exact: true }) })
    .getByRole("listitem");
}

test.describe("recipes", () => {
  test("creates a recipe with ingredients and shows it on its detail page and in the list", async ({
    page,
  }) => {
    const name = unique("Risotto");
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByLabel("Description", { exact: true }).fill("Creamy and slow");
    await page.getByLabel("Serves", { exact: true }).fill("4");
    await page.getByLabel("Minutes", { exact: true }).fill("35");
    await fillIngredients(page, [
      { quantity: "300", unit: "g", name: "Arborio rice" },
      { quantity: "1,5", unit: "l", name: "Stock" }, // decimal comma
      { name: "Parmesan" }, // no amount: "to taste"
    ]);
    await page.getByLabel("Method", { exact: true }).fill("Soften the onion\n\nToast the rice");
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/recipes\/(?!new$)[^/]+$/);
    await expect(page.getByText("Serves 4 · 35 min")).toBeVisible();
    await expect(page.getByText("Creamy and slow")).toBeVisible();
    await expect(ingredientItems(page)).toHaveText([
      /^Arborio rice\s*300 g$/,
      /^Stock\s*1\.5 l$/,
      /^Parmesan\s*to taste$/,
    ]);
    await expect(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Method", exact: true }) })
        .getByRole("listitem"),
    ).toHaveText(["Soften the onion", "Toast the rice"]);

    await page.getByRole("link", { name: "← Recipes" }).click();
    const card = page.getByRole("link").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card).toContainText("Serves 4 · 3 ingredients · 35 min");
  });

  test("edits a recipe: the ingredient set is replaced and the new order is kept", async ({ page }) => {
    const name = unique("Stew");
    const renamed = unique("Hearty stew");
    const id = await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "500", unit: "g", name: "Beef" },
        { quantity: "2", name: "Carrots" },
        { quantity: "1", unit: "tbsp", name: "Tomato paste" },
      ],
    });

    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Edit recipe" })).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
    await expect(page.getByLabel("Name of ingredient 1", { exact: true })).toHaveValue("Beef");

    await page.getByRole("textbox", { name: "Name", exact: true }).fill(renamed);
    await page.getByRole("button", { name: "Remove ingredient 1", exact: true }).click();
    await expect(page.getByLabel("Name of ingredient 1", { exact: true })).toHaveValue("Carrots");
    await fillIngredients(page, [
      { quantity: "3", name: "Carrots" },
      { quantity: "1", unit: "tbsp", name: "Tomato paste" },
      { quantity: "50", unit: "g", name: "Butter" },
    ]);
    await page.getByRole("button", { name: "Save changes" }).click();

    await expect(page.getByRole("heading", { level: 1, name: renamed, exact: true })).toBeVisible();
    await expect(page).toHaveURL(`/recipes/${id}`);
    await expect(ingredientItems(page)).toHaveText([
      /^Carrots\s*3$/,
      /^Tomato paste\s*1 tbsp$/,
      /^Butter\s*50 g$/,
    ]);

    // The edit form reads the stored order back, too.
    await page.getByRole("link", { name: "Edit", exact: true }).click();
    await expect(page.getByLabel(/^Name of ingredient \d+$/)).toHaveCount(3);
    for (const [index, ingredient] of ["Carrots", "Tomato paste", "Butter"].entries()) {
      await expect(page.getByLabel(`Name of ingredient ${index + 1}`, { exact: true })).toHaveValue(
        ingredient,
      );
    }
  });

  test("marks the mandatory name with an asterisk and explains it", async ({ page }) => {
    await page.goto("/recipes/new");
    await expect(page.getByText("* required")).toBeVisible();
    const mark = page.locator("label", { hasText: "Name" }).first().getByTitle("Required");
    await expect(mark).toBeVisible();
    await expect(mark).toHaveText("*");
    await expectAccessible(page);
  });

  test("an empty name is stopped by the browser before anything is saved", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByLabel("Name of ingredient 1", { exact: true }).fill("Flour");
    await page.getByRole("button", { name: "Create recipe" }).click();

    const nameField = page.getByRole("textbox", { name: "Name", exact: true });
    expect(await nameField.evaluate((el: HTMLInputElement) => el.validity.valueMissing)).toBe(true);
    await expect(page).toHaveURL("/recipes/new");
    await expect(page.getByLabel("Name of ingredient 1", { exact: true })).toHaveValue("Flour");
  });

  test("a blank name is rejected by the server: the error is announced and the input kept", async ({
    page,
  }) => {
    await page.goto("/recipes/new");
    // Whitespace passes the browser's `required` check, so this reaches the action.
    await page.getByRole("textbox", { name: "Name", exact: true }).fill("   ");
    await page.getByLabel("Description", { exact: true }).fill("Keep me");
    await page.getByLabel("Serves", { exact: true }).fill("6");
    await fillIngredients(page, [
      { quantity: "200", unit: "g", name: "Flour" },
      { name: "" },
      { quantity: "2", name: "Eggs" },
      { quantity: "1", unit: "pinch", name: "Salt" },
    ]);
    await page.getByLabel("Method", { exact: true }).fill("Mix everything");
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Give the recipe a name.");
    await expect(page).toHaveURL("/recipes/new");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Keep me");
    await expect(page.getByLabel("Serves", { exact: true })).toHaveValue("6");
    await expect(page.getByLabel("Method", { exact: true })).toHaveValue("Mix everything");
    await expect(page.getByLabel(/^Name of ingredient \d+$/)).toHaveCount(4);
    await expect(page.getByLabel("Amount for ingredient 1", { exact: true })).toHaveValue("200");
    await expect(page.getByLabel("Unit for ingredient 1", { exact: true })).toHaveValue("g");
    await expect(page.getByLabel("Name of ingredient 1", { exact: true })).toHaveValue("Flour");
    await expect(page.getByLabel("Name of ingredient 3", { exact: true })).toHaveValue("Eggs");
    await expect(page.getByLabel("Unit for ingredient 4", { exact: true })).toHaveValue("pinch");

    // Fixing the name is enough to save what was kept; the blank row is dropped.
    const name = unique("Pancakes");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByRole("button", { name: "Create recipe" }).click();
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByText("Serves 6", { exact: true })).toBeVisible();
    await expect(ingredientItems(page)).toHaveText([
      /^Flour\s*200 g$/,
      /^Eggs\s*2$/,
      /^Salt\s*1 pinch$/,
    ]);
  });

  test("deletes a recipe", async ({ page }) => {
    const name = unique("Short-lived soup");
    const id = await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Leek" }] });

    await confirmAction(page, "Delete", "Delete recipe");

    await expect(page).toHaveURL("/recipes");
    await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
    await expect(page.getByRole("heading", { name, exact: true })).toHaveCount(0);
    const response = await page.goto(`/recipes/${id}`);
    expect(response?.status()).toBe(404);
  });

  test("keeps a recipe when the deletion is cancelled, with the button or Escape", async ({ page }) => {
    const name = unique("Kept soup");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Leek" }] });

    const asking = page.locator("summary", { hasText: /^Delete$/ });
    const question = page.getByRole("group", { name: `Delete “${name}”? Days that only plan it are cleared too.` });
    await asking.click();
    await expect(question).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(question).toBeHidden();
    await expect(asking).toBeFocused();

    await asking.click();
    await expect(question).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(question).toBeHidden();

    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  });
});
