import { type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import {
  afterServerAction,
  createRecipe,
  expectAccessible,
  groceryRow,
  openAddForm,
  planRecipe,
  tabTo,
  unique,
} from "@/tests/e2e/support/helpers";

// Merging duplicate lines on the grocery list: the bundled dictionary (Tomaten and tomatoes are one line, whatever the
// language) and the merges a user makes by hand. Each test creates what it looks at; the database starts empty.

const WEEK = "2028-03-06";
const OTHER_WEEK = "2028-03-13";

/** Create a recipe with the given ingredients and plan it on a Monday. */
async function planOn(page: Page, week: string, weekday: string, name: string, ingredients: { quantity?: string; unit?: string; name: string }[]) {
  await createRecipe(page, { name, ingredients });
  await page.goto(`/?week=${week}`);
  await planRecipe(page, weekday, name);
}

const tick = (page: Page, label: string) => page.getByRole("checkbox", { name: `Tick off ${label}`, exact: true });
const mergeButton = (page: Page, label: string) => page.getByRole("button", { name: `Merge ${label} with another line`, exact: true });
const announcement = (page: Page) => page.locator('p[aria-live="polite"]');
const openMerged = (page: Page) => page.locator("summary", { hasText: /^Merged lines/ }).click();

test.describe("grocery list: the dictionary", () => {
  test("Tomaten and tomatoes are one line that adds the amounts, in English and in German without a reload", async ({ page }) => {
    const pasta = unique("Pasta");
    const salad = unique("Salad");
    await planOn(page, WEEK, "Monday", pasta, [{ quantity: "200", unit: "g", name: "Tomaten" }]);
    await planOn(page, WEEK, "Tuesday", salad, [{ quantity: "300", unit: "grams", name: "tomatoes" }]);

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(1);
    await expect(tick(page, "Tomato")).toBeVisible();
    const row = groceryRow(page, "Tomato");
    await expect(row).toContainText("500 g");
    await expect(row).toContainText(pasta);
    await expect(row).toContainText(salad);

    // The page language names the line; nothing reloads.
    await page.evaluate(() => ((window as unknown as { marker: number }).marker = 1));
    await afterServerAction(page, () => page.getByRole("button", { name: "Deutsch", exact: true }).click());
    await expect(page.getByRole("checkbox", { name: "Tomate abhaken", exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /abhaken$/ })).toHaveCount(1);
    await expect(page.locator("form").filter({ has: page.getByRole("checkbox", { name: "Tomate abhaken" }) })).toContainText("500 g");
    expect(await page.evaluate(() => (window as unknown as { marker?: number }).marker)).toBe(1);

    await afterServerAction(page, () => page.getByRole("button", { name: "English", exact: true }).click());
    await expect(tick(page, "Tomato")).toBeVisible();
  });

  test("a staple named in German hides the line of an English recipe", async ({ page }) => {
    const name = unique("Soup");
    await planOn(page, WEEK, "Monday", name, [
      { quantity: "1", unit: "tsp", name: "Salt" },
      { quantity: "200", unit: "g", name: "Rice" },
    ]);
    await page.goto(`/groceries?week=${WEEK}`);
    await expect(tick(page, "Salt")).toBeVisible();

    await page.locator("summary", { hasText: /^Pantry staples/ }).click();
    const field = page.getByRole("combobox", { name: "Add a staple" });
    await field.fill("Salz");
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    await expect(field).toHaveValue("");

    await expect(tick(page, "Salt")).toHaveCount(0);
    await expect(tick(page, "Rice")).toBeVisible();
    await expect(page.getByText("1 item hidden")).toBeVisible();
  });
});

test.describe("grocery list: hand-added amounts", () => {
  test("an amount added by hand is added to the planned line of the same ingredient", async ({ page }) => {
    await planOn(page, WEEK, "Monday", unique("Bread"), [{ quantity: "200", unit: "g", name: "Mehl" }]);
    await page.goto(`/groceries?week=${WEEK}`);
    await expect(groceryRow(page, "Flour")).toContainText("200 g");

    await openAddForm(page);
    await page.getByLabel("Amount", { exact: true }).fill("2");
    await page.getByLabel("Unit", { exact: true }).fill("kg");
    await page.getByRole("textbox", { name: "Item", exact: true }).fill("flour");
    await afterServerAction(page, () => page.getByRole("button", { name: "Add", exact: true }).first().click());

    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(1);
    await expect(groceryRow(page, "Flour")).toContainText("2.2 kg");

    await afterServerAction(page, () => page.getByRole("button", { name: "Deutsch", exact: true }).click());
    const mehl = page.locator("form").filter({ has: page.getByRole("checkbox", { name: "Mehl abhaken", exact: true }) });
    await expect(page.getByRole("checkbox", { name: /abhaken$/ })).toHaveCount(1);
    await expect(mehl).toContainText("2,2 kg");
  });
});

test.describe("grocery list: unit names", () => {
  test("a countable unit is singular for one and plural for more, in English and in German", async ({ page }) => {
    const soup = unique("Soup");
    const stew = unique("Stew");
    await planOn(page, WEEK, "Monday", soup, [{ quantity: "1", unit: "clove", name: "Garlic" }]);
    await page.goto(`/groceries?week=${WEEK}`);
    await expect(groceryRow(page, "Garlic")).toContainText("1 clove");
    await expect(groceryRow(page, "Garlic")).not.toContainText("1 cloves");

    await planOn(page, WEEK, "Tuesday", stew, [{ quantity: "2", unit: "Zehen", name: "Knoblauch" }]);
    await page.goto(`/groceries?week=${WEEK}`);
    await expect(groceryRow(page, "Garlic")).toContainText("3 cloves");

    await afterServerAction(page, () => page.getByRole("button", { name: "Deutsch", exact: true }).click());
    await expect(page.locator("form").filter({ has: page.getByRole("checkbox", { name: "Knoblauch abhaken", exact: true }) })).toContainText("3 Zehen");
  });
});

test.describe("grocery list: merging lines by hand", () => {
  test("merges two lines in every week, announces it, focuses the line that remains and can be undone", async ({ page }) => {
    const first = unique("Zork");
    const second = unique("Blep");
    await planOn(page, WEEK, "Monday", unique("Dish A"), [{ quantity: "100", unit: "g", name: first }]);
    await planOn(page, WEEK, "Tuesday", unique("Dish B"), [{ quantity: "250", unit: "g", name: second }]);
    // The merged name alone in another week.
    await planOn(page, OTHER_WEEK, "Monday", unique("Dish C"), [{ quantity: "50", unit: "g", name: first }]);

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(2);

    await mergeButton(page, first).click();
    const dialog = page.getByRole("dialog", { name: `Merge ${first}` });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("radio")).toHaveCount(1);
    await expect(dialog.getByRole("button", { name: "Merge", exact: true })).toHaveAttribute("aria-disabled", "true");
    await expect(dialog.getByRole("status")).toBeEmpty();
    await dialog.getByRole("radio", { name: new RegExp(second) }).check();
    await expect(dialog.getByRole("status")).toHaveText(`${first} will be listed as ${second}.`);
    await expectAccessible(page);

    await afterServerAction(page, () => dialog.getByRole("button", { name: "Merge", exact: true }).click());
    await expect(dialog).toBeHidden();

    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(1);
    await expect(tick(page, second)).toBeVisible();
    await expect(tick(page, first)).toHaveCount(0);
    await expect(groceryRow(page, second)).toContainText("350 g");
    await expect(announcement(page)).toHaveText(`Merged ${first} into ${second}`);
    await expect(tick(page, second)).toBeFocused();

    // Listed under "Merged lines", and in every week.
    await openMerged(page);
    await expect(page.getByText(`${first} is listed as ${second}`)).toBeVisible();
    await page.goto(`/groceries?week=${OTHER_WEEK}`);
    await expect(tick(page, second)).toBeVisible();
    await expect(tick(page, first)).toHaveCount(0);
    await expect(groceryRow(page, second)).toContainText("50 g");

    // Undo splits them again.
    await page.goto(`/groceries?week=${WEEK}`);
    await openMerged(page);
    await expectAccessible(page);
    await afterServerAction(page, () => page.getByRole("button", { name: `Undo merging ${first} into ${second}`, exact: true }).click());
    await expect(page.getByText("Nothing merged yet.")).toBeVisible();
    await expect(tick(page, first)).toBeVisible();
    await expect(tick(page, second)).toBeVisible();
    await expect(groceryRow(page, second)).toContainText("250 g");
  });

  test("can be done with the keyboard alone", async ({ page }) => {
    const first = unique("Quux");
    const second = unique("Fizz");
    await planOn(page, WEEK, "Monday", unique("Dish A"), [{ quantity: "1", unit: "kg", name: first }]);
    await planOn(page, WEEK, "Tuesday", unique("Dish B"), [{ quantity: "500", unit: "g", name: second }]);

    await page.goto(`/groceries?week=${WEEK}`);
    // kg and g are one unit family: they can be merged, and the sum is 1.5 kg.
    await expect(mergeButton(page, first)).toBeVisible();
    await tabTo(page, mergeButton(page, first));
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: `Merge ${first}` });
    await expect(dialog).toBeVisible();
    // The first focusable element, the first radio, has the focus right away.
    await expect(dialog.getByRole("radio").first()).toBeFocused();
    const radio = dialog.getByRole("radio", { name: new RegExp(second) });
    await tabTo(page, radio);
    await page.keyboard.press("Space");
    await expect(radio).toBeChecked();
    const confirm = dialog.getByRole("button", { name: "Merge", exact: true });
    await tabTo(page, confirm);
    await afterServerAction(page, () => page.keyboard.press("Enter"));

    await expect(dialog).toBeHidden();
    await expect(tick(page, second)).toBeFocused();
    await expect(announcement(page)).toHaveText(`Merged ${first} into ${second}`);
    await expect(groceryRow(page, second)).toContainText("1.5 kg");
  });

  test("Escape closes the dialog and merges nothing, handing the focus back to the button", async ({ page }) => {
    const first = unique("Zork");
    const second = unique("Blep");
    await planOn(page, WEEK, "Monday", unique("Dish"), [
      { quantity: "1", unit: "g", name: first },
      { quantity: "2", unit: "g", name: second },
    ]);
    await page.goto(`/groceries?week=${WEEK}`);

    await mergeButton(page, first).click();
    await expect(page.getByRole("dialog", { name: `Merge ${first}` })).toBeVisible();
    await page.keyboard.press("Escape");

    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(mergeButton(page, first)).toBeFocused();
    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(2);
  });

  test("offers no merge for a line whose unit no other line has", async ({ page }) => {
    await planOn(page, WEEK, "Monday", unique("Dish"), [
      { quantity: "1", unit: "g", name: unique("Zork") },
      { quantity: "2", name: unique("Blep") },
    ]);
    await page.goto(`/groceries?week=${WEEK}`);

    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(2);
    await expect(page.getByRole("button", { name: /^Merge .* with another line$/ })).toHaveCount(0);
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test(`passes the accessibility check in ${colorScheme} mode with the dialog open and with a merge listed`, async ({ browser }) => {
      const context = await browser.newContext({ colorScheme, locale: "en-GB" });
      const page = await context.newPage();
      const first = unique("Zork");
      const second = unique("Blep");
      await planOn(page, WEEK, "Monday", unique("Dish"), [
        { quantity: "1", unit: "g", name: first },
        { quantity: "2", unit: "g", name: second },
      ]);
      await page.goto(`/groceries?week=${WEEK}`);
      await expectAccessible(page);

      await mergeButton(page, first).click();
      const dialog = page.getByRole("dialog", { name: `Merge ${first}` });
      await dialog.getByRole("radio", { name: new RegExp(second) }).check();
      await expectAccessible(page);

      await afterServerAction(page, () => dialog.getByRole("button", { name: "Merge", exact: true }).click());
      await expect(tick(page, second)).toBeFocused();
      await openMerged(page);
      await expectAccessible(page);
      await context.close();
    });
  }
});

