import { expect, test } from "@playwright/test";
import { expectAccessible } from "@/tests/e2e/support/helpers";

test.describe("navigation", () => {
  for (const [name, path] of [
    ["This week", "/"],
    ["Recipes", "/recipes"],
    ["Groceries", "/groceries"],
  ] as const) {
    test(`${name} opens ${path} and passes axe`, async ({ page }) => {
      await page.goto(path === "/" ? "/recipes" : "/");
      const link = page.getByRole("navigation").getByRole("link", { name, exact: true });
      await link.click();
      await expect(page).toHaveURL(path);
      await expect(link).toHaveAttribute("aria-current", "page");
      await expectAccessible(page);
    });
  }
});
