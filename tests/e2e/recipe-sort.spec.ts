import type { Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { afterServerAction, createRecipe, expectAccessible, expectNoSidewaysScroll, planRecipe, unique } from "@/tests/e2e/support/helpers";

// The recipe list's sort: four orders, applied at once, with the filter kept. Each test creates what it looks at.

/** Monday of a week long ago: a recipe planned there was planned "months ago" whatever day the tests run. */
const OLD_WEEK = "2025-01-06";

const sortSelect = (page: Page) => page.getByRole("combobox", { name: "Sort by" });
const names = (page: Page) => page.getByRole("heading", { level: 2 });
const status = (page: Page) => page.locator('p[role="status"]').filter({ hasText: "Sorted by" });

/**
 * Three recipes whose four orders all differ: alphabetical a, b, c; created a, c, b; a planned long ago, c this week
 * (Monday of the current week is never later than today) and b never.
 */
async function threeRecipes(page: Page) {
  const stem = unique("Sort");
  const [a, b, c] = [`${stem} aaa`, `${stem} bbb`, `${stem} ccc`];
  const ids: Record<string, string> = {};
  for (const name of [a, c, b]) ids[name] = await createRecipe(page, { name });
  await page.goto(`/?week=${OLD_WEEK}`);
  await planRecipe(page, "Monday", a);
  await page.goto("/");
  await planRecipe(page, "Monday", c);
  return { stem, a, b, c, ids };
}

test.describe("the recipe list's sort", () => {
  test("re-orders the list at once, in each of the four orders, and keeps the focus on the select", async ({ page }) => {
    const { stem, a, b, c } = await threeRecipes(page);
    await page.goto(`/recipes?q=${stem}`);
    await expect(names(page)).toHaveText([a, b, c]);
    await expectAccessible(page);

    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
    const orders = [
      { option: "Newest first", url: /sort=newest/, expected: [b, c, a] },
      { option: "Planned longest ago", url: /sort=planned/, expected: [b, a, c] },
      { option: "Planned most recently", url: /sort=recent/, expected: [c, a, b] },
      { option: "Name (A–Z)", url: /^(?!.*sort=)/, expected: [a, b, c] },
    ];
    // selectOption does not focus the select; the person who uses it has.
    await sortSelect(page).focus();
    for (const { option, url, expected } of orders) {
      await sortSelect(page).selectOption({ label: option });
      await expect(page).toHaveURL(url);
      await expect(names(page)).toHaveText(expected);
      await expect(status(page)).toHaveText(`Sorted by: ${option}`);
      await expect(sortSelect(page)).toBeFocused();
      await expect(sortSelect(page)).toHaveValue(option === "Name (A–Z)" ? "name" : /newest|planned|recent/);
    }
    // The search text stayed, and the page was never loaded again.
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === stem);
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);
  });

  test("keeps Favorites only and the search text when the order changes", async ({ page }) => {
    const { stem, a, b, c } = await threeRecipes(page);
    await page.goto("/recipes");
    for (const name of [a, c]) {
      await afterServerAction(page, () => page.getByRole("button", { name: `Favorite ${name}`, exact: true }).click());
    }

    await page.goto(`/recipes?q=${stem}`);
    await page.getByRole("button", { name: "Favorites only" }).click();
    await expect(page).toHaveURL(/fav=1/);
    await expect(names(page)).toHaveText([a, c]);

    await sortSelect(page).selectOption({ label: "Planned most recently" });
    await expect(page).toHaveURL(/fav=1/);
    await expect(page).toHaveURL(/sort=recent/);
    await expect(page).toHaveURL((url) => url.searchParams.get("q") === stem);
    await expect(page.getByRole("button", { name: "Favorites only" })).toHaveAttribute("aria-pressed", "true");
    await expect(names(page)).toHaveText([c, a]);
    await expect(names(page).filter({ hasText: b })).toHaveCount(0);
  });

  test("keeps a tag filter when the order changes", async ({ page }) => {
    const stem = unique("Tagged");
    const [a, b] = [`${stem} aaa`, `${stem} bbb`];
    await createRecipe(page, { name: b, tags: ["soup"] });
    await createRecipe(page, { name: a, tags: ["soup"] });
    await createRecipe(page, { name: unique("Other"), tags: ["salad"] });

    await page.goto("/recipes?tag=soup");
    await expect(names(page)).toHaveText([a, b]);
    await sortSelect(page).selectOption({ label: "Newest first" });
    await expect(page).toHaveURL(/tag=soup/);
    await expect(names(page)).toHaveText([a, b]);
  });

  test("is in the address, so a link or a reload keeps it, and the select follows the address when it changes by itself", async ({ page }) => {
    const { stem, a, b, c } = await threeRecipes(page);
    await page.goto(`/recipes?q=${stem}&sort=newest`);
    await expect(names(page)).toHaveText([b, c, a]);
    await expect(sortSelect(page)).toHaveValue("newest");

    await page.reload();
    await expect(names(page)).toHaveText([b, c, a]);
    await expect(sortSelect(page)).toHaveValue("newest");

    // "Clear" leads to the plain list: the order is the name order again, and so is the select.
    await page.getByRole("link", { name: "Clear" }).click();
    await expect(page).toHaveURL(/\/recipes$/);
    await expect(sortSelect(page)).toHaveValue("name");
  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("the Search button sends the chosen order", async ({ browser, page }) => {
      // The recipes are made the way a person would, with JavaScript; only the list is looked at without.
      const setUp = await browser.newPage({ javaScriptEnabled: true });
      const { stem, a, b, c } = await threeRecipes(setUp);
      await setUp.close();
      await page.goto(`/recipes?q=${stem}`);
      await sortSelect(page).selectOption({ label: "Newest first" });
      await page.getByRole("button", { name: "Search", exact: true }).click();

      await expect(page).toHaveURL(/sort=newest/);
      await expect(names(page)).toHaveText([b, c, a]);
      await expect(sortSelect(page)).toHaveValue("newest");
    });
  });
});

test.describe("the layout of the recipe list's search", () => {
  const rect = (page: Page, selector: string) =>
    page.locator(selector).first().evaluate((element) => {
      const box = element.getBoundingClientRect();
      return { top: Math.round(box.top), right: Math.round(box.right) };
    });

  for (const { name, width, height } of [
    { name: "a phone", width: 375, height: 812 },
    { name: "a tablet", width: 768, height: 1024 },
    { name: "a desktop", width: 1280, height: 800 },
  ]) {
    test(`is in lines that fit, on ${name}`, async ({ page }) => {
      await createRecipe(page, { name: unique("Layout") });
      await page.setViewportSize({ width, height });
      await page.goto("/recipes");
      await expect(sortSelect(page)).toBeVisible();
      await expectNoSidewaysScroll(page, "the recipe list");

      const [box, search, favorites, sort] = await Promise.all([
        rect(page, 'input[name="q"]'),
        rect(page, 'button[type="submit"].btn-primary'),
        rect(page, 'form[role="search"] button[aria-pressed]'),
        rect(page, 'select[name="sort"]'),
      ]);
      // The search box and the Search button are one line, level with each other.
      expect(Math.abs(box.top - search.top)).toBeLessThan(2);
      if (width >= 640) {
        // Favorites only and the sort are one line, and the sort ends where the Search button above it does.
        expect(Math.abs(favorites.top - sort.top)).toBeLessThan(2);
        expect(Math.abs(sort.right - search.right)).toBeLessThan(2);
      } else {
        // On a phone the sort goes below Favorites only and takes the width.
        expect(sort.top).toBeGreaterThan(favorites.top);
      }
    });
  }
});
