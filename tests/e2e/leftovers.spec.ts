import type { Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { createRecipe, dayCard, expectAccessible, planRecipe, unique } from "@/tests/e2e/support/helpers";

// A week of its own, far from "today": Monday 2027-03-01, followed by 8 March.
const WEEK = "2027-03-01";

function leftoversCard(page: Page, weekday: string, from: string) {
  return page.getByRole("form", { name: `${weekday}: leftovers from ${from}` });
}

/** Make `weekday` the leftovers of the dinner called `dinner`, through the dialog. */
async function makeLeftovers(page: Page, weekday: string, dinner: string) {
  await dayCard(page, weekday).getByRole("button", { name: `Leftovers on ${weekday}` }).click();
  const dialog = page.getByRole("dialog", { name: `Leftovers on ${weekday}` });
  await dialog.getByRole("radio", { name: new RegExp(dinner) }).check();
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog).toBeHidden();
}

test.describe("leftovers", () => {
  test("a day eats the rest of an earlier dinner: one recipe on the grocery list, and a link back", async ({ page }) => {
    const name = unique("Chilli");
    await createRecipe(page, { name, ingredients: [{ quantity: "400", unit: "g", name: "Beans" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", name);

    await dayCard(page, "Wednesday").getByRole("button", { name: "Leftovers on Wednesday" }).click();
    const dialog = page.getByRole("dialog", { name: "Leftovers on Wednesday" });
    await expect(dialog.getByRole("radio", { name: new RegExp(name) })).toBeVisible();
    await expectAccessible(page);
    await dialog.getByRole("radio", { name: new RegExp(name) }).check();
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(dialog).toBeHidden();

    const card = leftoversCard(page, "Wednesday", "Monday");
    await expect(card).toBeVisible();
    // The empty card and its button are gone, so the new card takes the focus.
    await expect(card.getByText("Leftovers from Monday")).toBeFocused();
    await expect(page.getByText(/· 2 of 7 planned$/)).toBeVisible();
    await expect(page.getByRole("combobox", { name: "Dinner for Wednesday", exact: true })).toHaveCount(0);
    await expectAccessible(page);

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(page.getByText(/from 1 recipe$/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Tick off Beans", exact: true })).toHaveCount(1);
    await expect(page.getByText("400 g")).toBeVisible();

    await page.goto(`/?week=${WEEK}`);
    await card.getByRole("link", { name: `Go to ${name} on Monday` }).click();
    await expect(page).toHaveURL(new RegExp(`week=${WEEK}`));
  });

  test("reaches back into the previous week, with a link to the dinner there", async ({ page }) => {
    const name = unique("Stew");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Leek" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Sunday", name);

    await page.goto("/?week=2027-03-08");
    await makeLeftovers(page, "Monday", name);

    const card = leftoversCard(page, "Monday", "Sunday");
    await expect(card).toBeVisible();
    await card.getByRole("link", { name: `Go to ${name} on Sunday` }).click();
    await expect(page).toHaveURL(new RegExp(`week=${WEEK}`));
    await expect(page.getByRole("combobox", { name: "Dinner for Sunday", exact: true })).toHaveValue(name);
  });

  test("is offered on empty days only, and says when there is no dinner to eat again", async ({ page }) => {
    const name = unique("Dal");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Lentils" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Tuesday", name);

    await expect(page.getByRole("button", { name: "Leftovers on Tuesday" })).toHaveCount(0);
    await dayCard(page, "Monday").getByRole("button", { name: "Leftovers on Monday" }).click();
    const dialog = page.getByRole("dialog", { name: "Leftovers on Monday" });
    await expect(dialog.getByText("No dinner is planned in the six days before this one.")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(page.getByRole("button", { name: "Leftovers on Monday" })).toBeFocused();
  });

  test("clearing the dinner clears its leftovers days, and says so", async ({ page }) => {
    const name = unique("Curry");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Rice" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", name);
    await makeLeftovers(page, "Tuesday", name);
    await expect(leftoversCard(page, "Tuesday", "Monday")).toBeVisible();

    await dayCard(page, "Monday").getByRole("button", { name: "Clear day" }).click();

    await expect(page.getByText("Day cleared, and 1 leftovers day with it").first()).toBeVisible();
    await expect(leftoversCard(page, "Tuesday", "Monday")).toHaveCount(0);
    await expect(page.getByText(/· 0 of 7 planned$/)).toBeVisible();
  });

  test("clearing a leftovers day leaves the dinner, and the day can be planned again", async ({ page }) => {
    const name = unique("Pie");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Flour" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", name);
    await makeLeftovers(page, "Tuesday", name);

    await leftoversCard(page, "Tuesday", "Monday").getByRole("button", { name: "Clear day" }).click();

    await expect(leftoversCard(page, "Tuesday", "Monday")).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Dinner for Monday", exact: true })).toHaveValue(name);
    await expect(page.getByRole("combobox", { name: "Dinner for Tuesday", exact: true })).toHaveValue("");
  });
});
