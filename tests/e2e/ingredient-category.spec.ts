import type { Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { expectNoSidewaysScroll } from "@/tests/e2e/support/helpers";

// The Category dropdown of an ingredient row shows every category name in full, in both languages, from a phone to a desktop.
// Below lg a row wraps and the field takes the width of its line; from lg a row is one line and the column is 15 rem.

const WIDTHS = [
  { name: "the narrowest phone", width: 320, height: 640 },
  { name: "a phone", width: 390, height: 844 },
  { name: "a tablet", width: 768, height: 1024 },
  { name: "a desktop", width: 1280, height: 800 },
];

for (const locale of ["en-GB", "de-DE"]) {
  test.describe(`the ingredient category dropdown (${locale})`, () => {
    test.use({ locale });

    for (const { name, width, height } of WIDTHS) {
      test(`shows every category name in full on ${name}`, async ({ page }) => {
        await page.setViewportSize({ width, height });
        await page.goto("/recipes/new");
        const select = page.locator('select[name="ingredientCategory"]').first();
        await expect(select).toBeVisible();

        const { room, widest } = await select.evaluate((element: HTMLSelectElement) => {
          const css = getComputedStyle(element);
          const probe = document.createElement("span");
          probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${css.font}`;
          document.body.append(probe);
          const widths = [...element.options].map((option) => {
            probe.textContent = option.text;
            return { text: option.text, width: probe.getBoundingClientRect().width };
          });
          probe.remove();
          widths.sort((a, b) => b.width - a.width);
          return {
            // What is left of the field for the text: its width without the borders and the padding (the chevron's room).
            room: element.clientWidth - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight),
            widest: widths[0],
          };
        });
        expect(widest.width, `"${widest.text}" needs ${Math.ceil(widest.width)} px, the field has ${Math.floor(room)}`).toBeLessThanOrEqual(room);
        await expectNoSidewaysScroll(page, "the recipe form");
      });
    }

    // The column heading (the "Category" span of the header row) is there from lg only; below it each field names itself.
    const columnHeading = (page: Page) => page.locator('div[aria-hidden="true"] > span.w-60');

    test("names each field itself below lg, where there is no column heading", async ({ page }) => {
      await page.setViewportSize({ width: 768, height: 1024 });
      await page.goto("/recipes/new");
      await expect(page.locator('select[name="ingredientCategory"]').first()).toBeVisible();
      await expect(columnHeading(page)).toBeHidden();
    });

    test("keeps the rows in one line from lg, under the column heading", async ({ page }) => {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto("/recipes/new");
      const select = page.locator('select[name="ingredientCategory"]').first();
      const name = page.locator('input[name="ingredientName"]').first();
      const heading = columnHeading(page);
      await expect(heading).toBeVisible();

      const [selectBox, nameBox, headingBox] = await Promise.all([select.boundingBox(), name.boundingBox(), heading.boundingBox()]);
      expect(selectBox!.width).toBeCloseTo(240, 0);
      // One line: the name field sits at the height of the dropdown, and the column heading starts where the dropdown does.
      expect(Math.abs(nameBox!.y - selectBox!.y)).toBeLessThan(2);
      expect(Math.abs(headingBox!.x - selectBox!.x)).toBeLessThan(2);
      expect(nameBox!.width).toBeGreaterThan(300);
    });
  });
}
