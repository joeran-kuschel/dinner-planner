import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { createRecipe, expectAccessible, planRecipe, unique } from "@/tests/e2e/support/helpers";

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
const background = (locator: Locator) => locator.evaluate((element) => getComputedStyle(element).backgroundColor);

test.describe("destructive actions look different", () => {
  test("Delete, Clear the whole week and Clear day are not styled like the harmless buttons", async ({ page }) => {
    const { id } = await setUp(page);

    await page.goto(`/recipes/${id}`);
    const edit = page.getByRole("link", { name: "Edit", exact: true });
    const del = page.locator("summary", { hasText: /^Delete$/ });
    expect(await textColor(del)).not.toBe(await textColor(edit));

    await page.goto(`/?week=${WEEK}`);
    const clearWeek = page.locator("summary", { hasText: /^Clear the whole week$/ });
    const clearDay = page.getByRole("button", { name: "Clear day" }).first();
    const colour = await textColor(clearWeek);
    expect(colour).not.toBe(await textColor(page.getByRole("link", { name: "Grocery list for this week" })));
    expect(await textColor(clearDay)).toBe(colour);
    expect(await textColor(page.locator("body"))).not.toBe(colour);
  });

  test("the button that confirms is solid danger, not the primary colour", async ({ page }) => {
    await setUp(page);
    await page.goto(`/?week=${WEEK}`);
    await page.locator("summary", { hasText: /^Clear the whole week$/ }).click();
    const confirm = page.getByRole("button", { name: "Clear week", exact: true });
    const primary = page.getByRole("link", { name: "Grocery list for this week" });
    expect(await background(confirm)).not.toBe(await background(primary));
    expect(await background(confirm)).not.toBe("rgba(0, 0, 0, 0)");
  });
});

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

test.describe("keyboard focus", () => {
  test("the destructive buttons and the ✕ buttons show a solid focus ring, not the faint one of other buttons", async ({
    page,
  }) => {
    const { id } = await setUp(page);
    // One ring for everything: a solid 3 px outline in the text colour (no translucent shadow).
    const ring = (locator: Locator) =>
      locator.evaluate((element) => {
        const style = getComputedStyle(element);
        return { style: style.outlineStyle, width: style.outlineWidth, color: style.outlineColor };
      });
    const foreground = await textColor(page.locator("body"));

    // Keyboard focus: after a click, a script's `focus()` does not count as one (no :focus-visible).
    const tabTo = async (locator: Locator) => {
      await locator.focus();
      await page.keyboard.press("Shift+Tab");
      await page.keyboard.press("Tab");
      await expect(locator).toBeFocused();
    };

    const remove = page.getByRole("button", { name: /^Remove / });
    await tabTo(remove);
    await expect.poll(() => ring(remove)).toEqual({ style: "solid", width: "3px", color: foreground });

    await page.goto(`/recipes/${id}`);
    await page.locator("summary", { hasText: /^Delete$/ }).click();
    const confirm = page.getByRole("button", { name: "Delete recipe", exact: true });
    await tabTo(confirm);
    await expect.poll(() => ring(confirm)).toEqual({ style: "solid", width: "3px", color: foreground });
  });
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
