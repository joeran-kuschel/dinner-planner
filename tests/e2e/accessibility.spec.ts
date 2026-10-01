import { expect, test } from "@/tests/e2e/support/test";
import {
  afterServerAction,
  createRecipe,
  dinnerField,
  expectAccessible,
  planOnce,
  planRecipe,
  tabTo,
  unique,
} from "@/tests/e2e/support/helpers";

// axe on every page in its filled state (the empty states are covered in
// navigation.spec.ts), plus keyboard-only use and focus after saving.

test.describe("accessibility", () => {
  test("the week plan with a recipe, a one-off dinner and today passes axe", async ({ page }) => {
    const name = unique("Chili");
    await createRecipe(page, { name, ingredients: [{ quantity: "400", unit: "g", name: "Beans" }] });

    await page.goto("/?week=2027-06-07");
    await planRecipe(page, "Monday", name);
    await planOnce(page, "Tuesday", unique("Leftovers"));
    await expect(page.getByText(/ of 7 planned$/)).toHaveText(/· 2 of 7 planned$/);
    await expectAccessible(page);

    // The suggestions, open with one highlighted.
    await dinnerField(page, "Wednesday").fill("Chil");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");

    // The current week highlights today.
    await page.goto("/");
    await expect(page.getByText("today", { exact: true })).toBeVisible();
    await expectAccessible(page);
  });

  test("the recipe list, detail, edit form and a rejected form pass axe", async ({ page }) => {
    const name = unique("Shakshuka");
    const id = await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "4", name: "Eggs" },
        { quantity: "400", unit: "g", name: "Tomatoes" },
        { name: "Cumin" },
      ],
    });
    await page.goto(`/recipes/${id}/edit`);
    await page.getByLabel("Method", { exact: true }).fill("Simmer the tomatoes\nCrack in the eggs");
    await page.getByLabel("Source", { exact: true }).fill("https://example.com/shakshuka");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(`/recipes/${id}`);
    await expect(page.getByRole("link", { name: "source" })).toBeVisible();
    await expectAccessible(page);

    await page.goto("/recipes");
    await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    await expectAccessible(page);

    await page.goto(`/recipes/${id}/edit`);
    await expect(page.getByRole("textbox", { name: "Name", exact: true })).toHaveValue(name);
    await expectAccessible(page);

    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(" ");
    await page.getByRole("button", { name: "Create recipe" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Give the recipe a name.");
    // The hovered button is checked on its own below.
    await page.mouse.move(0, 0);
    await expectAccessible(page);
  });

  test("a hovered primary button keeps AA contrast", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("button", { name: "Create recipe" }).hover();
    await expectAccessible(page);
  });

  test("the grocery list with open and hand-added items passes axe", async ({ page }) => {
    const name = unique("Omelette");
    await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "3", name: "Eggs" },
        { quantity: "50", unit: "g", name: "Cheese" },
      ],
    });
    await page.goto("/?week=2027-06-14");
    await planRecipe(page, "Monday", name);

    await page.goto("/groceries?week=2027-06-14");
    await page.getByRole("textbox", { name: "Item", exact: true }).fill("Bin bags");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("button", { name: "Remove Bin bags" })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Tick off Eggs", exact: true })).toBeVisible();

    await expectAccessible(page);
  });

  test("the grocery list with a ticked item passes axe", async ({ page }) => {
    const name = unique("Frittata");
    await createRecipe(page, { name, ingredients: [{ quantity: "6", name: "Eggs" }] });
    await page.goto("/?week=2027-06-14");
    await planRecipe(page, "Tuesday", name);

    await page.goto("/groceries?week=2027-06-14");
    const eggs = page.getByRole("checkbox", { name: "Tick off Eggs", exact: true });
    await eggs.click();
    await expect(eggs).toBeChecked();
    await expect(page.getByRole("heading", { name: "In the basket (1)" })).toBeVisible();
    await page.mouse.move(0, 0);

    await expectAccessible(page);
  });

  test("a recipe can be created with the keyboard alone", async ({ page }) => {
    const name = unique("Keyboard soup");
    await page.goto("/recipes/new");

    await tabTo(page, page.getByRole("textbox", { name: "Name", exact: true }));
    await page.keyboard.type(name);
    await tabTo(page, page.getByLabel("Serves", { exact: true }));
    await page.keyboard.press("ControlOrMeta+A");
    await page.keyboard.type("3");

    await tabTo(page, page.getByLabel("Amount for ingredient 1", { exact: true }));
    await page.keyboard.type("2");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Name of ingredient 1", { exact: true })).toBeFocused();
    await page.keyboard.type("Potatoes");

    // Space removes a row and adds one.
    await tabTo(page, page.getByRole("button", { name: "Remove ingredient 3", exact: true }));
    await page.keyboard.press("Space");
    await expect(page.getByLabel(/^Name of ingredient \d+$/)).toHaveCount(2);
    await tabTo(page, page.getByRole("button", { name: "Add ingredient" }));
    await page.keyboard.press("Space");
    await expect(page.getByLabel(/^Name of ingredient \d+$/)).toHaveCount(3);

    await tabTo(page, page.getByLabel("Name of ingredient 2", { exact: true }));
    await page.keyboard.type("Leek");
    // Enter in a text field submits the form.
    await page.keyboard.press("Enter");

    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByText("Serves 3", { exact: true })).toBeVisible();
    await expect(
      page
        .locator("section")
        .filter({ has: page.getByRole("heading", { name: "Ingredients", exact: true }) })
        .getByRole("listitem"),
    ).toHaveText([/^Potatoes\s*2$/, /^Leek\s*to taste$/]);
  });

  test("grocery items can be added and ticked with the keyboard alone", async ({ page }) => {
    const item = unique("Coffee");
    await page.goto("/groceries?week=2027-06-21");

    await tabTo(page, page.getByRole("textbox", { name: "Item", exact: true }));
    await page.keyboard.type(item);
    await page.keyboard.press("Enter");

    const checkbox = page.getByRole("checkbox", { name: `Tick off ${item}`, exact: true });
    await expect(checkbox).toBeVisible();
    await tabTo(page, checkbox);
    await page.keyboard.press("Space");
    await expect(checkbox).toBeChecked();
    await expect(page.getByRole("heading", { name: "In the basket (1)" })).toBeVisible();
  });

  test("a dinner is planned with the keyboard alone and keeps focus after its auto-save", async ({ page }) => {
    const name = unique("Focus pie");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Pastry" }] });
    await page.goto("/?week=2027-06-28");

    const field = dinnerField(page, "Monday");
    await tabTo(page, field);
    // Key by key, as fast as the browser takes them: a controlled field that
    // updates a render late drops characters here.
    await page.keyboard.type(name);
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
    await page.keyboard.press("ArrowDown");
    await afterServerAction(page, () => page.keyboard.press("Enter"));
    await expect(page.getByText(/ of 7 planned$/)).toHaveText(/· 1 of 7 planned$/);

    await expect(field).toBeFocused();
    await expect(field).toHaveValue(name);
    await expect(page.getByRole("option")).toHaveCount(0);
  });
});
