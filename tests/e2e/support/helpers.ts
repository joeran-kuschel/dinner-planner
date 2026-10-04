import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";
import { contrastRatio, parseColor, type Rgb } from "@/tests/support/color";

export { contrastRatio, parseColor, type Rgb };

/** A single word no other test uses, for a tag or a search: lowercase letters and digits only. */
export function uniqueWord(prefix = "w"): string {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** A name no other test uses, since all tests share one database. */
export function unique(label: string): string {
  return `${label} ${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** WCAG 2.2 AA check in a real browser, including color contrast. */
export async function expectAccessible(page: Page): Promise<void> {
  // After a client-side navigation Next.js applies the page title a moment after the content.
  await expect(page).toHaveTitle(/.+/);
  // Colours animate (`transition-colors`, e.g. a nav link after a click); axe would measure a
  // half-way colour. Let every running transition end first.
  await page.evaluate(() => Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {}))));
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes.length})`)).toEqual([]);
}

export type IngredientRow = { quantity?: string; unit?: string; name: string; category?: string };

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
    if (row.category) await page.getByLabel(`Category for ingredient ${n}`, { exact: true }).selectOption({ label: row.category });
  }
}

/** Create a recipe through the UI and return its id, leaving the page on its detail view. */
export async function createRecipe(
  page: Page,
  recipe: { name: string; servings?: number; ingredients?: IngredientRow[]; tags?: string[] },
): Promise<string> {
  await page.goto("/recipes/new");
  await page.getByRole("textbox", { name: "Name", exact: true }).fill(recipe.name);
  await page.getByLabel("Serves", { exact: true }).fill(String(recipe.servings ?? 2));
  await fillIngredients(page, recipe.ingredients ?? []);
  for (const tag of recipe.tags ?? []) {
    await page.getByRole("combobox", { name: "Tags", exact: true }).fill(tag);
    await page.getByRole("combobox", { name: "Tags", exact: true }).press("Enter");
    await expect(page.getByRole("button", { name: `Remove tag ${tag}`, exact: true })).toBeVisible();
  }
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

/**
 * Give `target` the keyboard focus the way a keyboard user gets it, so `:focus-visible` applies: after a
 * click, or a script's `focus()` on its own, the browser does not count the focus as the keyboard's.
 */
export async function focusByKeyboard(page: Page, target: Locator): Promise<void> {
  await target.focus();
  await page.keyboard.press("Shift+Tab");
  await page.keyboard.press("Tab");
  await expect(target).toBeFocused();
}

/**
 * The colour a focus ring sits on: the first background that is not transparent, starting at the
 * element itself, or at its parent for an outline, which is drawn outside the element.
 */
export async function surfaceColor(target: Locator, from: "self" | "parent" = "parent"): Promise<Rgb> {
  const css = await target.evaluate((element, start) => {
    for (let node = start === "self" ? element : element.parentElement; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      // A picture or gradient has no single colour to measure against.
      if (style.backgroundImage !== "none") throw new Error(`The surface has a background image: ${style.backgroundImage}`);
      const background = style.backgroundColor;
      if (!/^rgba\(.*,\s*0\)$/.test(background) && background !== "transparent") return background;
    }
    throw new Error("No element above the control has a background colour");
  }, from);
  const colour = parseColor(css);
  if (colour.a !== 1) throw new Error(`The surface is translucent: ${css}`);
  return colour;
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

/** Open the grocery page's "Add something else" disclosure (closed by default; it stays open while items are added). */
export async function openAddForm(page: Page): Promise<void> {
  const details = page.locator("details", { has: page.locator("summary", { hasText: /^Add something else$/ }) });
  if (!(await details.evaluate((element: HTMLDetailsElement) => element.open))) {
    await details.locator("summary").click();
  }
  await expect(details.getByRole("textbox", { name: "Item", exact: true })).toBeVisible();
}

/** WCAG 1.4.10 (reflow): the page does not scroll sideways. */
export async function expectNoSidewaysScroll(page: Page, label = "page"): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${label} scrolls sideways`).toBeLessThanOrEqual(0);
}

/** `target` lies completely inside the viewport (as sized with setViewportSize) and is not clipped by its text. */
export async function expectInsideViewport(target: Locator, label = "element"): Promise<void> {
  const size = target.page().viewportSize();
  const box = await target.boundingBox();
  expect(size, "the viewport size is set").not.toBeNull();
  expect(box, `${label} is on the page`).not.toBeNull();
  expect(box!.x, `${label} left edge`).toBeGreaterThanOrEqual(0);
  expect(box!.y, `${label} top edge`).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width, `${label} right edge`).toBeLessThanOrEqual(size!.width);
  expect(box!.y + box!.height, `${label} bottom edge`).toBeLessThanOrEqual(size!.height);
  // A label wider than its box is cut off or overflows it.
  const clipped = await target.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped, `${label} is clipped`).toBe(false);
}
