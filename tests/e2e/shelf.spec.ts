import type { Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { afterServerAction, createRecipe, expectAccessible, planRecipe, unique } from "@/tests/e2e/support/helpers";

// The database is empty at the start of every test, so each one creates what it looks at.

const WEEK = "2027-12-13";

type Entry = { item: string; amount?: string; unit?: string; day: string; section?: string };

/** Add a purchase through the "Add to the shelf" form. */
async function addEntry(page: Page, { item, amount, unit, day, section }: Entry) {
  const form = page.getByRole("region", { name: "Add to the shelf" });
  await form.getByRole("textbox", { name: "Item", exact: true }).fill(item);
  await form.getByRole("textbox", { name: "Amount", exact: true }).fill(amount ?? "");
  await form.getByRole("textbox", { name: "Unit", exact: true }).fill(unit ?? "");
  await form.getByLabel(/^Bought on/).fill(day);
  if (section) await form.getByRole("combobox", { name: "Category" }).selectOption({ label: section });
  await form.getByRole("button", { name: "Add", exact: true }).click();
  await expect(form.getByRole("textbox", { name: "Item", exact: true })).toHaveValue("");
}

const section = (page: Page, name: string) => page.getByRole("region", { name: new RegExp(`^${name}`) });
const tick = (page: Page, name: string) => page.getByRole("checkbox", { name: `Tick off ${name}`, exact: true });

async function planSoup(page: Page) {
  const name = unique("Soup");
  await createRecipe(page, {
    name,
    ingredients: [
      { quantity: "200", unit: "g", name: "Rice" },
      { quantity: "1", unit: "tsp", name: "Salt" },
    ],
  });
  await page.goto(`/?week=${WEEK}`);
  await planRecipe(page, "Monday", name);
}

test.describe("on the shelf", () => {
  test("is in the main navigation, says what to do while empty and passes axe", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("navigation").getByRole("link", { name: "On the shelf", exact: true }).click();
    await expect(page).toHaveURL("/shelf");
    await expect(page.getByRole("heading", { level: 1, name: "On the shelf" })).toBeVisible();
    await expect(page.getByText(/^Nothing on the shelf yet\./)).toBeVisible();
    await expectAccessible(page);
  });

  test("keeps every purchase of the same name, with its day and amount, in its shop section", async ({ page }) => {
    await page.goto("/shelf");
    await addEntry(page, { item: "Milk", amount: "1.5", unit: "l", day: "2027-12-06", section: "Dairy and eggs" });
    await addEntry(page, { item: "milk", amount: "1", unit: "l", day: "2027-12-10", section: "Dairy and eggs" });
    await addEntry(page, { item: "Napkins", day: "2027-12-01" });

    const dairy = section(page, "Dairy and eggs");
    await expect(dairy.getByRole("heading", { level: 3 })).toHaveText(["milk"]);
    // Newest first.
    await expect(dairy.getByRole("listitem")).toHaveText([/1 l · bought 10 Dec 2027/, /1\.5 l · bought 6 Dec 2027/]);
    await expect(section(page, "Other").getByText("bought 1 Dec 2027", { exact: true })).toBeVisible();

    await page.reload();
    await expect(dairy.getByRole("listitem")).toHaveCount(2);
    await expectAccessible(page);
  });

  test("changes an entry and removes it after a question", async ({ page }) => {
    await page.goto("/shelf");
    await addEntry(page, { item: "Rice", amount: "500", unit: "g", day: "2027-12-06", section: "Pasta, rice, etc." });

    await page.getByLabel("Edit Rice, 6 Dec 2027").click();
    await page.getByRole("textbox", { name: "Amount", exact: true }).nth(1).fill("750");
    await page.getByRole("button", { name: "Save" }).click();
    await expect(section(page, "Pasta, rice").getByText("750 g · bought 6 Dec 2027")).toBeVisible();

    await page.getByLabel("Remove Rice, 6 Dec 2027").click();
    await page.getByRole("button", { name: "Remove", exact: true }).last().click();
    await expect(page.getByText(/^Nothing on the shelf yet\./)).toBeVisible();
  });

  test("a grocery line of something on the shelf says so, until it is ticked off", async ({ page }) => {
    await planSoup(page);
    await page.goto("/shelf");
    await addEntry(page, { item: "RICE", amount: "1", unit: "kg", day: "2027-12-06" });

    await page.goto(`/groceries?week=${WEEK}`);
    await expect(tick(page, "Rice")).toHaveAccessibleDescription(/On the shelf/);
    await expect(tick(page, "Salt")).not.toHaveAccessibleDescription(/On the shelf/);

    await tick(page, "Rice").click();
    await expect(tick(page, "Rice")).toBeChecked();
    await expect(page.getByRole("main").getByText(/On the shelf/)).toHaveCount(0);
  });

  test("a staple ticked off on the grocery list goes on the shelf without an amount, and off again when unticked", async ({ page }) => {
    await planSoup(page);
    await page.goto(`/groceries?week=${WEEK}`);
    await page.locator("summary", { hasText: /^Pantry staples/ }).click();
    await page.getByRole("combobox", { name: "Add a staple" }).fill("salt");
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    // The staple's line is hidden until it is asked for.
    await page.getByRole("link", { name: "Show the 1 hidden item" }).click();
    await expect(page.getByRole("link", { name: "Hide the pantry items again" })).toBeVisible();

    await afterServerAction(page, () => tick(page, "Rice").click());
    await afterServerAction(page, () => tick(page, "Salt").click());
    await expect(tick(page, "Salt")).toBeChecked();

    await page.goto("/shelf");
    const salt = page.getByRole("heading", { level: 3, name: "salt" }).locator("xpath=ancestor::div[2]");
    await expect(salt.getByText("Staple", { exact: true })).toBeVisible();
    await expect(salt.getByRole("listitem")).toHaveText([/^bought \d+ \w+ \d{4}/]);
    // Rice is no staple: ticking it puts nothing on the shelf.
    await expect(page.getByRole("heading", { level: 3, name: /rice/i })).toHaveCount(0);

    await page.goto(`/groceries?week=${WEEK}&pantry=show`);
    await afterServerAction(page, () => tick(page, "Salt").click());
    await expect(tick(page, "Salt")).not.toBeChecked();
    await page.goto("/shelf");
    await expect(page.getByText("No purchase noted. Ticking it off on the grocery list adds one.")).toBeVisible();
  });

  test("a staple can stop being one from the shelf, and its purchases stay", async ({ page }) => {
    await page.goto("/groceries");
    await page.locator("summary", { hasText: /^Pantry staples/ }).click();
    await page.getByRole("combobox", { name: "Add a staple" }).fill("salt");
    await page.getByRole("button", { name: "Add", exact: true }).last().click();
    await page.goto("/shelf");
    await addEntry(page, { item: "Salt", amount: "1", unit: "kg", day: "2027-12-06" });
    await expect(page.getByText("Staple", { exact: true })).toBeVisible();

    await page.getByLabel("Remove Salt from the staples").click();
    await page.getByRole("button", { name: "Remove staple" }).click();

    await expect(page.getByText("Staple", { exact: true })).toHaveCount(0);
    await expect(page.getByText("1 kg · bought 6 Dec 2027")).toBeVisible();
  });
});
