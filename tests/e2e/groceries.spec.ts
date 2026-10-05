import { type Locator, type Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import {
  createRecipe,
  expectAccessible,
  fillIngredients,
  groceryRow,
  openAddForm,
  planOnce,
  planRecipe,
  setServings,
  unique,
} from "@/tests/e2e/support/helpers";

// Each test works in a week of its own, so the list holds only its own lines.

test.describe("groceries", () => {
  test("counts distinct recipes and names no typed dinner when there is none", async ({ page }) => {
    const name = unique("Daal");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Lentils" }] });
    await page.goto("/?week=2027-05-03");
    await planRecipe(page, "Monday", name);
    await planRecipe(page, "Tuesday", name);

    await page.goto("/groceries?week=2027-05-03");
    await expect(page.getByText(/ · from \d+ recipes?/)).toHaveText("3 May – 9 May 2027 · from 1 recipe");
  });

  test("consolidates the week's recipes into one list scaled to the planned servings", async ({
    page,
  }) => {
    const risotto = unique("Risotto");
    const pilaf = unique("Pilaf");
    await createRecipe(page, {
      name: risotto,
      servings: 2,
      ingredients: [
        { quantity: "400", unit: "g", name: "Rice" },
        { quantity: "1", name: "Onion" },
        { name: "Salt" },
      ],
    });
    await createRecipe(page, {
      name: pilaf,
      servings: 4,
      ingredients: [
        { quantity: "200", unit: "g", name: "Rice" },
        { quantity: "1", name: "Salt" },
        { quantity: "2", unit: "cloves", name: "Garlic" },
      ],
    });

    await page.goto("/?week=2027-04-05");
    await planRecipe(page, "Monday", risotto);
    await setServings(page, "Monday", 3); // x1.5
    await planRecipe(page, "Tuesday", pilaf); // 2 of 4: x0.5
    // A one-off dinner adds nothing to the list.
    await planOnce(page, "Wednesday", unique("Eating out"));

    await page.getByRole("link", { name: "Grocery list for this week" }).click();
    await expect(page).toHaveURL("/groceries?week=2027-04-05");
    await expect(page.getByText(/ · from \d+ recipes?/)).toHaveText(
      "5 Apr – 11 Apr 2027 · from 2 recipes · 1 dinner without a recipe adds nothing",
    );

    await expect(page.getByRole("checkbox", { name: /^Tick off / })).toHaveCount(4);
    // 600 g + 100 g, merged by name and unit.
    await expect(groceryRow(page, "Rice")).toContainText("700 g");
    await expect(groceryRow(page, "Rice")).toContainText(risotto);
    await expect(groceryRow(page, "Rice")).toContainText(pilaf);
    await expect(groceryRow(page, "Onion")).toContainText(/1\.5$/);
    await expect(groceryRow(page, "Garlic")).toContainText("1 cloves");
    // One unquantified source makes the merged line "to taste".
    await expect(groceryRow(page, "Salt")).toContainText("to taste");
  });

  test("ticking an item persists across a reload", async ({ page }) => {
    const name = unique("Carrot salad");
    await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "3", name: "Carrots" },
        { quantity: "1", name: "Lemon" },
      ],
    });
    await page.goto("/?week=2027-04-12");
    await planRecipe(page, "Monday", name);

    await page.goto("/groceries?week=2027-04-12");
    const carrots = page.getByRole("checkbox", { name: "Tick off Carrots", exact: true });
    await expect(carrots).not.toBeChecked();
    // The box flips at once; the reload below shows what the server saved.
    await expect(carrots).toBeEnabled();
    await carrots.click();
    await expect(carrots).toBeChecked();
    await expect(page.getByRole("status").filter({ hasText: "1 of 2 ticked off" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Tick off Carrots", exact: true })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Tick off Lemon", exact: true })).not.toBeChecked();

    // Clicking a ticked line again puts it back on the list. The box is disabled until the page is
    // interactive, so a click right after the reload is never lost; once the save is through the
    // box must still show what was saved.
    const again = page.getByRole("checkbox", { name: "Tick off Carrots", exact: true });
    await expect(again).toBeEnabled();
    const saved = page.waitForResponse((response) => response.request().method() === "POST");
    await again.click();
    await saved;
    await expect(page.getByRole("status").filter({ hasText: "0 of 2 ticked off" })).toBeVisible();
    await expect(again).not.toBeChecked();
    await page.reload();
    await expect(page.getByRole("checkbox", { name: "Tick off Carrots", exact: true })).not.toBeChecked();
  });

  test("groups the list by shop section under headings, and a ticked item stays in its section", async ({ page }) => {
    const name = unique("Caprese");
    await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "3", name: "Tomatoes", category: "Fruit and vegetables" },
        { quantity: "250", unit: "g", name: "Mozzarella", category: "Dairy and eggs" },
        { quantity: "1", name: "Ciabatta", category: "Bakery" },
        { name: "Basil" },
      ],
    });
    await page.goto("/?week=2027-09-06");
    await planRecipe(page, "Monday", name);

    await page.goto("/groceries?week=2027-09-06");
    await expect(page.getByRole("heading", { level: 2 })).toHaveText([
      "Fruit and vegetables (1)",
      "Bakery (1)",
      "Dairy and eggs (1)",
      "Other (1)",
    ]);
    const produce = page.getByRole("region", { name: "Fruit and vegetables (1)" });
    await expect(produce.getByRole("checkbox", { name: "Tick off Tomatoes" })).toBeVisible();
    await expectAccessible(page);

    const dairy = page.getByRole("region", { name: "Dairy and eggs (1)" });
    await dairy.getByRole("checkbox", { name: "Tick off Mozzarella" }).click();
    // It stays in its section, still counted there; nothing moves.
    await expect(dairy.getByRole("checkbox", { name: "Tick off Mozzarella" })).toBeChecked();
    await expect(page.getByRole("heading", { name: /In the basket/ })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: "1 of 4 ticked off" })).toBeVisible();

    await page.reload();
    await expect(
      page.getByRole("region", { name: "Dairy and eggs (1)" }).getByRole("checkbox", { name: "Tick off Mozzarella" }),
    ).toBeChecked();
  });

  test("tapping a line's name ticks it, and no line moves", async ({ page }) => {
    const name = unique("Tray");
    await createRecipe(page, {
      name,
      ingredients: [{ name: "Apples" }, { name: "Bananas" }, { name: "Cherries" }],
    });
    await page.goto("/?week=2027-09-27");
    await planRecipe(page, "Monday", name);
    await page.goto("/groceries?week=2027-09-27");

    const order = () => page.getByRole("checkbox").evaluateAll((all) => all.map((box) => box.getAttribute("aria-label")));
    const before = await order();
    expect(before).toEqual(["Tick off Apples", "Tick off Bananas", "Tick off Cherries"]);

    // The name, not the box, and a line in the middle: the one most likely to move.
    await page.getByText("Bananas", { exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Tick off Bananas" })).toBeChecked();
    expect(await order()).toEqual(before);

    // The second line (the recipe) ticks it as well.
    await page.getByText(name, { exact: true }).first().click();
    await expect(page.getByRole("checkbox", { name: "Tick off Apples" })).toBeChecked();
    expect(await order()).toEqual(before);
  });

  test("keeps the add form closed above the list, and open while items are added", async ({ page }) => {
    const name = unique("Dal");
    await createRecipe(page, { name, ingredients: [{ quantity: "1", name: "Lentils" }] });
    await page.goto("/?week=2027-10-04");
    await planRecipe(page, "Monday", name);
    await page.goto("/groceries?week=2027-10-04");

    const details = page.locator("details", { has: page.locator("summary", { hasText: /^Add something else$/ }) });
    const summary = details.locator("summary");
    await expect(details).not.toHaveAttribute("open", "");
    await expect(details.getByRole("textbox", { name: "Item", exact: true })).toBeHidden();
    // Above the list, so a forgotten item does not need a scroll past everything.
    const top = async (locator: Locator) => {
      const box = await locator.boundingBox();
      if (!box) throw new Error("expected the element to be on the page");
      return box.y;
    };
    expect(await top(summary)).toBeLessThan(await top(page.getByRole("checkbox", { name: "Tick off Lentils" })));
    await expectAccessible(page);

    // It opens by itself, and stays open for the next item.
    await openAddForm(page);
    await expectAccessible(page);
    for (const item of [unique("Soap"), unique("Sponge")]) {
      await page.getByRole("textbox", { name: "Item", exact: true }).fill(item);
      await page.getByRole("button", { name: "Add", exact: true }).first().click();
      await expect(groceryRow(page, item)).toContainText("added by hand");
      await expect(details).toHaveAttribute("open", "");
      await expect(page.getByRole("textbox", { name: "Item", exact: true })).toHaveValue("");
    }

    // Another week starts closed, and so does a new visit.
    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL(/week=2027-10-11/);
    await expect(details).not.toHaveAttribute("open", "");
    await page.goto("/groceries?week=2027-10-04");
    await expect(details).not.toHaveAttribute("open", "");
  });

  test("calls the add form by its German name", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();
    await page.goto("/groceries?week=2027-10-11");
    await expect(page.locator("details summary", { hasText: /^Etwas anderes hinzufügen$/ })).toBeVisible();
    await context.close();
  });

  test("files a hand-added item under the chosen section", async ({ page }) => {
    const item = unique("Beer");
    await page.goto("/groceries?week=2027-09-13");
    await openAddForm(page);
    await page.getByRole("textbox", { name: "Item", exact: true }).fill(item);
    await page.getByLabel("Category", { exact: true }).selectOption({ label: "Drinks" });
    await page.getByRole("button", { name: "Add", exact: true }).click();

    await expect(page.getByRole("region", { name: "Drinks (1)" })).toContainText(item);
  });

  test("marks the mandatory item of the add form with an asterisk and explains it", async ({ page }) => {
    await page.goto("/groceries?week=2027-04-19");
    await openAddForm(page);
    await expect(page.getByText("* required")).toBeVisible();
    await expect(page.locator("label[for=label]").getByTitle("Required")).toBeVisible();
    await expectAccessible(page);
  });

  test("adds a manual item, keeps it after reload and removes it again", async ({ page }) => {
    const item = unique("Milk");
    await page.goto("/groceries?week=2027-04-19");
    await expect(page.getByText("Nothing to buy yet.", { exact: false })).toBeVisible();

    await openAddForm(page);
    await page.getByLabel("Amount", { exact: true }).fill("1,5");
    await page.getByLabel("Unit", { exact: true }).fill("l");
    await page.getByRole("textbox", { name: "Item", exact: true }).fill(item);
    await page.getByRole("button", { name: "Add", exact: true }).click();

    const row = groceryRow(page, item);
    await expect(row).toContainText("added by hand");
    await expect(row).toContainText("1.5 l");
    await expect(page.getByRole("textbox", { name: "Item", exact: true })).toHaveValue("");

    await page.reload();
    await expect(groceryRow(page, item)).toContainText("1.5 l");

    await page.getByRole("button", { name: `Remove ${item}`, exact: true }).click();
    await expect(groceryRow(page, item)).toHaveCount(0);
  });

  test("editing a planned recipe updates the list straight away", async ({ page }) => {
    const name = unique("Pasta");
    const id = await createRecipe(page, {
      name,
      servings: 2,
      ingredients: [{ quantity: "250", unit: "g", name: "Spaghetti" }],
    });
    await page.goto("/?week=2027-04-26");
    await planRecipe(page, "Friday", name);

    await page.goto("/groceries?week=2027-04-26");
    await expect(groceryRow(page, "Spaghetti")).toContainText("250 g");
    const spaghetti = page.getByRole("checkbox", { name: "Tick off Spaghetti", exact: true });
    await spaghetti.click();
    await expect(spaghetti).toBeChecked();

    await page.goto(`/recipes/${id}/edit`);
    await fillIngredients(page, [
      { quantity: "500", unit: "g", name: "Spaghetti" },
      { name: "Basil" },
    ]);
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page).toHaveURL(`/recipes/${id}`);

    await page.goto("/groceries?week=2027-04-26");
    await expect(groceryRow(page, "Spaghetti")).toContainText("500 g");
    // Same name and unit, so the tick carries over.
    await expect(page.getByRole("checkbox", { name: "Tick off Spaghetti", exact: true })).toBeChecked();
    await expect(groceryRow(page, "Basil")).toContainText("to taste");
  });

  test("moves between weeks with the week navigation, staying on the grocery list", async ({ page }) => {
    // Any day of the week opens the week from its Monday.
    await page.goto("/groceries?week=2027-05-12");
    await expect(page.getByText("10 May – 16 May 2027")).toBeVisible();

    await page.getByRole("link", { name: "Previous week" }).click();
    await expect(page).toHaveURL("/groceries?week=2027-05-03");
    await expect(page.getByText("3 May – 9 May 2027")).toBeVisible();

    await page.getByRole("link", { name: "Next week" }).click();
    await page.getByRole("link", { name: "Next week" }).click();
    await expect(page).toHaveURL("/groceries?week=2027-05-17");
    await expect(page.getByText("17 May – 23 May 2027")).toBeVisible();

    // The menu's "This week" opens the plan, so this one is named differently.
    await page.getByRole("link", { name: "This week's list" }).click();
    await expect(page).toHaveURL("/groceries");
    await expect(page.getByRole("heading", { level: 1, name: "Grocery list" })).toBeVisible();
  });

  test("still opens the plan of the week being shopped for", async ({ page }) => {
    await page.goto("/groceries?week=2027-05-19");
    await page.getByRole("link", { name: "Edit the plan" }).click();
    await expect(page).toHaveURL("/?week=2027-05-17");
  });
});

