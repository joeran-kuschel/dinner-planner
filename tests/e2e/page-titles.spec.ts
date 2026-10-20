import { type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { afterServerAction, confirmAction, createRecipe, unique } from "@/tests/e2e/support/helpers";

// The tab's title on every page: "<page> - Dinner Planner" (documentation/backend/page-titles.md).

const nav = (page: Page, name: string) => page.getByRole("navigation").getByRole("link", { name, exact: true });

test.describe("page titles", () => {
  test("every page is titled with its own part and the app's name", async ({ page }) => {
    const name = unique("Title soup");
    const id = await createRecipe(page, { name });

    for (const [path, title] of [
      ["/", "Week plan - Dinner Planner"],
      ["/recipes", "Recipes - Dinner Planner"],
      ["/recipes/new", "New recipe - Dinner Planner"],
      [`/recipes/${id}`, `${name} - Dinner Planner`],
      [`/recipes/${id}/edit`, `Edit ${name} - Dinner Planner`],
      ["/groceries", "Grocery list - Dinner Planner"],
    ] as const) {
      await page.goto(path);
      await expect(page, path).toHaveTitle(title);
    }
  });

  test("the week plan has the same title in different weeks", async ({ page }) => {
    for (const week of ["2027-01-04", "2027-01-11"]) {
      await page.goto(`/?week=${week}`);
      await expect(page, week).toHaveTitle("Week plan - Dinner Planner");
    }
  });

  test("a long recipe name is shortened in the title but not on the page", async ({ page }) => {
    const name = `${unique("Long")} ${"very ".repeat(20)}soup`;
    const id = await createRecipe(page, { name });
    await page.goto(`/recipes/${id}`);
    const title = await page.title();
    expect(title.endsWith("… - Dinner Planner")).toBe(true);
    expect(Array.from(title.slice(0, -" - Dinner Planner".length))).toHaveLength(60);
  });

  test("a recipe name with HTML characters is shown as text in the title", async ({ page }) => {
    const name = unique("<b>Fish</b> & chips");
    const id = await createRecipe(page, { name });
    await page.goto(`/recipes/${id}`);
    await expect(page).toHaveTitle(`${name} - Dinner Planner`);
    await expect(page.locator("head b")).toHaveCount(0);
  });

  test("a bad address and a deleted recipe keep the app's name", async ({ page }) => {
    const bad = await page.goto("/no/such/page");
    expect(bad?.status()).toBe(404);
    await expect(page).toHaveTitle("Dinner Planner");

    const id = await createRecipe(page, { name: unique("Short-lived soup") });
    await confirmAction(page, "Delete", "Delete recipe");
    await expect(page).toHaveURL("/recipes");
    for (const path of [`/recipes/${id}`, `/recipes/${id}/edit`]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
      await expect(page, path).toHaveTitle("Dinner Planner");
    }
  });

  test("navigating between pages updates the title without a reload", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => Object.assign(window, { __noReload: true }));

    await nav(page, "Recipes").click();
    await expect(page).toHaveTitle("Recipes - Dinner Planner");
    await nav(page, "Groceries").click();
    await expect(page).toHaveTitle("Grocery list - Dinner Planner");
    await nav(page, "This week").click();
    await expect(page).toHaveTitle("Week plan - Dinner Planner");

    expect(await page.evaluate(() => (window as { __noReload?: boolean }).__noReload)).toBe(true);
  });

  test("switching the language changes the title without a reload", async ({ page }) => {
    const name = unique("Switch soup");
    const id = await createRecipe(page, { name });
    await page.goto(`/recipes/${id}/edit`);
    await expect(page).toHaveTitle(`Edit ${name} - Dinner Planner`);
    await page.evaluate(() => Object.assign(window, { __noReload: true }));

    await afterServerAction(page, () => page.getByRole("button", { name: "Deutsch", exact: true }).click());

    await expect(page).toHaveTitle(`${name} bearbeiten - Abendessen-Planer`);
    expect(await page.evaluate(() => (window as { __noReload?: boolean }).__noReload)).toBe(true);

    await afterServerAction(page, () => page.getByRole("button", { name: "English", exact: true }).click());
    await expect(page).toHaveTitle(`Edit ${name} - Dinner Planner`);
  });

  test("the week plan and the grocery list are titled in German", async ({ page }) => {
    await page.context().addCookies([{ name: "locale", value: "de", url: "http://localhost:3100" }]);
    await page.goto("/");
    await expect(page).toHaveTitle("Wochenplan - Abendessen-Planer");
    await page.goto("/groceries");
    await expect(page).toHaveTitle("Einkaufsliste - Abendessen-Planer");
    await page.goto("/recipes");
    await expect(page).toHaveTitle("Rezepte - Abendessen-Planer");
  });
});
