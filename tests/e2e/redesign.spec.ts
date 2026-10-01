import { expect, test } from "@/tests/e2e/support/test";
import { createRecipe, dinnerField, expectAccessible, planRecipe, unique } from "@/tests/e2e/support/helpers";

// The redesign (#33): every page passes axe in both colour schemes at phone and desktop width, the
// suggestions are not clipped by the week plan's single card, the grocery list shows its progress
// and a recipe without a photo gets a decorative tile.

const WEEK = "2027-12-06";

for (const colorScheme of ["light", "dark"] as const) {
  for (const [label, viewport] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 800 }],
  ] as const) {
    test.describe(`${colorScheme}, ${label}`, () => {
      test.use({ colorScheme, viewport });

      test("every page passes axe, contrast included", async ({ page }) => {
        const name = unique("Redesign");
        const id = await createRecipe(page, { name, ingredients: [{ quantity: "2", name: "Leeks" }], tags: ["quick"] });
        await page.goto(`/?week=${WEEK}`);
        await planRecipe(page, "Monday", name);

        for (const path of [`/?week=${WEEK}`, `/groceries?week=${WEEK}`, "/recipes", `/recipes/${id}`, `/recipes/${id}/edit`, "/recipes/new", "/recipes/missing"]) {
          await page.goto(path);
          await page.mouse.move(0, 0);
          await expectAccessible(page);
        }
      });

      test("the dinner suggestions are fully visible and on top of the next rows", async ({ page }) => {
        const name = unique("Suggest");
        await createRecipe(page, { name });
        await page.goto(`/?week=${WEEK}`);
        await dinnerField(page, "Monday").fill(name.slice(0, 5));
        const option = page.getByRole("option", { name });
        await expect(option).toBeVisible();

        const box = (await option.boundingBox())!;
        expect(box.y).toBeGreaterThanOrEqual(0);
        // The point in the middle of the option hits the option, so no row, header or tab bar covers it.
        const hit = await page.evaluate(
          ({ x, y }) => document.elementFromPoint(x, y)?.closest("[role=option]")?.textContent ?? null,
          { x: box.x + box.width / 2, y: box.y + box.height / 2 },
        );
        expect(hit).toContain(name);
        await expectAccessible(page);
      });
    });
  }
}

test.describe("grocery progress bar", () => {
  test("is decorative and grows with the ticked lines", async ({ page }) => {
    const name = unique("Bar");
    await createRecipe(page, { name, ingredients: [{ name: "Leeks" }, { name: "Rice" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", name);
    await page.goto(`/groceries?week=${WEEK}`);

    const fill = page.locator("[aria-hidden] > div.bg-herb");
    const ratio = async () =>
      fill.evaluate((el) => el.getBoundingClientRect().width / el.parentElement!.getBoundingClientRect().width);
    expect(await ratio()).toBe(0);

    await page.getByRole("checkbox", { name: "Tick off Leeks", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: "1 of 2 ticked off" })).toBeVisible();
    await expect.poll(ratio).toBeCloseTo(0.5, 1);

    await page.getByRole("checkbox", { name: "Tick off Rice", exact: true }).click();
    await expect.poll(ratio).toBeCloseTo(1, 1);
    await expect(page.getByRole("status")).toContainText("Everything ticked off.");
  });
});

test.describe("recipe list tiles", () => {
  test("a recipe without a photo gets a decorative tile that a screen reader skips", async ({ page }) => {
    const name = unique("NoPhoto");
    await createRecipe(page, { name });
    await page.goto("/recipes");
    const tile = page.locator("a", { hasText: name }).locator('div[aria-hidden="true"] svg').first();
    await expect(tile).toBeVisible();
    await expect(page.getByRole("img")).toHaveCount(0);
  });
});
