import { expect, test, type Page } from "@playwright/test";
import {
  afterServerAction,
  createRecipe,
  dayCard,
  dinnerField,
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

  test("plans a dinner that is no recipe for one day only", async ({ page }) => {
    const title = unique("Takeaway");
    await page.goto("/?week=2027-01-11");

    // Typing only suggests; nothing is saved until a suggestion is picked.
    await dinnerField(page, "Tuesday").fill(title);
    await expect(page.getByRole("option", { name: `Add “${title}” as a new recipe`, exact: true })).toBeVisible();
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);

    await planOnce(page, "Tuesday", title);
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);

    await page.reload();
    await expect(dinnerField(page, "Tuesday")).toHaveValue(title);
    await page.goto("/recipes");
    await expect(page.getByRole("heading", { name: title, exact: true })).toHaveCount(0);
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

  test("leaving the field with a name that is no recipe saves nothing", async ({ page }) => {
    await page.goto("/?week=2027-03-01");
    const field = dinnerField(page, "Friday");
    await field.fill(unique("Half-typed"));
    await page.keyboard.press("Tab");

    await expect(field).toHaveValue("");
    await page.reload();
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);
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

  // "Clear day" used to be the card's first submit button, so Enter in a text
  // field submitted the form through it and wiped the day.
  test("pressing Enter in the note saves it and keeps the day planned", async ({ page }) => {
    const name = unique("Gnocchi");
    await createRecipe(page, { name, ingredients: [{ quantity: "500", unit: "g", name: "Gnocchi" }] });

    await page.goto("/?week=2027-08-02");
    await planRecipe(page, "Tuesday", name);
    const note = dayCard(page, "Tuesday").getByPlaceholder("Note (optional)");
    await note.fill("Brown butter");
    await afterServerAction(page, () => note.press("Enter"));

    await page.reload();
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);
    await expect(dayCard(page, "Tuesday").getByPlaceholder("Note (optional)")).toHaveValue("Brown butter");
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

  test("a malformed week parameter falls back to the current week", async ({ page }) => {
    await page.goto("/");
    const currentWeek = (await summary(page).textContent())?.split(" · ")[0];
    expect(currentWeek).toBeTruthy();

    await page.goto("/?week=2027-02-31");
    await expect(summary(page)).toHaveText(new RegExp(`^${currentWeek} · `));
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
    await page.getByRole("button", { name: "Delete", exact: true }).click();
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
