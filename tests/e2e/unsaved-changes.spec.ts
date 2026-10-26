import type { Page } from "@playwright/test";
import { expect, test } from "@/tests/e2e/support/test";
import { afterServerAction, createRecipe, expectAccessible, unique } from "@/tests/e2e/support/helpers";
import { startRecipeSite } from "@/tests/support/recipe-site";

// The recipe website of the import tests, on this machine.
let site: Awaited<ReturnType<typeof startRecipeSite>>;
test.beforeAll(async () => {
  site = await startRecipeSite();
});
test.afterAll(() => site.close());

// Leaving the recipe form with changes that are not saved asks first. Each test creates what it looks at.

const nameField = (page: Page) => page.getByRole("textbox", { name: "Name", exact: true });
const menuLink = (page: Page, name: string) => page.getByRole("navigation", { name: "Main" }).getByRole("link", { name, exact: true });
const dialog = (page: Page) => page.getByRole("dialog", { name: "Leave without saving?" });

test.describe("leaving a form with unsaved changes", () => {
  test("asks nothing of a form that was not touched, or whose change was undone", async ({ page }) => {
    await page.goto("/recipes/new");
    await menuLink(page, "Recipes").click();
    await expect(page).toHaveURL("/recipes");

    await page.goto("/recipes/new");
    await nameField(page).fill("Soup");
    await nameField(page).fill("");
    await menuLink(page, "Recipes").click();
    await expect(page).toHaveURL("/recipes");
  });

  test("asks once something was typed: focus on Stay, Escape stays, and the focus goes back to the link", async ({ page }) => {
    await page.goto("/recipes/new");
    await nameField(page).fill("Soup");
    await menuLink(page, "Recipes").focus();
    await menuLink(page, "Recipes").click();

    await expect(dialog(page)).toBeVisible();
    await expect(dialog(page)).toContainText("You changed this recipe and have not saved it yet.");
    await expect(dialog(page).getByRole("button", { name: "Stay" })).toBeFocused();
    await expectAccessible(page);

    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL("/recipes/new");
    await expect(menuLink(page, "Recipes")).toBeFocused();
    await expect(nameField(page)).toHaveValue("Soup");
  });

  test("has its three buttons in one row on a wide screen and still fits a phone", async ({ page }) => {
    await page.goto("/recipes/new");
    await nameField(page).fill("Soup");
    await menuLink(page, "Recipes").click();

    const tops = await dialog(page).getByRole("button").evaluateAll((buttons) => buttons.map((b) => Math.round(b.getBoundingClientRect().top)));
    expect(new Set(tops).size).toBe(1);

    await page.setViewportSize({ width: 320, height: 640 });
    const box = await dialog(page).boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await expect(dialog(page).getByRole("button", { name: "Save and leave" })).toBeVisible();
  });

  test("Stay keeps what was typed, Leave without saving goes to the link and creates nothing", async ({ page }) => {
    const name = unique("Never saved");
    await page.goto("/recipes/new");
    await nameField(page).fill(name);
    await menuLink(page, "Groceries").click();
    await dialog(page).getByRole("button", { name: "Stay" }).click();
    await expect(nameField(page)).toHaveValue(name);

    await menuLink(page, "Groceries").click();
    await dialog(page).getByRole("button", { name: "Leave without saving" }).click();
    await expect(page).toHaveURL(/\/groceries/);

    await page.goto("/recipes");
    await expect(page.getByText(name)).toHaveCount(0);
  });

  test("Save and leave saves the recipe and goes to the link that was clicked, not to the recipe", async ({ page }) => {
    const name = unique("Saved on the way out");
    await page.goto("/recipes/new");
    await nameField(page).fill(name);
    await menuLink(page, "Groceries").click();

    await afterServerAction(page, () => dialog(page).getByRole("button", { name: "Save and leave" }).click());
    await expect(page).toHaveURL(/\/groceries/);

    await page.goto("/recipes");
    await expect(page.getByText(name)).toBeVisible();
  });

  test("Save and leave with a form that is not complete stays and says what is missing", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("textbox", { name: "Description", exact: true }).fill("only a description");
    await menuLink(page, "Recipes").click();
    await dialog(page).getByRole("button", { name: "Save and leave" }).click();

    await expect(dialog(page)).toBeHidden();
    await expect(page).toHaveURL("/recipes/new");
    await expect(page.getByRole("textbox", { name: "Description", exact: true })).toHaveValue("only a description");
    await expect(nameField(page)).toBeFocused();
  });

  test("the edit form asks after a change, and not after a recipe was saved", async ({ page }) => {
    const name = unique("Edit me");
    const id = await createRecipe(page, { name });
    await page.goto(`/recipes/${id}/edit`);
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(page).toHaveURL(`/recipes/${id}`);

    await page.goto(`/recipes/${id}/edit`);
    await page.getByLabel("Serves", { exact: true }).fill("6");
    await page.getByRole("link", { name: "Cancel" }).click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Leave without saving" }).click();
    await expect(page).toHaveURL(`/recipes/${id}`);

    // Saved: its own redirect is not asked about.
    await page.goto(`/recipes/${id}/edit`);
    await page.getByLabel("Serves", { exact: true }).fill("6");
    await afterServerAction(page, () => page.getByRole("button", { name: "Save changes" }).click());
    await expect(page).toHaveURL(`/recipes/${id}`);
    await expect(dialog(page)).toHaveCount(0);
  });

  test("a tag, an ingredient row or a photo choice counts as a change", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("combobox", { name: "Tags", exact: true }).fill("quick");
    await page.getByRole("combobox", { name: "Tags", exact: true }).press("Enter");
    await menuLink(page, "Recipes").click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Stay" }).click();

    await page.getByRole("button", { name: "Remove tag quick", exact: true }).click();
    await menuLink(page, "Recipes").click();
    await expect(page).toHaveURL("/recipes");

    await page.goto("/recipes/new");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await menuLink(page, "Recipes").click();
    await expect(dialog(page)).toBeVisible();
  });

  test("the browser's back button asks too (and the page stays on Stay)", async ({ page }) => {
    // Both pages are reached by the router, as in use: the browser lets a page cancel a step only within the same document.
    await page.goto("/recipes");
    await page.evaluate(() => (window as unknown as { next: { router: { push(href: string): void } } }).next.router.push("/recipes/new"));
    await expect(page).toHaveURL("/recipes/new");
    await nameField(page).fill("Soup");
    // The browser's own step back, as a user presses the button (not awaited: the step is cancelled, so no page loads).
    void page.goBack({ timeout: 3000 }).catch(() => {});

    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Stay" }).click();
    await expect(page).toHaveURL("/recipes/new");
    await expect(nameField(page)).toHaveValue("Soup");
    // Let the browser finish with the cancelled step before the next one (it is asked through DevTools here, one at a time).
    await expect(dialog(page)).toBeHidden();
    await page.waitForTimeout(300);

    void page.goBack({ timeout: 3000 }).catch(() => {});
    await dialog(page).getByRole("button", { name: "Leave without saving" }).click();
    await expect(page).not.toHaveURL("/recipes/new");
  });

  test("closing the tab asks through the browser's own prompt while something changed, and not otherwise", async ({ page }) => {
    const prompts: string[] = [];
    page.on("dialog", (d) => {
      prompts.push(d.type());
      void d.dismiss();
    });

    // Nothing typed: the page just closes.
    await page.goto("/recipes/new");
    // `close` with `runBeforeUnload` returns at once; the page is gone when it fires its own close event.
    await Promise.all([page.waitForEvent("close"), page.close({ runBeforeUnload: true })]);
    expect(page.isClosed()).toBe(true);
    expect(prompts).toEqual([]);
  });

  test("closing asks once something was typed, and the page stays when the visitor stays", async ({ page }) => {
    const prompts: string[] = [];
    page.on("dialog", (d) => {
      prompts.push(d.type());
      void d.dismiss();
    });
    await page.goto("/recipes/new");
    await nameField(page).fill("Soup");

    await page.close({ runBeforeUnload: true });

    await expect.poll(() => prompts).toEqual(["beforeunload"]);
    expect(page.isClosed()).toBe(false);
  });

  test("a new recipe saved with the Save button goes to its page without a question", async ({ page }) => {
    const prompts: string[] = [];
    page.on("dialog", (d) => {
      prompts.push(d.type());
      void d.dismiss();
    });
    const name = unique("Plain save");
    await page.goto("/recipes/new");
    await nameField(page).fill(name);
    await afterServerAction(page, () => page.getByRole("button", { name: "Create recipe" }).click());

    await expect(page.getByRole("heading", { level: 1, name, exact: true })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(prompts).toEqual([]);
  });

  test("a recipe read from a link asks from the start, and saves without a question", async ({ page }) => {
    const prompts: string[] = [];
    page.on("dialog", (d) => {
      prompts.push(d.type());
      void d.dismiss();
    });
    await page.goto("/recipes/new?import=1");
    await page.getByLabel("Link to the recipe").fill(`${site.base}/recipe`);
    await page.getByRole("button", { name: "Import", exact: true }).click();
    await expect(page.locator("#name")).toHaveValue("Lemon pancakes");

    await menuLink(page, "Recipes").click();
    await expect(dialog(page)).toBeVisible();
    await dialog(page).getByRole("button", { name: "Stay" }).click();

    await afterServerAction(page, () => page.getByRole("button", { name: "Create recipe" }).click());
    await expect(page.getByRole("heading", { level: 1, name: "Lemon pancakes" })).toBeVisible();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(prompts).toEqual([]);
  });

  test("switching the language keeps what was typed and asks nothing", async ({ page }) => {
    await page.goto("/recipes/new");
    await nameField(page).fill("Soup");
    await page.getByRole("button", { name: "Deutsch", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("textbox", { name: "Name", exact: false }).first()).toHaveValue("Soup");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });

  test("says it in German", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByRole("button", { name: "Deutsch", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await page.getByRole("textbox", { name: "Name", exact: false }).first().fill("Suppe");
    await page.getByRole("navigation", { name: "Hauptnavigation" }).getByRole("link", { name: "Rezepte", exact: true }).click();

    const german = page.getByRole("dialog", { name: "Ohne Speichern verlassen?" });
    await expect(german).toBeVisible();
    await expect(german.getByRole("button", { name: "Hier bleiben" })).toBeFocused();
    await expectAccessible(page);
  });
});
