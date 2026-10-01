import { expect, test } from "@/tests/e2e/support/test";
import { createRecipe, expectAccessible, planRecipe, unique } from "@/tests/e2e/support/helpers";

// The database is empty at the start of every test, so each one creates what it looks at.

const WEEK = "2027-12-13";
const OTHER_WEEK = "2027-12-20";

/** A recipe with salt, oil and rice, planned on Monday of `week`. */
async function planSoup(page: import("@playwright/test").Page, week = WEEK) {
  const name = unique("Soup");
  await createRecipe(page, {
    name,
    ingredients: [
      { quantity: "200", unit: "g", name: "Rice" },
      { quantity: "1", unit: "tsp", name: "Salt" },
      { name: "Olive oil" },
    ],
  });
  await page.goto(`/?week=${week}`);
  await planRecipe(page, "Monday", name);
}

// The chip is its name and the button that removes it.
const staple = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("button", { name: `Remove ${name} from the pantry staples`, exact: true });
const tick = (page: import("@playwright/test").Page, name: string) =>
  page.getByRole("checkbox", { name: `Tick off ${name}`, exact: true });

/** Open the fold-out; its summary also says how many lines it hides, so it is found by its start. */
const openPantry = (page: import("@playwright/test").Page) =>
  page.locator("summary", { hasText: /^Pantry staples/ }).click();

async function addStaple(page: import("@playwright/test").Page, name: string) {
  const field = page.getByRole("combobox", { name: "Add a staple" });
  await field.fill(name);
  await page.getByRole("button", { name: "Add", exact: true }).last().click();
  await expect(field).toHaveValue("");
}