test.describe("grocery list: merging lines in German", () => {
  test("merges two lines through the dialog, announces it and undoes it in German", async ({ page }) => {
    const first = unique("Zork");
    const second = unique("Blep");
    // Created in English, planned and merged in German.
    const name = unique("Gericht");
    await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "100", unit: "g", name: first },
        { quantity: "200", unit: "g", name: second },
      ],
    });
    await page.context().addCookies([{ name: "locale", value: "de", url: "http://localhost:3100" }]);
    await page.goto(`/?week=${WEEK}`);
    await page.getByRole("combobox", { name: "Abendessen am Montag" }).fill(name);
    await afterServerAction(page, () => page.getByRole("option", { name, exact: true }).click());

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await page.getByRole("button", { name: `${first} mit einer anderen Zeile zusammenführen`, exact: true }).click();
    const dialog = page.getByRole("dialog", { name: `${first} zusammenführen` });
    await dialog.getByRole("radio", { name: new RegExp(second) }).check();
    await expect(dialog.getByRole("status")).toHaveText(`${first} steht künftig als ${second} auf der Liste.`);
    await expectAccessible(page);

    await afterServerAction(page, () => dialog.getByRole("button", { name: "Zusammenführen", exact: true }).click());

    await expect(page.getByRole("checkbox", { name: /abhaken$/ })).toHaveCount(1);
    await expect(page.getByRole("checkbox", { name: `${second} abhaken`, exact: true })).toBeFocused();
    await expect(announcement(page)).toHaveText(`${first} mit ${second} zusammengeführt`);
    await page.locator("summary", { hasText: /^Zusammengeführte Zeilen/ }).click();
    await expect(page.getByText(`${first} steht als ${second} auf der Liste`)).toBeVisible();
    await expectAccessible(page);

    await afterServerAction(page, () =>
      page.getByRole("button", { name: `Zusammenführung von ${first} mit ${second} rückgängig machen`, exact: true }).click(),
    );
    await expect(page.getByText("Noch nichts zusammengeführt.")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /abhaken$/ })).toHaveCount(2);
  });
});