test.describe("on a touch screen", () => {
  test.use({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 844 } });

  test("every line is at least 44 px high, and a tap on it ticks it", async ({ page }) => {
    const name = unique("Thumb");
    await createRecipe(page, { name, ingredients: [{ name: "Beans" }, { name: "Corn", quantity: "2", unit: "cans" }] });
    await page.goto("/?week=2027-10-04");
    await planRecipe(page, "Monday", name);
    await page.goto("/groceries?week=2027-10-04");

    for (const label of ["Beans", "Corn"]) {
      const row = page.getByRole("checkbox", { name: `Tick off ${label}` }).locator("xpath=ancestor::label");
      const box = await row.boundingBox();
      expect(box?.height, label).toBeGreaterThanOrEqual(44);
    }
    const checkbox = await page.getByRole("checkbox", { name: "Tick off Beans" }).boundingBox();
    expect(Math.min(checkbox!.width, checkbox!.height)).toBeGreaterThanOrEqual(24);

    await page.getByText("Corn", { exact: true }).tap();
    await expect(page.getByRole("checkbox", { name: "Tick off Corn" })).toBeChecked();
    await expect(page.getByRole("checkbox", { name: "Tick off Beans" })).not.toBeChecked();
  });
});

test.describe("copy and print", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  async function planRisotto(page: Page, week: string) {
    const name = unique("Risotto");
    await createRecipe(page, {
      name,
      ingredients: [
        { quantity: "300", unit: "g", name: "Rice", category: "Pantry" },
        { quantity: "2", name: "Onion", category: "Fruit and vegetables" },
      ],
    });
    await page.goto(`/?week=${week}`);
    await planRecipe(page, "Monday", name);
    await page.goto(`/groceries?week=${week}`);
  }

  test("Copy list puts the open items on the clipboard and says so", async ({ page }) => {
    await planRisotto(page, "2027-11-01");
    await page.getByRole("checkbox", { name: "Tick off Onion", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Tick off Onion", exact: true })).toBeChecked();

    await page.getByRole("button", { name: "Copy list" }).click();

    await expect(page.getByRole("status").filter({ hasText: "Copied" })).toBeVisible();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    expect(copied).toBe("Grocery list · 1 Nov – 7 Nov 2027\n\nPantry\n- 300 g Rice");
    await expectAccessible(page);
  });

  test("the print view hides the page chrome and shows the list", async ({ page }) => {
    await planRisotto(page, "2027-11-08");
    await page.emulateMedia({ media: "print" });

    await expect(page.getByRole("heading", { level: 1, name: "Grocery list" })).toBeVisible();
    await expect(page.getByText("8 Nov – 14 Nov 2027")).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Tick off Rice", exact: true })).toBeVisible();
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Copy list" })).toBeHidden();
    await expect(page.getByRole("button", { name: "Print" })).toBeHidden();
    await expect(page.getByText("Add something else")).toBeHidden();
    await expect(page.getByText("Pantry staples")).toBeHidden();
  });

  test("the print view leaves out ticked lines and frames the list in nothing", async ({ page }) => {
    await planRisotto(page, "2027-11-15");
    await page.getByRole("checkbox", { name: "Tick off Rice", exact: true }).click();
    await expect(page.getByRole("checkbox", { name: "Tick off Rice", exact: true })).toBeChecked();
    await page.emulateMedia({ media: "print" });

    await expect(page.getByRole("checkbox", { name: "Tick off Rice", exact: true })).toBeHidden();
    const card = page.locator(".card").first();
    await expect(card).toHaveCSS("border-top-width", "0px");
    await expect(card).toHaveCSS("box-shadow", "none");
  });

  test("Print opens the browser's print dialog", async ({ page }) => {
    await planRisotto(page, "2027-11-15");
    await page.evaluate(() => {
      (window as unknown as { printed: number }).printed = 0;
      window.print = () => {
        (window as unknown as { printed: number }).printed++;
      };
    });
    await page.getByRole("button", { name: "Print" }).click();
    expect(await page.evaluate(() => (window as unknown as { printed: number }).printed)).toBe(1);
  });
});

test.describe("hand-added entries carried over", () => {
  // Three Mondays far from today; the entry is added in the first one.
  const [W1, W2, W3] = ["2027-06-07", "2027-06-14", "2027-06-21"];

  async function addItem(page: Page, week: string, item: string) {
    await page.goto(`/groceries?week=${week}`);
    await openAddForm(page);
    await page.getByRole("textbox", { name: "Item", exact: true }).fill(item);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(groceryRow(page, item)).toBeVisible();
  }

  const box = (page: Page, item: string) => page.getByRole("checkbox", { name: `Tick off ${item}`, exact: true });

  test("an unticked entry follows to the next weeks, marked, until it is ticked", async ({ page }) => {
    const item = unique("Soap");
    await addItem(page, W1, item);
    await expect(page.getByText(/^Added (last week|\d+ weeks ago)$/)).toHaveCount(0);

    await page.goto(`/groceries?week=${W2}`);
    await expect(box(page, item)).toBeVisible();
    await expect(box(page, item)).toHaveAccessibleDescription("Added last week");
    await expectAccessible(page);

    await page.goto(`/groceries?week=${W3}`);
    await expect(box(page, item)).toHaveAccessibleDescription("Added 2 weeks ago");

    await box(page, item).click();
    await expect(box(page, item)).toBeChecked();
    await page.reload();
    await expect(box(page, item)).toBeChecked();

    await page.goto(`/groceries?week=2027-06-28`);
    await expect(box(page, item)).toHaveCount(0);
    // The weeks before keep what they had.
    await page.goto(`/groceries?week=${W1}`);
    await expect(box(page, item)).not.toBeChecked();
    await page.goto(`/groceries?week=${W2}`);
    await expect(box(page, item)).not.toBeChecked();
  });

  test("a week the app was not opened in loses nothing", async ({ page }) => {
    const item = unique("Candles");
    await addItem(page, W1, item);

    await page.goto("/groceries?week=2027-08-02");

    await expect(box(page, item)).toBeVisible();
    await expect(box(page, item)).toHaveAccessibleDescription("Added 8 weeks ago");
  });

  test("deleting a carried entry removes it from this week on, and the earlier weeks keep it", async ({ page }) => {
    const item = unique("Wine");
    await addItem(page, W1, item);

    await page.goto(`/groceries?week=${W2}`);
    await page.getByRole("button", { name: `Remove ${item}`, exact: true }).click();
    await expect(box(page, item)).toHaveCount(0);

    await page.goto(`/groceries?week=${W3}`);
    await expect(box(page, item)).toHaveCount(0);
    await page.goto(`/groceries?week=${W1}`);
    await expect(box(page, item)).toBeVisible();

    // Adding it again in a later week starts over.
    await addItem(page, W3, item);
    await expect(box(page, item)).toBeVisible();
    await expect(groceryRow(page, item).getByText("added by hand")).toBeVisible();
    await expect(page.getByText("Added 2 weeks ago")).toHaveCount(0);
  });

  test("an entry ticked in its own week is not carried", async ({ page }) => {
    const item = unique("Tape");
    await addItem(page, W1, item);
    await box(page, item).click();
    await expect(box(page, item)).toBeChecked();

    await page.goto(`/groceries?week=${W2}`);

    await expect(box(page, item)).toHaveCount(0);
  });
});
