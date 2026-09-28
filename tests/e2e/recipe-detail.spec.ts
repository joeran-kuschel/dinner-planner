import { expect, test } from "@playwright/test";
import { createRecipe, planRecipe, unique } from "@/tests/e2e/support/helpers";

// The recipe detail and edit pages beyond creating and editing (recipes.spec.ts):
// unknown ids, the upcoming-plan line, the list's plan count and empty sections.
// Weeks used here are not used by any other spec.
test.describe("recipe detail", () => {
  test("an unknown recipe id answers 404 on the detail and the edit page", async ({ page }) => {
    for (const url of ["/recipes/does-not-exist", "/recipes/does-not-exist/edit"]) {
      const response = await page.goto(url);
      expect(response?.status(), url).toBe(404);
    }
  });

  test("lists the upcoming days a recipe is planned for, but not past ones", async ({ page }) => {
    const name = unique("Goulash");
    const id = await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "500", unit: "g", name: "Beef" },
        { quantity: "2", name: "Onions" },
      ],
    });

    await page.goto("/?week=2027-05-03");
    await planRecipe(page, "Thursday", name);
    await planRecipe(page, "Tuesday", name);
    await page.goto("/?week=2024-05-06");
    await planRecipe(page, "Monday", name);

    await page.goto(`/recipes/${id}`);
    // In date order, and the 2024 day is history.
    await expect(page.getByText(/^Planned for /)).toHaveText("Planned for Tue 4 May, Thu 6 May.");

    await page.goto("/recipes");
    const card = page.getByRole("link").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card).toContainText("Serves 2 · 2 ingredients · planned 3×");
  });

  test("a recipe without ingredients or method says so, and planned nowhere shows no plan line", async ({
    page,
  }) => {
    const id = await createRecipe(page, { name: unique("Bare recipe") });

    await page.goto(`/recipes/${id}`);
    await expect(page.getByText("None listed.")).toBeVisible();
    await expect(page.getByText("No steps written down yet.")).toBeVisible();
    await expect(page.getByText(/^Planned for /)).toHaveCount(0);
    await expect(page.getByRole("link", { name: "source" })).toHaveCount(0);
  });

  test("a recipe card with one ingredient uses the singular", async ({ page }) => {
    const name = unique("Toast");
    await createRecipe(page, { name, ingredients: [{ quantity: "2", name: "Bread slices" }] });

    await page.goto("/recipes");
    const card = page.getByRole("link").filter({ has: page.getByRole("heading", { name, exact: true }) });
    await expect(card).toContainText("Serves 2 · 1 ingredient", { timeout: 2000 });
    await expect(card).not.toContainText("1 ingredients", { timeout: 2000 });
  });
});