test.describe("pantry staples", () => {
  test("a staple's line leaves the list, whatever its unit, and comes back when the staple goes", async ({ page }) => {
    await planSoup(page);
    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(3);

    await openPantry(page);
    await expect(page.getByText("No staples yet.")).toBeVisible();
    await addStaple(page, " SALT ");

    await expect(staple(page, "salt")).toBeVisible();
    await expect(tick(page, "Salt")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(2);
    await expect(page.getByText("1 item hidden")).toBeVisible();

    // The section stayed open after the action, and a reload keeps the staple.
    await page.reload();
    await expect(page.getByText("1 item hidden")).toBeVisible();
    await expect(tick(page, "Salt")).toHaveCount(0);

    await openPantry(page);
    await page.getByRole("button", { name: "Remove salt from the pantry staples" }).click();
    await expect(tick(page, "Salt")).toBeVisible();
    await expect(page.getByText("No staples yet.")).toBeVisible();
  });

  test("matches the whole name only", async ({ page }) => {
    await planSoup(page);
    await page.goto(`/groceries?week=${WEEK}`);
    await openPantry(page);
    await addStaple(page, "oil");
    await expect(tick(page, "Olive oil")).toBeVisible();
    await addStaple(page, "olive oil");
    await expect(tick(page, "Olive oil")).toHaveCount(0);
  });

  test("shows the hidden lines on request, marked, and they can be ticked", async ({ page }) => {
    await planSoup(page);
    await page.goto(`/groceries?week=${WEEK}`);
    await openPantry(page);
    await addStaple(page, "salt");
    await addStaple(page, "olive oil");
    await expect(page.getByText("2 items hidden")).toBeVisible();

    await page.getByRole("link", { name: "Show the 2 hidden items" }).click();
    await expect(page).toHaveURL(new RegExp(`/groceries\\?week=${WEEK}&pantry=show$`));
    await expect(tick(page, "Salt")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(3);
    // The marker ends the second line of the row, after the recipes the line comes from.
    await expect(page.getByText(/ · in the pantry$/)).toHaveCount(2);
    // The section is open while they are shown, with the way back.
    await expect(page.getByRole("link", { name: "Hide the pantry items again" })).toBeVisible();

    await tick(page, "Salt").click();
    await expect(tick(page, "Salt")).toBeChecked();

    await page.getByRole("link", { name: "Hide the pantry items again" }).click();
    await expect(page).toHaveURL(new RegExp(`/groceries\\?week=${WEEK}$`));
    await expect(tick(page, "Salt")).toHaveCount(0);
  });

  test("applies to every week", async ({ page }) => {
    await planSoup(page, WEEK);
    await planSoup(page, OTHER_WEEK);
    await page.goto(`/groceries?week=${WEEK}`);
    await openPantry(page);
    await addStaple(page, "salt");

    await page.goto(`/groceries?week=${OTHER_WEEK}`);
    await expect(tick(page, "Rice")).toBeVisible();
    await expect(tick(page, "Salt")).toHaveCount(0);
    await expect(page.getByText("1 item hidden")).toBeVisible();
  });

  test("never hides a line added by hand", async ({ page }) => {
    await page.goto(`/groceries?week=${WEEK}`);
    await page.getByRole("textbox", { name: "Item", exact: true }).fill("Salt");
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await expect(tick(page, "Salt")).toBeVisible();

    await openPantry(page);
    await addStaple(page, "salt");
    await expect(tick(page, "Salt")).toBeVisible();
    await expect(page.getByText("hidden")).toHaveCount(0);
  });

  test("never hides a hand-added line that shares its name and unit with a line from the plan", async ({ page }) => {
    await planSoup(page);
    await page.goto(`/groceries?week=${WEEK}`);
    await page.getByLabel("Unit", { exact: true }).fill("tsp");
    await page.getByRole("textbox", { name: "Item", exact: true }).fill("Salt");
    await page.getByRole("button", { name: "Add", exact: true }).first().click();
    await expect(tick(page, "Salt")).toBeVisible();

    await openPantry(page);
    await addStaple(page, "salt");
    await expect(tick(page, "Salt")).toBeVisible();
    await expect(page.getByText("hidden")).toHaveCount(0);
  });

  test("keeps the focus in the section after removing a staple", async ({ page }) => {
    await page.goto(`/groceries?week=${WEEK}`);
    await openPantry(page);
    await addStaple(page, "salt");
    await addStaple(page, "pepper");
    await page.getByRole("button", { name: "Remove pepper from the pantry staples" }).click();
    await expect(page.getByRole("button", { name: "Remove salt from the pantry staples" })).toBeFocused();
    await page.getByRole("button", { name: "Remove salt from the pantry staples" }).click();
    await expect(page.getByRole("combobox", { name: "Add a staple" })).toBeFocused();
  });

  test("says so when the pantry covers everything the dinners need", async ({ page }) => {
    const name = unique("Plain");
    await createRecipe(page, { name, ingredients: [{ name: "Salt" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", name);

    await page.goto(`/groceries?week=${WEEK}`);
    await openPantry(page);
    await addStaple(page, "salt");
    await expect(page.getByText("Everything this week's dinners need is in your pantry.")).toBeVisible();
    await expect(page.getByText("Nothing to buy yet.", { exact: false })).toHaveCount(0);
  });

  test("offers the ingredients of the recipes while typing a staple", async ({ page }) => {
    await planSoup(page);
    await page.goto(`/groceries?week=${WEEK}`);
    await openPantry(page);
    const options = await page.locator("#staple-suggestions option").evaluateAll((all) =>
      all.map((option) => (option as HTMLOptionElement).value),
    );
    expect(options).toEqual(["olive oil", "rice", "salt"]);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`passes the accessibility check in ${colorScheme} mode, closed, open and with hidden lines shown`, async ({
      browser,
    }) => {
      const context = await browser.newContext({ colorScheme, locale: "en-GB" });
      const page = await context.newPage();
      await planSoup(page);
      await page.goto(`/groceries?week=${WEEK}`);
      await openPantry(page);
      await addStaple(page, "salt");
      await expectAccessible(page);
      await page.getByRole("link", { name: "Show the 1 hidden item" }).click();
      await expect(tick(page, "Salt")).toBeVisible();
      await expectAccessible(page);
      await context.close();
    });
  }
});
