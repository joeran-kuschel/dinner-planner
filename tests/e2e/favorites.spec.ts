import type { Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { afterServerAction, createRecipe, dinnerField, expectAccessible, planRecipe, unique } from "@/tests/e2e/support/helpers";

// Favorites, "last planned" and "Cook again". Each test creates what it looks at; the database starts empty.

/** Monday of a week long ago: a recipe planned there was planned "months ago", whatever day the tests run. */
const OLD_WEEK = "2025-01-06";

const favoriteButton = (page: Page) => page.getByRole("button", { name: "Favorite", exact: true });
const star = (page: Page, name: string) => page.getByRole("button", { name: `Favorite ${name}`, exact: true });
const cookAgain = (page: Page) => page.getByRole("region", { name: "Cook again" });

async function makeFavorite(page: Page, id: string) {
  await page.goto(`/recipes/${id}`);
  await afterServerAction(page, () => favoriteButton(page).click());
  await expect(favoriteButton(page)).toHaveAttribute("aria-pressed", "true");
}

async function planLongAgo(page: Page, recipe: string) {
  await page.goto(`/?week=${OLD_WEEK}`);
  await planRecipe(page, "Monday", recipe);
}

test.describe("favorites", () => {
  test("a recipe becomes a favorite and stops being one, on its page, and keeps it after a reload", async ({ page }) => {
    const name = unique("Dal");
    const id = await createRecipe(page, { name });

    await expect(favoriteButton(page)).toHaveAttribute("aria-pressed", "false");
    await expectAccessible(page);
    await afterServerAction(page, () => favoriteButton(page).click());
    await expect(favoriteButton(page)).toHaveAttribute("aria-pressed", "true");
    await expect(favoriteButton(page)).toBeFocused();

    await page.reload();
    await expect(favoriteButton(page)).toHaveAttribute("aria-pressed", "true");
    await expectAccessible(page);

    await afterServerAction(page, () => favoriteButton(page).click());
    await expect(favoriteButton(page)).toHaveAttribute("aria-pressed", "false");
    await page.goto(`/recipes/${id}`);
    await expect(favoriteButton(page)).toHaveAttribute("aria-pressed", "false");
  });

  test("the page says when the recipe was last planned", async ({ page }) => {
    const name = unique("Stew");
    await createRecipe(page, { name });
    // The words are lowercase in the page and capitalised by the style.
    await expect(page.getByText(/^never planned$/i)).toBeVisible();

    await planLongAgo(page, name);
    await page.getByRole("link", { name: "View recipe" }).first().click();
    await expect(page.getByText(/^last planned \d+ (months|years) ago$/i)).toBeVisible();
  });

  test("the list has a star on each card, a Favorites only button and a sort by the longest ago", async ({ page }) => {
    const a = unique("Aaa");
    const b = unique("Bbb");
    const c = unique("Ccc");
    for (const name of [a, b, c]) await createRecipe(page, { name });
    await planLongAgo(page, b);

    await page.goto("/recipes");
    await expect(star(page, a)).toHaveAttribute("aria-pressed", "false");
    await afterServerAction(page, () => star(page, c).click());
    await expect(star(page, c)).toHaveAttribute("aria-pressed", "true");
    // A card says when its recipe was last planned.
    await expect(page.getByRole("listitem").filter({ hasText: b }).getByText(/last planned \d+ (months|years) ago/i)).toBeVisible();
    await expect(page.getByRole("listitem").filter({ hasText: a }).getByText(/never planned/i)).toBeVisible();
    await expectAccessible(page);

    // Favorites only: a button that is pressed while it filters, and leads back to everything when it is pressed again.
    const only = page.getByRole("button", { name: "Favorites only" });
    await expect(only).toHaveAttribute("aria-pressed", "false");
    await only.click();
    await expect(page).toHaveURL(/fav=1/);
    await expect(page.getByRole("button", { name: "Favorites only" })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByRole("heading", { level: 2, name: c })).toBeVisible();
    await expect(page.getByRole("heading", { level: 2, name: a })).toHaveCount(0);
    await page.getByRole("button", { name: "Favorites only" }).click();
    await expect(page).not.toHaveURL(/fav=/);
    await expect(page.getByRole("heading", { level: 2, name: a })).toBeVisible();

    // The longest ago first, never planned after it.
    await page.getByLabel("Sort").selectOption("planned");
    await page.getByRole("button", { name: "Search", exact: true }).click();
    await expect(page).toHaveURL(/sort=planned/);
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([b, a, c]);
  });

  test("the way back from a recipe keeps the favorites filter and the sort", async ({ page }) => {
    const name = unique("Back");
    const id = await createRecipe(page, { name });
    await makeFavorite(page, id);

    await page.goto("/recipes?fav=1&sort=planned");
    await page.getByRole("link", { name: new RegExp(name) }).click();
    // Wait for the recipe's page: on a slow machine the click would otherwise land on the list, where "Recipes" is the nav link.
    await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
    await page.getByRole("main").getByRole("link", { name: /^← Recipes$/ }).click();
    await expect(page).toHaveURL(/fav=1/);
    await expect(page).toHaveURL(/sort=planned/);
  });
});

test.describe("the dinner field", () => {
  test("offers the favorites first and then the longest ago, each with a hint, and keeps the order by name while typing", async ({ page }) => {
    const stem = unique("Rank");
    const names = { aaa: `${stem} aaa`, bbb: `${stem} bbb`, ccc: `${stem} ccc`, ddd: `${stem} ddd` };
    const ids: Record<string, string> = {};
    for (const [key, name] of Object.entries(names)) ids[key] = await createRecipe(page, { name });
    await planLongAgo(page, names.ccc);
    await makeFavorite(page, ids.ddd);

    await page.goto("/");
    await dinnerField(page, "Monday").click();
    const options = page.getByRole("option");
    // ddd: a favorite (never planned); then ccc, planned long ago; then aaa and bbb, never planned.
    await expect(options.nth(0)).toHaveAccessibleName(names.ddd);
    await expect(options.nth(1)).toHaveAccessibleName(names.ccc);
    await expect(options.nth(2)).toHaveAccessibleName(names.aaa);
    await expect(options.nth(3)).toHaveAccessibleName(names.bbb);
    await expect(options.nth(0)).toContainText("Favorite · never planned");
    await expect(options.nth(1)).toContainText(/last planned \d+ (months|years) ago/);
    await expect(options.nth(0)).toHaveAccessibleDescription("Favorite · never planned");
    await expectAccessible(page);

    // Typing a word they share keeps the order by name, whatever the ranking was.
    await dinnerField(page, "Monday").fill(stem);
    const typed = await page.getByRole("option").evaluateAll((items) => items.map((item) => item.firstChild?.textContent));
    expect(typed.slice(0, 4)).toEqual([names.aaa, names.bbb, names.ccc, names.ddd]);
  });

  test("picking a favorite plans it by its name", async ({ page }) => {
    const name = unique("Pick");
    const id = await createRecipe(page, { name });
    await makeFavorite(page, id);

    await page.goto("/");
    await dinnerField(page, "Monday").click();
    await afterServerAction(page, () => page.getByRole("option", { name, exact: true }).click());
    await expect(dinnerField(page, "Monday")).toHaveValue(name);
  });
});

test.describe("Cook again", () => {
  test("offers a favorite and a recipe not planned for a while, but not what is planned this week or what is not a dinner", async ({ page }) => {
    const fav = unique("Fav");
    const old = unique("Old");
    const fresh = unique("Fresh");
    const drink = unique("Drink");
    const stock = unique("Stock");
    const ids: Record<string, string> = {};
    ids.fav = await createRecipe(page, { name: fav });
    ids.old = await createRecipe(page, { name: old });
    ids.fresh = await createRecipe(page, { name: fresh });
    await createRecipe(page, { name: drink, tags: ["cocktail"] });
    await createRecipe(page, { name: stock, tags: ["base recipe"] });
    await makeFavorite(page, ids.fav);
    await planLongAgo(page, old);

    await page.goto("/");
    await planRecipe(page, "Monday", fresh);

    const rows = cookAgain(page).getByRole("listitem");
    await expect(rows.filter({ hasText: fav })).toContainText("Favorite · never planned");
    await expect(rows.filter({ hasText: old })).toContainText(/last planned \d+ (months|years) ago/);
    // Planned this week, a cocktail and a base recipe stay out.
    await expect(rows.filter({ hasText: fresh })).toHaveCount(0);
    await expect(rows.filter({ hasText: drink })).toHaveCount(0);
    await expect(rows.filter({ hasText: stock })).toHaveCount(0);
    // The favorite first.
    await expect(rows.first()).toContainText(fav);
    await expectAccessible(page);
  });

  test("plans a recipe on a free day, and the recipe leaves the section", async ({ page }) => {
    const name = unique("Plan me");
    const other = unique("Other");
    const id = await createRecipe(page, { name });
    await createRecipe(page, { name: other });
    await makeFavorite(page, id);

    await page.goto("/");
    const row = cookAgain(page).getByRole("listitem").filter({ hasText: name });
    await expect(page.getByRole("combobox", { name: `Day for ${name}` })).not.toHaveValue("");
    // The last free day of the week, whatever day the test runs.
    const select = page.getByRole("combobox", { name: `Day for ${name}`, exact: true });
    const lastDay = await select.locator("option").last().textContent();
    await select.selectOption({ index: (await select.locator("option").count()) - 1 });
    await afterServerAction(page, () => page.getByRole("button", { name: `Plan ${name}`, exact: true }).click());

    await expect(row).toHaveCount(0);
    await expect(page.getByRole("heading", { level: 2, name: "Cook again" })).toBeFocused();
    const weekday = lastDay!.split(" ")[0];
    await expect(dinnerField(page, weekday)).toHaveValue(name);
  });

  test("sends the focus to the planned day's field when the last recipe leaves and the section goes", async ({ page }) => {
    const name = unique("Only one");
    const id = await createRecipe(page, { name });
    await makeFavorite(page, id);

    await page.goto("/");
    const select = page.getByRole("combobox", { name: `Day for ${name}`, exact: true });
    const lastDay = await select.locator("option").last().textContent();
    await select.selectOption({ index: (await select.locator("option").count()) - 1 });
    await afterServerAction(page, () => page.getByRole("button", { name: `Plan ${name}`, exact: true }).click());

    await expect(cookAgain(page)).toHaveCount(0);
    await expect(dinnerField(page, lastDay!.split(" ")[0])).toBeFocused();
  });

  test("says so and plans nothing when the day was planned in another window meanwhile", async ({ page }) => {
    const name = unique("Race");
    const other = unique("Taken");
    const id = await createRecipe(page, { name });
    await createRecipe(page, { name: other });
    await makeFavorite(page, id);

    await page.goto("/");
    const select = page.getByRole("combobox", { name: `Day for ${name}`, exact: true });
    const firstDay = (await select.locator("option").first().textContent())!.split(" ")[0];

    // Another window plans that very day.
    const second = await page.context().newPage();
    await second.goto("/");
    await planRecipe(second, firstDay, other);
    await second.close();

    await afterServerAction(page, () => page.getByRole("button", { name: `Plan ${name}`, exact: true }).click());
    await expect(page.getByRole("alert").filter({ hasText: "That day has been planned in the meantime." })).toBeVisible();
    await expect(select).toBeFocused();
    // Nothing was overwritten: the day still has the other dinner.
    await expect(dinnerField(page, firstDay)).toHaveValue(other);
    await expectAccessible(page);
  });

  test("is a column beside the week on a wide screen and below it on a phone", async ({ page }) => {
    const id = await createRecipe(page, { name: unique("Column") });
    await makeFavorite(page, id);

    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const section = cookAgain(page);
    const firstDay = page.getByRole("heading", { name: /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/ }).first();
    const day = await firstDay.boundingBox();
    const side = await section.boundingBox();
    expect(side!.x).toBeGreaterThan(day!.x + day!.width / 2);

    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto("/");
    const lastDay = await page.getByRole("combobox", { name: /^Dinner for / }).last().boundingBox();
    const below = await cookAgain(page).boundingBox();
    expect(below!.y).toBeGreaterThan(lastDay!.y);
    expect(below!.x).toBeLessThan(40);
  });

  test("says it in German", async ({ page }) => {
    const id = await createRecipe(page, { name: unique("Deutsch") });
    await makeFavorite(page, id);
    await page.goto("/");
    await afterServerAction(page, () => page.getByRole("button", { name: "Deutsch", exact: true }).click());
    await expect(page.getByRole("region", { name: "Nochmal kochen" })).toBeVisible();
    await expect(page.getByText("Favorit · noch nie geplant")).toBeVisible();
    await expectAccessible(page);
  });
});
