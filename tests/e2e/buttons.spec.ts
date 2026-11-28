import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import {
  contrastRatio,
  createRecipe,
  dinnerField,
  expectAccessible,
  focusByKeyboard,
  openAddForm,
  parseColor,
  planRecipe,
  surfaceColor,
  unique,
} from "@/tests/e2e/support/helpers";

// Destructive actions look different from the rest, and every button can be hit with a fingertip.
// The database is empty at the start of every test, so each one creates what it looks at.

const WEEK = "2027-12-06";

/** A recipe planned for Monday of WEEK, with one grocery extra: every control the tests look at. */
async function setUp(page: Page) {
  const name = unique("Buttons");
  const id = await createRecipe(page, { name, ingredients: [{ name: "Rice" }], tags: ["quick"] });
  await page.goto(`/?week=${WEEK}`);
  await planRecipe(page, "Monday", name);
  await page.goto(`/groceries?week=${WEEK}`);
  await openAddForm(page);
  await page.getByRole("textbox", { name: "Item", exact: true }).fill(unique("Soap"));
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("button", { name: /^Remove / })).toBeVisible();
  return { id, name };
}

async function box(locator: Locator) {
  await expect(locator).toBeVisible();
  const size = await locator.boundingBox();
  if (!size) throw new Error("no box");
  return size;
}

const textColor = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).color);

for (const colorScheme of ["light", "dark"] as const) {
  test.describe(`in ${colorScheme} mode`, () => {
    test.use({ colorScheme });

    test("the pages with destructive buttons pass the accessibility check, the open question included", async ({
      page,
    }) => {
      const { id } = await setUp(page);
      await expectAccessible(page); // groceries, with a remove button

      await page.goto(`/?week=${WEEK}`);
      await page.locator("summary", { hasText: /^Clear the whole week$/ }).click();
      await expect(page.getByRole("button", { name: "Clear week", exact: true })).toBeVisible();
      await expectAccessible(page);

      await page.goto(`/recipes/${id}`);
      await page.locator("summary", { hasText: /^Delete$/ }).click();
      await expect(page.getByRole("button", { name: "Delete recipe", exact: true })).toBeVisible();
      await expectAccessible(page);

      await page.goto(`/recipes/${id}/edit`);
      await expectAccessible(page);
    });
  });
}

// One ring for everything: a solid 3 px outline in the text colour (no translucent shadow), and
// at least 3:1 against the surface it sits on (WCAG 1.4.11), in both colour schemes.
const ring = (locator: Locator) =>
  locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
  });

test.describe("keyboard focus", () => {
  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`in ${colorScheme} mode`, () => {
      test.use({ colorScheme });

      test("every kind of control shows the same solid 3 px ring, at least 3:1 against its surface", async ({
        page,
      }, testInfo) => {
        const { id } = await setUp(page);
        const foreground = await textColor(page.locator("body"));
        // The ratio below ignores transparency, so the ring colour itself must be opaque.
        expect(parseColor(foreground).a).toBe(1);
        const controls: [string, string, () => Locator][] = [
          ["primary button", "/recipes/new", () => page.getByRole("button", { name: "Create recipe" })],
          ["text field", "/recipes/new", () => page.getByRole("textbox", { name: "Name", exact: true })],
          ["summary", `/recipes/${id}`, () => page.locator("summary", { hasText: /^Delete$/ })],
          ["link", `/?week=${WEEK}`, () => page.getByRole("link", { name: "Grocery list for this week" })],
          ["dinner field", `/?week=${WEEK}`, () => dinnerField(page, "Monday")],
          ["quiet button", `/?week=${WEEK}`, () => page.getByRole("button", { name: "Clear day" }).first()],
          ["✕ button", `/groceries?week=${WEEK}`, () => page.getByRole("button", { name: /^Remove / })],
        ];

        const ratios: string[] = [];
        for (const [label, path, find] of controls) {
          await page.goto(path);
          const control = find();
          await focusByKeyboard(page, control);
          await expect.poll(() => ring(control), label).toEqual({ style: "solid", width: "3px", color: foreground });
          const ratio = contrastRatio(parseColor(foreground), await surfaceColor(control));
          ratios.push(`${label} ${ratio.toFixed(1)}`);
          expect(ratio, `${label}: ring against its surface`).toBeGreaterThanOrEqual(3);
        }
        testInfo.annotations.push({ type: `ring contrast (${colorScheme})`, description: ratios.join(", ") });
        console.log(`ring contrast, ${colorScheme}: ${ratios.join(", ")}`);
      });
    });
  }
});

