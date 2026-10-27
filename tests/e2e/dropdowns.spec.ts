import type { Locator, Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { createRecipe, expectAccessible, openAddForm, unique } from "@/tests/e2e/support/helpers";

// A dropdown draws its own chevron, 14 px from the border, and the text keeps clear of it (`select.field`).
// The database is empty at the start of every test, so each one creates what it looks at.

/** Each dropdown the app has, on the page it is on. */
const DROPDOWNS: { name: string; open: (page: Page) => Promise<Locator> }[] = [
  {
    name: "the recipe list's sort",
    open: async (page) => {
      // The search and its sort only show once there is a recipe to search.
      await createRecipe(page, { name: unique("Sorted") });
      await page.goto("/recipes");
      return page.getByRole("combobox", { name: "Sort by" });
    },
  },
  {
    name: "the grocery list's shop section",
    open: async (page) => {
      await page.goto("/groceries");
      await openAddForm(page);
      return page.getByRole("combobox", { name: "Category" });
    },
  },
  {
    // The narrowest one (a 176 px column), so the one that shows whether the padding leaves the text room.
    name: "an ingredient's category in the recipe form",
    open: async (page) => {
      await page.goto("/recipes/new");
      return page.getByRole("combobox", { name: "Category for ingredient 1" });
    },
  },
  {
    name: "the day in Cook again",
    open: async (page) => {
      const name = unique("Dropdown");
      await createRecipe(page, { name });
      await page.goto("/");
      return page.getByRole("combobox", { name: `Day for ${name}` });
    },
  },
];

const style = (select: Locator) =>
  select.evaluate((element) => {
    const css = getComputedStyle(element);
    return {
      appearance: css.appearance,
      paddingRight: parseFloat(css.paddingRight),
      minHeight: parseFloat(css.minHeight),
      position: css.backgroundPosition,
      size: css.backgroundSize,
      image: css.backgroundImage,
    };
  });

for (const { name, open } of DROPDOWNS) {
  test.describe(name, () => {
    test("draws a chevron 14 px from the border, with the text clear of it", async ({ page }) => {
      const select = await open(page);
      await expect(select).toBeVisible();

      const css = await style(select);
      expect(css.appearance).toBe("none");
      expect(css.image).toContain("data:image/svg+xml");
      expect(css.size).toBe("16px 16px");
      expect(css.position).toBe("calc(100% - 14px) 50%");
      // 14 px from the border + 16 px of chevron + 14 px of air.
      expect(css.paddingRight).toBe(44);
      expect(css.minHeight).toBeGreaterThanOrEqual(44);
      await expectAccessible(page);
    });

    test("uses the lighter chevron in dark mode", async ({ page }) => {
      const select = await open(page);
      const light = (await style(select)).image;

      await page.emulateMedia({ colorScheme: "dark" });
      const dark = (await style(select)).image;
      expect(dark).toContain("data:image/svg+xml");
      expect(dark).not.toBe(light);
    });

    test("hands the arrow back to the browser in forced-colors mode", async ({ page }) => {
      const select = await open(page);

      await page.emulateMedia({ forcedColors: "active" });
      const css = await style(select);
      expect(css.appearance).toBe("auto");
      expect(css.image).toBe("none");
    });
  });
}
