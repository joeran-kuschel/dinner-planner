import { type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import {
  createRecipe,
  expectAccessible,
  expectNoSidewaysScroll,
  openAddForm,
  planRecipe,
  tabTo,
  unique,
} from "@/tests/e2e/support/helpers";

// The management page for the shop sections (/groceries/categories). The database starts with the ten seeded sections in
// every test (the fixture puts them back), so each test works on a known list.

const PAGE = "/groceries/categories";
const WEEK = "2027-03-01";
const SEEDED = [
  "Fruit and vegetables",
  "Bakery",
  "Meat and fish",
  "Dairy and eggs",
  "Pasta, rice, etc.",
  "Pantry",
  "Herbs & spices",
  "Frozen",
  "Drinks",
  "Other",
];

const names = (page: Page) => page.getByRole("textbox", { name: /^Name \d+$/ });
const shown = (page: Page) => names(page).evaluateAll((fields) => fields.map((field) => (field as HTMLInputElement).value));
const expectOrder = (page: Page, order: string[]) => expect.poll(() => shown(page)).toEqual(order);
const nameField = (page: Page, n: number) => page.getByRole("textbox", { name: `Name ${n}`, exact: true });
const addField = (page: Page) => page.locator("#new-category");
const addButton = (page: Page) => page.locator("form", { has: addField(page) }).getByRole("button");
// Not `getByRole("alert")` alone: Next.js has an alert of its own (the route announcer).
const alert = (page: Page) => page.locator("p[role=alert]");
const moveUp = (page: Page, name: string) => page.getByRole("button", { name: `Move ${name} up`, exact: true });
const moveDown = (page: Page, name: string) => page.getByRole("button", { name: `Move ${name} down`, exact: true });
const saveButton = (page: Page, name: string) => page.getByRole("button", { name: `Save ${name}`, exact: true });
const deleteSummary = (page: Page, name: string) => page.locator(`summary[aria-label="Delete ${name}"]`);
const live = (page: Page) => page.locator('[aria-live="polite"]');

/**
 * Open the page and wait until React has taken it over. A click before that is a plain form post (the page works without a
 * script, and the no-JavaScript tests rely on it), which reloads the page and loses what only the script does: the focus
 * after a move and the announcements.
 */
async function open(page: Page) {
  await page.goto(PAGE);
  await page.waitForFunction(() => Object.keys(document.querySelector("ol") ?? {}).some((key) => key.startsWith("__reactFiber")));
}

async function add(page: Page, name: string) {
  await addField(page).fill(name);
  await addButton(page).click();
}

/** Open the delete question of a section and return the group that holds it and its confirm button. */
async function openDelete(page: Page, name: string) {
  await deleteSummary(page, name).click();
  const question = deleteSummary(page, name).locator("xpath=..").getByRole("group");
  await expect(question).toBeVisible();
  return question;
}

/** Sections inserted directly, with positions after Other's, so the page lists them last (the limit and the long-list tests). */
async function insertSections(database: import("pg").Client, schema: string, count: number) {
  for (let index = 0; index < count; index++) {
    await database.query(`INSERT INTO "${schema}"."GroceryCategory" (id, key, name, position) VALUES ($1, NULL, $2, $3)`, [
      `direct_${index}`,
      `Direct ${index}`,
      10 + index,
    ]);
  }
  await database.query(`UPDATE "${schema}"."GroceryCategory" SET position = $1 WHERE key = 'OTHER'`, [10 + count]);
}

test.describe("the grocery categories page", () => {
  test("is reached from the grocery list, titled and headed, with the ten starting sections", async ({ page }) => {
    await page.goto("/groceries");
    await page.getByRole("link", { name: "Edit categories", exact: true }).click();

    await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
    await expect(page).toHaveTitle("Grocery categories - Dinner Planner");
    await expect(page.getByRole("heading", { level: 1, name: "Grocery categories" })).toBeVisible();
    await expectOrder(page, SEEDED);
    // The label of a field is its name plus its place in the list, with the space a screen reader needs.
    await expect(nameField(page, 1)).toHaveValue("Fruit and vegetables");
    await expect(nameField(page, 10)).toHaveValue("Other");

    await page.getByRole("link", { name: "Grocery list", exact: true }).click();
    await expect(page).toHaveURL(/\/groceries$/);
  });

  test("adds a section just before Other, and keeps it after a reload", async ({ page }) => {
    await open(page);
    await add(page, "  Pet   food ");

    await expectOrder(page, [...SEEDED.slice(0, 9), "Pet food", "Other"]);
    await expect(alert(page)).toHaveCount(0);
    await expect(addField(page)).toHaveValue("");
    await page.reload();
    await expectOrder(page, [...SEEDED.slice(0, 9), "Pet food", "Other"]);
  });

  test("renames a section, and the new name shows in the recipe form and on the add-item form", async ({ page }) => {
    await open(page);
    await nameField(page, 6).fill("Cupboard");
    await saveButton(page, "Pantry").click();

    await expect(saveButton(page, "Cupboard")).toBeVisible();
    await expect(nameField(page, 6)).toHaveValue("Cupboard");

    await page.goto("/recipes/new");
    await expect(page.getByLabel("Category for ingredient 1", { exact: true }).getByRole("option", { name: "Cupboard", exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Category for ingredient 1", { exact: true }).getByRole("option", { name: "Pantry", exact: true })).toHaveCount(0);
  });

  test("moves a section up and down, and the keyboard focus stays on the button that was used", async ({ page }) => {
    await open(page);

    await moveUp(page, "Pantry").click();
    await expectOrder(page, ["Fruit and vegetables", "Bakery", "Meat and fish", "Dairy and eggs", "Pantry", "Pasta, rice, etc.", ...SEEDED.slice(6)]);
    await expect(moveUp(page, "Pantry")).toBeFocused();
    await expect(live(page)).toHaveText("Pantry moved to position 5 of 10");

    await moveDown(page, "Pantry").click();
    await expectOrder(page, SEEDED);
    await expect(moveDown(page, "Pantry")).toBeFocused();
    await expect(live(page)).toHaveText("Pantry moved to position 6 of 10");

    await page.reload();
    await expectOrder(page, SEEDED);
  });

  test("deletes a section after asking, moving its ingredients and list entries to Other, and says so", async ({ page }) => {
    const dish = unique("Peas");
    await createRecipe(page, { name: dish, ingredients: [{ quantity: "1", unit: "bag", name: "Garden peas", category: "Frozen" }] });
    await page.goto(`/?week=${WEEK}`);
    await planRecipe(page, "Monday", dish);
    await page.goto(`/groceries?week=${WEEK}`);
    await openAddForm(page);
    await page.getByRole("textbox", { name: "Item", exact: true }).fill("Ice cream");
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "Frozen" });
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByRole("region", { name: "Frozen (2)" })).toBeVisible();

    await open(page);
    const question = await openDelete(page, "Frozen");
    await expect(question).toHaveAccessibleName("Delete Frozen? Its 1 ingredient and 1 list entry move to Other.");
    await expectOrder(page, SEEDED); // asking deletes nothing
    await question.getByRole("button", { name: "Delete category", exact: true }).click();

    await expectOrder(page, SEEDED.filter((name) => name !== "Frozen"));
    await expect(live(page)).toHaveText("Frozen deleted");
    await expect(addField(page)).toBeFocused();

    await page.goto(`/groceries?week=${WEEK}`);
    const other = page.getByRole("region", { name: "Other (2)" });
    await expect(other.getByRole("checkbox", { name: "Tick off Garden peas", exact: false })).toBeVisible();
    await expect(other.getByRole("checkbox", { name: "Tick off Ice cream", exact: true })).toBeVisible();
    await expect(page.getByRole("region", { name: /^Frozen/ })).toHaveCount(0);
  });

  test.describe("refusals", () => {
    test("a name that is taken, in any case, is refused and put back in the field", async ({ page }) => {
      await open(page);
      await add(page, "bakery");

      await expect(alert(page)).toHaveText("There is already a category with that name.");
      await expect(addField(page)).toHaveValue("bakery");
      await expectOrder(page, SEEDED);
    });

  });

  test("works with the keyboard alone: add, move, delete", async ({ page }) => {
    await open(page);

    await tabTo(page, addField(page), 150);
    await page.keyboard.type("Pet food");
    await page.keyboard.press("Enter");
    await expectOrder(page, [...SEEDED.slice(0, 9), "Pet food", "Other"]);

    // The focus after a move is its own (failing) test above; here the keyboard finds the button again.
    await tabTo(page, moveUp(page, "Pet food"), 150);
    await page.keyboard.press("Enter");
    await expectOrder(page, [...SEEDED.slice(0, 8), "Pet food", "Drinks", "Other"]);
    await tabTo(page, moveUp(page, "Pet food"), 150);
    await page.keyboard.press("Space");
    await expectOrder(page, [...SEEDED.slice(0, 7), "Pet food", "Frozen", "Drinks", "Other"]);

    await tabTo(page, deleteSummary(page, "Pet food"), 150);
    await page.keyboard.press("Enter");
    const confirm = deleteSummary(page, "Pet food").locator("xpath=..").getByRole("button", { name: "Delete category", exact: true });
    await tabTo(page, confirm, 5);
    await page.keyboard.press("Enter");

    await expectOrder(page, SEEDED);
    await expect(addField(page)).toBeFocused();
    await expect(live(page)).toHaveText("Pet food deleted");
  });

  for (const colorScheme of ["light", "dark"] as const) {
    test.describe(`in ${colorScheme} mode`, () => {
      test.use({ colorScheme });

      test("passes the accessibility check: plain, with a refusal, and with a long list", async ({ page, database, server }) => {
        await open(page);
        await expectAccessible(page);

        await add(page, "bakery");
        await expect(alert(page)).toBeVisible();
        await expectAccessible(page);

        await insertSections(database, server.schema, 5);
        await open(page);
        await expect(names(page)).toHaveCount(15);
        await expectAccessible(page);
      });

      test("passes the accessibility check with a delete question open", async ({ page }) => {
        await open(page);
        await deleteSummary(page, "Bakery").click();
        await expect(deleteSummary(page, "Bakery").locator("xpath=..").getByRole("group")).toBeVisible();
        await expectAccessible(page);
      });

    });
  }

  test.describe("on a phone", () => {
    test.use({ hasTouch: true, isMobile: true, viewport: { width: 375, height: 667 } });

    test("fits the width, and every button and field is at least 44 px tall", async ({ page }) => {
      await open(page);
      expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);
      await expect(names(page)).toHaveCount(10);
      await expectNoSidewaysScroll(page, "the categories page");

      const controls = page.locator("main").locator("button:not([disabled]), summary, input:not([type=hidden])");
      const sizes = await controls.evaluateAll((elements) =>
        elements.map((element) => {
          const box = element.getBoundingClientRect();
          return { label: element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.id, width: box.width, height: box.height };
        }),
      );
      expect(sizes.length).toBeGreaterThan(30);
      for (const size of sizes) {
        expect(size.height, `${size.label} is ${size.height} px tall`).toBeGreaterThanOrEqual(44);
        expect(size.width, `${size.label} is ${size.width} px wide`).toBeGreaterThanOrEqual(44);
      }
      await expectAccessible(page);
    });

  });

  test.describe("in German", () => {
    test.use({ locale: "de-DE" });

    test("shows the page, the names and the question in German", async ({ page }) => {
      await open(page);
      await expect(page).toHaveTitle("Einkaufskategorien - Abendessen-Planer");
      await expect(page.getByRole("heading", { level: 1, name: "Einkaufskategorien" })).toBeVisible();
      await expect(page.getByRole("textbox", { name: "Name 2", exact: true })).toHaveValue("Backwaren");
      await expect(page.getByRole("textbox", { name: "Name 10", exact: true })).toHaveValue("Sonstiges");

      await page.locator('summary[aria-label="Backwaren löschen"]').click();
      await expect(page.getByRole("group", { name: "Backwaren löschen? Darunter ist nichts einsortiert." })).toBeVisible();
      await expectAccessible(page);
    });

  });

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("adds, renames, moves and deletes with plain form posts", async ({ page }) => {
      await page.goto(PAGE);
      await addField(page).fill("Pet food");
      await addButton(page).click();
      await expect(page).toHaveURL(new RegExp(`${PAGE}$`));
      await expectOrder(page, [...SEEDED.slice(0, 9), "Pet food", "Other"]);

      await nameField(page, 10).fill("Animals");
      await saveButton(page, "Pet food").click();
      await expectOrder(page, [...SEEDED.slice(0, 9), "Animals", "Other"]);

      await moveUp(page, "Animals").click();
      await expectOrder(page, [...SEEDED.slice(0, 8), "Animals", "Drinks", "Other"]);

      await deleteSummary(page, "Animals").click(); // a <details>: it opens without a script
      await deleteSummary(page, "Animals").locator("xpath=..").getByRole("button", { name: "Delete category", exact: true }).click();
      await expectOrder(page, SEEDED);
    });
  });
});