test.describe("on a mouse", () => {
  test("every small button is at least 24 px, the WCAG minimum", async ({ page }) => {
    const { id } = await setUp(page);
    const remove = await box(page.getByRole("button", { name: /^Remove / }));
    expect(Math.min(remove.width, remove.height)).toBeGreaterThanOrEqual(36);

    await page.goto(`/recipes/${id}/edit`);
    const ingredient = await box(page.getByRole("button", { name: "Remove ingredient 1" }));
    const tag = await box(page.getByRole("button", { name: "Remove tag quick" }));
    expect(Math.min(ingredient.width, ingredient.height)).toBeGreaterThanOrEqual(36);
    expect(Math.min(tag.width, tag.height)).toBeGreaterThanOrEqual(24);
    for (const name of ["Deutsch", "English"]) {
      const lang = await box(page.getByRole("button", { name }));
      expect(lang.height, name).toBeGreaterThanOrEqual(36);
    }

    await page.goto(`/?week=${WEEK}`);
    for (const name of ["Previous week", "Next week"]) {
      const arrow = await box(page.getByRole("link", { name, exact: true }));
      expect(Math.min(arrow.width, arrow.height)).toBeGreaterThanOrEqual(32);
    }
  });
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("the language buttons are at least 44 px wide and high", async ({ page }) => {
    await setUp(page);
    for (const name of ["Deutsch", "English"]) {
      const size = await box(page.getByRole("button", { name }));
      expect(Math.min(size.width, size.height), name).toBeGreaterThanOrEqual(44);
    }
  });

  test("every button is at least 44 px wide and high", async ({ page }) => {
    const { id } = await setUp(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    // The grocery list.
    for (const [label, locator] of [
      ["remove an extra", page.getByRole("button", { name: /^Remove / })],
      ["previous week (groceries)", page.getByRole("link", { name: "Previous week", exact: true })],
      ["next week (groceries)", page.getByRole("link", { name: "Next week", exact: true })],
    ] as const) {
      const size = await box(locator);
      expect(Math.min(size.width, size.height), label).toBeGreaterThanOrEqual(44);
    }

    // The recipe form.
    await page.goto(`/recipes/${id}/edit`);
    for (const [label, locator] of [
      ["remove an ingredient", page.getByRole("button", { name: "Remove ingredient 1" })],
      ["remove a tag", page.getByRole("button", { name: "Remove tag quick" })],
    ] as const) {
      const size = await box(locator);
      expect(Math.min(size.width, size.height), label).toBeGreaterThanOrEqual(44);
    }

    // The recipe page and the week plan.
    await page.goto(`/recipes/${id}`);
    const del = await box(page.locator("summary", { hasText: /^Delete$/ }));
    expect(Math.min(del.width, del.height), "delete").toBeGreaterThanOrEqual(44);

    await page.goto(`/?week=${WEEK}`);
    for (const [label, locator] of [
      ["previous week", page.getByRole("link", { name: "Previous week", exact: true })],
      ["next week", page.getByRole("link", { name: "Next week", exact: true })],
      ["clear day", page.getByRole("button", { name: "Clear day" }).first()],
      ["clear the whole week", page.locator("summary", { hasText: /^Clear the whole week$/ })],
    ] as const) {
      const size = await box(locator);
      expect(Math.min(size.width, size.height), label).toBeGreaterThanOrEqual(44);
    }
  });
});
