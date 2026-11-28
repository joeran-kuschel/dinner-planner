import { type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import {
  afterServerAction,
  confirmAction,
  createRecipe,
  dayCard,
  dinnerField,
  expectAccessible,
  pickDinner,
  planOnce,
  planRecipe,
  setServings,
  unique,
} from "@/tests/e2e/support/helpers";

// Every test plans in a week of its own, far from "today", so tests neither
// depend on the clock nor on each other.

function summary(page: Page) {
  return page.getByText(/ of 7 planned$/);
}

test.describe("week plan", () => {
  test("says what Serves does, and every servings field is described by it", async ({ page }) => {
    const name = unique("Soup");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Leek" }] });
    await page.goto("/?week=2027-01-18");
    await planRecipe(page, "Monday", name);

    const hint = page.getByText("“Serves” is how many people eat; the grocery list scales the amounts to it.");
    await expect(hint).toBeVisible();
    await expect(dayCard(page, "Monday").getByLabel("Serves", { exact: true })).toHaveAccessibleDescription(
      (await hint.textContent()) ?? "",
    );
    await expectAccessible(page);
  });

  test("plans a recipe for a day and keeps it after a reload", async ({ page }) => {
    const name = unique("Lasagne");
    await createRecipe(page, { name, ingredients: [{ quantity: "12", name: "Pasta sheets" }] });

    await page.goto("/?week=2027-01-04");
    await expect(summary(page)).toHaveText("4 Jan – 10 Jan 2027 · 0 of 7 planned");
    await planRecipe(page, "Monday", name);
    await expect(summary(page)).toHaveText("4 Jan – 10 Jan 2027 · 1 of 7 planned");

    await page.reload();
    await expect(dinnerField(page, "Monday")).toHaveValue(name);
    await expect(dayCard(page, "Monday").getByLabel("Serves", { exact: true })).toHaveValue("2");
    await expect(dinnerField(page, "Tuesday")).toHaveValue("");
    await expect(summary(page)).toHaveText("4 Jan – 10 Jan 2027 · 1 of 7 planned");
  });

  test("adds a name as a new recipe from the day card", async ({ page }) => {
    const name = unique("Shakshuka");
    await page.goto("/?week=2027-08-09");

    await pickDinner(page, "Thursday", name, `Add “${name}” as a new recipe`);
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);

    await page.reload();
    await expect(dinnerField(page, "Thursday")).toHaveValue(name);
    // It is suggested on other days now, as a recipe.
    await dinnerField(page, "Friday").fill(name);
    await expect(page.getByRole("option", { name, exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name: `Add “${name}” as a new recipe`, exact: true })).toHaveCount(0);

    await page.goto("/recipes");
    await page.getByRole("heading", { name, exact: true }).click();
    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
  });

  test("leaving the field with a name that is no recipe keeps it as a one-off dinner", async ({ page }) => {
    await page.goto("/?week=2027-03-01");
    const field = dinnerField(page, "Friday");
    const title = unique("Left-over soup");
    await field.fill(title);
    await afterServerAction(page, () => page.keyboard.press("Tab"));

    await expect(field).toHaveValue(title);
    await page.reload();
    await expect(dinnerField(page, "Friday")).toHaveValue(title);
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);
    // It is no recipe.
    await page.goto("/recipes");
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
  });

  test("Enter plans a name that is no recipe as a one-off dinner and closes the list", async ({ page }) => {
    await page.goto("/?week=2027-03-08");
    const field = dinnerField(page, "Saturday");
    const title = unique("Picnic");
    await field.fill(title);
    await expect(page.getByRole("option", { name: `Plan “${title}” for this day only`, exact: true })).toBeVisible();
    await afterServerAction(page, () => page.keyboard.press("Enter"));

    await expect(page.getByRole("option")).toHaveCount(0);
    await expect(field).toBeFocused();
    await page.reload();
    await expect(dinnerField(page, "Saturday")).toHaveValue(title);
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);
  });

  test("a click outside the field plans the typed name, and Escape twice puts the planned dinner back", async ({ page }) => {
    await page.goto("/?week=2027-03-15");
    const title = unique("Tacos");
    await planOnce(page, "Monday", title);

    const field = dinnerField(page, "Monday");
    await field.fill(unique("Typo"));
    await page.keyboard.press("Escape");
    await page.keyboard.press("Escape");
    await expect(field).toHaveValue(title);

    const other = unique("Burgers");
    await field.fill(other);
    await afterServerAction(page, () => page.getByRole("heading", { name: "Monday" }).click());
    await expect(field).toHaveValue(other);
    await page.reload();
    await expect(dinnerField(page, "Monday")).toHaveValue(other);
  });

  test("Clear day after typing over the dinner discards the typed text, and Undo brings back the planned dinner", async ({ page }) => {
    await page.goto("/?week=2027-03-29");
    const title = unique("Risotto");
    await planOnce(page, "Wednesday", title);

    const field = dinnerField(page, "Wednesday");
    await field.fill("Soup");
    await afterServerAction(page, () => dayCard(page, "Wednesday").getByRole("button", { name: "Clear day" }).click());
    await expect(field).toHaveValue("");
    await afterServerAction(page, () => page.getByRole("button", { name: "Undo clearing Wednesday" }).click());
    await expect(field).toHaveValue(title);
  });

  test("leaving the field with a recipe's exact name plans that recipe", async ({ page }) => {
    const name = unique("Ramen");
    await createRecipe(page, { name, ingredients: [{ quantity: "2", name: "Noodle nests" }] });

    await page.goto("/?week=2027-08-16");
    await dinnerField(page, "Monday").fill(name.toUpperCase());
    await afterServerAction(page, () => page.keyboard.press("Tab"));

    await page.reload();
    await expect(dinnerField(page, "Monday")).toHaveValue(name);
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);
  });

  test("focus stays on the servings after leaving the dinner field switches the recipe", async ({ page }) => {
    const first = unique("Pho");
    const second = unique("Bibimbap");
    await createRecipe(page, { name: first, ingredients: [{ quantity: "1", name: "Rice noodles" }] });
    await createRecipe(page, { name: second, ingredients: [{ quantity: "1", name: "Rice" }] });

    await page.goto("/?week=2027-08-23");
    await planRecipe(page, "Wednesday", first);
    const field = dinnerField(page, "Wednesday");
    await field.fill(second.toLowerCase());
    // Tab leaves the field for the servings, and the exact name saves the recipe.
    await afterServerAction(page, () => page.keyboard.press("Tab"));

    await expect(field).toHaveValue(second);
    await expect(dayCard(page, "Wednesday").getByLabel("Serves", { exact: true })).toBeFocused();
    await page.reload();
    await expect(dinnerField(page, "Wednesday")).toHaveValue(second);
  });

  test("a saved one-off dinner does not take focus when the week opens", async ({ page }) => {
    await page.goto("/?week=2027-03-08");
    const title = unique("Picnic");
    await planOnce(page, "Saturday", title);

    await page.reload();
    await expect(dinnerField(page, "Saturday")).toHaveValue(title);
    await expect(page.locator("body")).toBeFocused();
  });

  test("changes the servings and the note of a planned day", async ({ page }) => {
    const name = unique("Curry");
    await createRecipe(page, { name, ingredients: [{ quantity: "400", unit: "ml", name: "Coconut milk" }] });

    await page.goto("/?week=2027-01-18");
    await planRecipe(page, "Wednesday", name);
    await setServings(page, "Wednesday", 5);
    const note = dayCard(page, "Wednesday").getByPlaceholder("Note (optional)");
    await note.fill("Make it spicy");
    await afterServerAction(page, () => note.blur());

    await page.reload();
    const card = dayCard(page, "Wednesday");
    await expect(card.getByLabel("Serves", { exact: true })).toHaveValue("5");
    await expect(card.getByPlaceholder("Note (optional)")).toHaveValue("Make it spicy");
    await expect(dinnerField(page, "Wednesday")).toHaveValue(name);
  });

  test("clears a day", async ({ page }) => {
    const name = unique("Tacos");
    await createRecipe(page, { name, ingredients: [{ quantity: "8", name: "Tortillas" }] });

    await page.goto("/?week=2027-01-25");
    await planRecipe(page, "Thursday", name);
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);

    const card = dayCard(page, "Thursday");
    await afterServerAction(page, () => card.getByRole("button", { name: "Clear day" }).click());
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);
    await expect(dinnerField(page, "Thursday")).toHaveValue("");
    await expect(card.getByLabel("Serves", { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(dinnerField(page, "Thursday")).toHaveValue("");
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);
  });

  test("opens the planned recipe from its day card", async ({ page }) => {
    const name = unique("Ramen");
    await createRecipe(page, { name, ingredients: [{ quantity: "2", name: "Noodle nests" }] });

    await page.goto("/?week=2027-03-01");
    await planRecipe(page, "Friday", name);
    const link = dayCard(page, "Friday").getByRole("link", { name: "View recipe for Friday" });
    await expect(link).toBeVisible();
    await expectAccessible(page);
    await link.click();

    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();

    // "Back to the plan" returns to the week the day belongs to, not to the current one.
    const back = page.getByRole("link", { name: "Back to the plan" });
    await expect(back).toHaveAttribute("href", "/?week=2027-03-01");
    await back.click();
    await expect(page).toHaveURL("/?week=2027-03-01");
    await expect(summary(page)).toHaveText("1 Mar – 7 Mar 2027 · 1 of 7 planned");
    await expect(dinnerField(page, "Friday")).toHaveValue(name);
  });

  test("clears the whole week only after asking", async ({ page }) => {
    const name = unique("Stew");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Carrot" }] });

    await page.goto("/?week=2027-05-24");
    await planRecipe(page, "Monday", name);
    await planRecipe(page, "Tuesday", name);
    await expect(summary(page)).toHaveText(/· 2 of 7 planned$/);

    await page.locator("summary", { hasText: /^Clear the whole week$/ }).click();
    await expect(page.getByRole("group", { name: "Remove 2 planned dinners from this week?" })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(summary(page)).toHaveText(/· 2 of 7 planned$/);

    await confirmAction(page, "Clear the whole week", "Clear week");
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);
    // The button is gone with the plan; the focus must not fall back to the top of the page.
    await expect(page.getByRole("heading", { level: 1, name: "Week plan" })).toBeFocused();
    await page.reload();
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);
  });

  test("undoes clearing a day, with its servings and note", async ({ page }) => {
    const name = unique("Frittata");
    await createRecipe(page, { name, ingredients: [{ quantity: "6", name: "Eggs" }] });

    await page.goto("/?week=2027-05-31");
    await planRecipe(page, "Monday", name);
    await setServings(page, "Monday", 5);
    const note = dayCard(page, "Monday").getByPlaceholder("Note (optional)");
    await note.fill("Use the chives");
    await afterServerAction(page, () => note.blur());

    const card = dayCard(page, "Monday");
    await afterServerAction(page, () => card.getByRole("button", { name: "Clear day" }).click());
    await expect(dinnerField(page, "Monday")).toHaveValue("");
    const undo = card.getByRole("button", { name: "Undo clearing Monday" });
    await expect(undo).toBeVisible();
    await expect(undo).toBeFocused();
    await expectAccessible(page);

    await afterServerAction(page, () => undo.click());
    await expect(dinnerField(page, "Monday")).toHaveValue(name);
    await expect(dinnerField(page, "Monday")).toBeFocused();
    await expect(card.getByLabel("Serves", { exact: true })).toHaveValue("5");
    await expect(card.getByPlaceholder("Note (optional)")).toHaveValue("Use the chives");
    await expect(undo).toHaveCount(0);

    await page.reload();
    await expect(dinnerField(page, "Monday")).toHaveValue(name);
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);
  });

  test("the offer to undo goes away once the day is planned elsewhere and the week is refreshed", async ({
    page,
    context,
  }) => {
    const mine = unique("Frittata");
    const theirs = unique("Leftovers");
    await createRecipe(page, { name: mine, ingredients: [{ name: "Eggs" }] });
    await page.goto("/?week=2027-07-12");
    await planRecipe(page, "Monday", mine);

    const card = dayCard(page, "Monday");
    await afterServerAction(page, () => card.getByRole("button", { name: "Clear day" }).click());
    const undo = card.getByRole("button", { name: "Undo clearing Monday" });
    await expect(undo).toBeVisible();

    const other = await context.newPage();
    await other.goto("/?week=2027-07-12");
    await planOnce(other, "Monday", theirs);

    // A save on another card of this week brings the newer plan along.
    await planRecipe(page, "Tuesday", mine);
    await expect(dinnerField(page, "Monday")).toHaveValue(theirs);
    await expect(undo).toHaveCount(0);
  });

  test("moves between weeks with the week query parameter", async ({ page }) => {
    const title = unique("Pizza night");
    // Any day of the week opens the week from its Monday.
    await page.goto("/?week=2027-02-03");
    await expect(summary(page)).toHaveText(/^1 Feb – 7 Feb 2027 · /);
    await expect(dayCard(page, "Monday")).toContainText("1 Feb");

    await planOnce(page, "Monday", title);

    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL("/?week=2027-02-08");
    await expect(summary(page)).toHaveText(/^8 Feb – 14 Feb 2027 · /);
    await expect(dinnerField(page, "Monday")).toHaveValue("");

    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL("/?week=2027-02-01");
    await expect(summary(page)).toHaveText("1 Feb – 7 Feb 2027 · 1 of 7 planned");
    await expect(dinnerField(page, "Monday")).toHaveValue(title);

    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL("/?week=2027-01-25");
    await expect(summary(page)).toHaveText(/^25 Jan – 31 Jan 2027 · /);
  });

  test("deleting a recipe clears the days that only pointed at it", async ({ page }) => {
    const name = unique("Goulash");
    const keep = unique("Soup");
    const id = await createRecipe(page, { name, ingredients: [{ quantity: "1", unit: "kg", name: "Beef" }] });
    await createRecipe(page, { name: keep, ingredients: [{ quantity: "2", name: "Leeks" }] });

    await page.goto("/?week=2027-02-15");
    await planRecipe(page, "Monday", name);
    await planRecipe(page, "Wednesday", name);
    await planRecipe(page, "Friday", keep);
    await expect(summary(page)).toHaveText(/· 3 of 7 planned$/);

    await page.goto(`/recipes/${id}`);
    await confirmAction(page, "Delete", "Delete recipe");
    await expect(page).toHaveURL("/recipes");

    await page.goto("/?week=2027-02-15");
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);
    for (const weekday of ["Monday", "Wednesday"]) {
      await expect(dinnerField(page, weekday)).toHaveValue("");
    }
    await expect(dinnerField(page, "Friday")).toHaveValue(keep);
    await dinnerField(page, "Monday").fill(name);
    await expect(page.getByRole("option", { name: `Add “${name}” as a new recipe`, exact: true })).toBeVisible();
    await expect(page.getByRole("option", { name, exact: true })).toHaveCount(0);

    await page.goto("/groceries?week=2027-02-15");
    await expect(page.getByRole("checkbox", { name: "Tick off Beef", exact: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Tick off Leeks", exact: true })).toBeVisible();
  });
});
