import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

/** A name no other test uses, since all tests share one database. */
export function unique(label: string): string {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** WCAG 2.2 AA check in a real browser, including color contrast. */
export async function expectAccessible(page: Page): Promise<void> {
  // After a client-side navigation Next.js applies the page title a moment after the content.
  await expect(page).toHaveTitle(/.+/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

export type IngredientRow = { quantity?: string; unit?: string; name: string };

/** Fill the recipe form's ingredient rows, adding rows when there are too few. */
export async function fillIngredients(page: Page, ingredients: IngredientRow[]): Promise<void> {
  const names = page.getByLabel(/^Name of ingredient \d+$/);
  const existing = await names.count();
  for (let count = existing; count < ingredients.length; count++) {
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await expect(names).toHaveCount(count + 1);
  }
  for (const [index, row] of ingredients.entries()) {
    const n = index + 1;
    await page.getByLabel(`Amount for ingredient ${n}`, { exact: true }).fill(row.quantity ?? "");
    await page.getByLabel(`Unit for ingredient ${n}`, { exact: true }).fill(row.unit ?? "");
    await page.getByLabel(`Name of ingredient ${n}`, { exact: true }).fill(row.name);
  }
}

/** Create a recipe through the UI and return its id, leaving the page on its detail view. */
export async function createRecipe(
  page: Page,
  recipe: { name: string; servings?: number; ingredients?: IngredientRow[] },
): Promise<string> {
  await page.goto("/recipes/new");
  await page.getByLabel("Name", { exact: true }).fill(recipe.name);
  await page.getByLabel("Serves", { exact: true }).fill(String(recipe.servings ?? 2));
  await fillIngredients(page, recipe.ingredients ?? []);
  await page.getByRole("button", { name: "Create recipe" }).click();
  await expect(page.getByRole("heading", { level: 1, name: recipe.name, exact: true })).toBeVisible();
  const id = new URL(page.url()).pathname.split("/").pop();
  if (!id) throw new Error(`No recipe id in ${page.url()}`);
  return id;
}

/** The card (a form) for one weekday in the week view. */
export function dayCard(page: Page, weekday: string): Locator {
  return page.locator("form").filter({ has: dinnerField(page, weekday) });
}

/**
 * Run `trigger` and wait until the server action it starts has answered and
 * the page shows no pending save any more. (The action's response body is a
 * stream that is not reliably closed, so the visible "Saving…" state is what
 * tells that the round trip is over.)
 */
export async function afterServerAction(page: Page, trigger: () => Promise<unknown>): Promise<void> {
  const response = page.waitForResponse(
    (r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined,
  );
  await trigger();
  await response;
  await expect(page.getByText("Saving…", { exact: true })).toHaveCount(0);
}

/** The dinner field (a combobox with suggestions) of one weekday. */
export function dinnerField(page: Page, weekday: string): Locator {
  return page.getByRole("combobox", { name: `Dinner for ${weekday}`, exact: true });
}

/** Type into a day's dinner field and pick the suggestion `option`, waiting for the auto-save. */
export async function pickDinner(page: Page, weekday: string, typed: string, option: string): Promise<void> {
  const field = dinnerField(page, weekday);
  await field.fill(typed);
  await afterServerAction(page, () =>
    page.getByRole("option", { name: option, exact: true }).click(),
  );
}

/** Pick a recipe (by name) for a day and wait for the auto-save. */
export async function planRecipe(page: Page, weekday: string, recipeName: string): Promise<void> {
  await pickDinner(page, weekday, recipeName, recipeName);
  await expect(dinnerField(page, weekday)).toHaveValue(recipeName);
}

/** Plan a dinner that is no recipe for one day only, and wait for the auto-save. */
export async function planOnce(page: Page, weekday: string, title: string): Promise<void> {
  await pickDinner(page, weekday, title, `Plan “${title}” for this day only`);
  await expect(dinnerField(page, weekday)).toHaveValue(title);
}

/** Change the servings of a planned day and wait for the save on blur. */
export async function setServings(page: Page, weekday: string, servings: number): Promise<void> {
  const input = dayCard(page, weekday).getByLabel("Serves", { exact: true });
  await input.fill(String(servings));
  await afterServerAction(page, () => input.blur());
}

/** Press Tab until `target` has focus, as a keyboard user would. */
export async function tabTo(page: Page, target: Locator, maxTabs = 40): Promise<void> {
  for (let i = 0; i < maxTabs; i++) {
    if (await target.evaluate((el) => el === document.activeElement)) return;
    await page.keyboard.press("Tab");
  }
  throw new Error(`Tab never reached ${target}`);
}

/** The row (a form) for one line on the grocery list. */
export function groceryRow(page: Page, label: string): Locator {
  return page
    .locator("form")
    .filter({ has: page.getByRole("checkbox", { name: `Tick off ${label}`, exact: true }) });
}

/** Open a destructive action's question ("Delete", "Clear the whole week") and answer it with `confirmLabel`. */
export async function confirmAction(page: Page, label: string, confirmLabel: string): Promise<void> {
  await page.locator("summary", { hasText: new RegExp(`^${label}$`) }).click();
  await page.getByRole("button", { name: confirmLabel, exact: true }).click();
}
