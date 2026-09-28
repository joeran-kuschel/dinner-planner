import { expect, test, type Page } from "@playwright/test";
import {
  afterServerAction,
  createRecipe,
  dayCard,
  planRecipe,
  setServings,
  unique,
} from "@/tests/e2e/support/helpers";

// Every test plans in a week of its own, far from "today", so tests neither
// depend on the clock nor on each other.
const CUSTOM_PLACEHOLDER = "Leftovers, takeaway, eating out…";

function summary(page: Page) {
  return page.getByText(/ of 7 planned$/);
}

function dinnerSelect(page: Page, weekday: string) {
  return dayCard(page, weekday).getByLabel(`Dinner for ${weekday}`, { exact: true });
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
    await expect(dinnerSelect(page, "Monday").locator("option:checked")).toHaveText(name);
    await expect(dayCard(page, "Monday").getByLabel("Serves", { exact: true })).toHaveValue("2");
    await expect(dinnerSelect(page, "Tuesday").locator("option:checked")).toHaveText(
      "— nothing planned —",
    );
    await expect(summary(page)).toHaveText("4 Jan – 10 Jan 2027 · 1 of 7 planned");
  });

  test("plans a custom meal with “Something else…”", async ({ page }) => {
    const title = unique("Takeaway");
    await page.goto("/?week=2027-01-11");
    const card = dayCard(page, "Tuesday");

    // Choosing the option only reveals the title field; nothing is saved yet.
    await dinnerSelect(page, "Tuesday").selectOption({ label: "Something else…" });
    const titleField = card.getByPlaceholder(CUSTOM_PLACEHOLDER);
    await expect(titleField).toBeFocused();
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);

    await titleField.fill(title);
    await afterServerAction(page, () => page.keyboard.press("Tab"));
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);

    await page.reload();
    await expect(dinnerSelect(page, "Tuesday").locator("option:checked")).toHaveText(
      "Something else…",
    );
    await expect(dayCard(page, "Tuesday").getByPlaceholder(CUSTOM_PLACEHOLDER)).toHaveValue(title);
  });

  test("focus stays where the user tabbed to after a custom title is saved", async ({ page }) => {
    await page.goto("/?week=2027-03-01");
    const card = dayCard(page, "Friday");
    await dinnerSelect(page, "Friday").selectOption({ label: "Something else…" });
    await card.getByPlaceholder(CUSTOM_PLACEHOLDER).fill(unique("Eating out"));
    await afterServerAction(page, () => page.keyboard.press("Tab"));
    await expect(summary(page)).toHaveText(/· 1 of 7 planned$/);

    await expect(card.getByLabel("Serves", { exact: true })).toBeFocused();
  });

  test("a saved custom meal does not take focus when the week opens", async ({ page }) => {
    await page.goto("/?week=2027-03-08");
    await dinnerSelect(page, "Saturday").selectOption({ label: "Something else…" });
    await dayCard(page, "Saturday").getByPlaceholder(CUSTOM_PLACEHOLDER).fill(unique("Picnic"));
    await afterServerAction(page, () => page.keyboard.press("Tab"));

    await page.reload();
    await expect(dayCard(page, "Saturday").getByPlaceholder(CUSTOM_PLACEHOLDER)).toBeVisible();
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
    await expect(dinnerSelect(page, "Wednesday").locator("option:checked")).toHaveText(name);
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
    await expect(dinnerSelect(page, "Thursday").locator("option:checked")).toHaveText(
      "— nothing planned —",
    );
    await expect(card.getByLabel("Serves", { exact: true })).toHaveCount(0);

    await page.reload();
    await expect(dinnerSelect(page, "Thursday").locator("option:checked")).toHaveText(
      "— nothing planned —",
    );
    await expect(summary(page)).toHaveText(/· 0 of 7 planned$/);
  });

  test("moves between weeks with the week query parameter", async ({ page }) => {
    const title = unique("Pizza night");
    // Any day of the week opens the week from its Monday.
    await page.goto("/?week=2027-02-03");
    await expect(summary(page)).toHaveText(/^1 Feb – 7 Feb 2027 · /);
    await expect(dayCard(page, "Monday")).toContainText("1 Feb");

    await dinnerSelect(page, "Monday").selectOption({ label: "Something else…" });
    await dayCard(page, "Monday").getByPlaceholder(CUSTOM_PLACEHOLDER).fill(title);
    await afterServerAction(page, () => page.keyboard.press("Tab"));

    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL("/?week=2027-02-08");
    await expect(summary(page)).toHaveText(/^8 Feb – 14 Feb 2027 · /);
    await expect(dinnerSelect(page, "Monday").locator("option:checked")).toHaveText(
      "— nothing planned —",
    );

    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL("/?week=2027-02-01");
    await expect(summary(page)).toHaveText("1 Feb – 7 Feb 2027 · 1 of 7 planned");
    await expect(dayCard(page, "Monday").getByPlaceholder(CUSTOM_PLACEHOLDER)).toHaveValue(title);

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
      await expect(dinnerSelect(page, weekday).locator("option:checked")).toHaveText(
        "— nothing planned —",
      );
    }
    await expect(dinnerSelect(page, "Friday").locator("option:checked")).toHaveText(keep);
    await expect(dinnerSelect(page, "Monday").getByRole("option", { name, exact: true })).toHaveCount(0);

    await page.goto("/groceries?week=2027-02-15");
    await expect(page.getByRole("checkbox", { name: "Tick off Beef", exact: true })).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Tick off Leeks", exact: true })).toBeVisible();
  });
});
