import { expect, test } from "@/tests/e2e/support/test";
import { createRecipe, planRecipe, unique } from "@/tests/e2e/support/helpers";

// The database is emptied before every test (tests/e2e/support/test.ts). These tests run one after
// another and each looks at what the other would have left behind: the second one fails when the
// reset does not happen. That only shows when the file runs in order and whole (with `--grep` the
// first test is skipped and the database is empty anyway).

const WEEK = "2027-11-01";

test.describe("every test starts with an empty database", () => {
  test("first: creates a recipe and plans it", async ({ page }) => {
    const name = unique("Left behind");
    await createRecipe(page, { name, ingredients: [{ name: "Leftover rice" }], tags: ["leftover"] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", name);

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(1);
  });

  test("second: sees no recipes, no tags and an empty week", async ({ page }) => {
    await page.goto("/recipes");
    await expect(page.getByText("Nothing here yet.", { exact: false })).toBeVisible();
    await expect(page.getByRole("search")).toHaveCount(0);

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.getByText("Nothing to buy yet.", { exact: false })).toBeVisible();
  });

  test("third: the same week can be used again with the same counts", async ({ page }) => {
    const name = unique("Again");
    await createRecipe(page, { name, ingredients: [{ name: "Fresh rice" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", name);

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(1);
    await page.getByRole("checkbox", { name: "Tick off Fresh rice" }).click();
    await expect(page.getByRole("heading", { name: "In the basket (1)" })).toBeVisible();
  });
});
