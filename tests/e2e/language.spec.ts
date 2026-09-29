import { expect, type Page, test } from "@playwright/test";
import {
  afterServerAction,
  createRecipe,
  expectAccessible,
  unique,
} from "@/tests/e2e/support/helpers";

// The interface in German, the switch between the languages without a page
// reload, and how the choice is remembered. Other specs run in English.

/** Switch the language with the switcher, waiting for the server's answer. */
async function switchTo(page: Page, language: "English" | "Deutsch") {
  await afterServerAction(page, () => page.getByRole("button", { name: language, exact: true }).click());
  await expect(page.getByRole("button", { name: language, exact: true })).toHaveAttribute("aria-pressed", "true");
}

/** Open pages in German, as after picking it once. */
async function useGerman(page: Page) {
  await page.context().addCookies([{ name: "locale", value: "de", url: "http://localhost:3100" }]);
}

test.describe("language", () => {
  test("starts in the browser's language when none was picked", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Essensplan");
    await expect(page.getByRole("button", { name: "Deutsch" })).toHaveAttribute("aria-pressed", "true");
    await context.close();
  });

  test("starts in English for a browser language the app does not have", async ({ browser }) => {
    const context = await browser.newContext({ locale: "fr-FR" });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dinner plan");
    await context.close();
  });

  test("switches without reloading the page and keeps what the user typed", async ({ page }) => {
    await page.goto("/recipes/new");
    // Survives only if the document is never reloaded.
    await page.evaluate(() => Object.assign(window, { __noReload: true }));
    const noReload = () => page.evaluate(() => (window as { __noReload?: boolean }).__noReload);
    await page.getByLabel("Name", { exact: true }).fill("Half-typed soup");
    await page.getByLabel("Amount for ingredient 1", { exact: true }).fill("1,5");

    await switchTo(page, "Deutsch");

    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Neues Rezept");
    await expect(page).toHaveTitle("Neues Rezept · Abendessen-Planer");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Half-typed soup");
    await expect(page.getByLabel("Menge für Zutat 1", { exact: true })).toHaveValue("1,5");
    expect(await noReload()).toBe(true);

    await switchTo(page, "English");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("New recipe");
    await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Half-typed soup");
    expect(await noReload()).toBe(true);
  });

  test("shows the week plan's dates and days in German", async ({ page }) => {
    await page.goto("/?week=2028-01-03");
    await switchTo(page, "Deutsch");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Essensplan");
    await expect(page).toHaveTitle("Abendessen-Planer");
    await expect(page.getByText(/^3\. Jan\. – 9\. Jan\. 2028 · 0 von 7 geplant$/)).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Montag" })).toBeVisible();
    await expect(page.getByText("3. Jan.", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Vorige Woche" })).toBeVisible();
  });

  test("keeps the keyboard focus on the switcher", async ({ page }) => {
    await page.goto("/recipes");
    const german = page.getByRole("button", { name: "Deutsch" });
    await german.focus();
    await afterServerAction(page, () => page.keyboard.press("Enter"));
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rezepte");
    await expect(german).toBeFocused();
  });

  test("remembers the choice across reloads and new pages", async ({ page, context }) => {
    await page.goto("/groceries");
    await switchTo(page, "Deutsch");

    const [cookie] = (await context.cookies()).filter((c) => c.name === "locale");
    expect(cookie).toMatchObject({ value: "de", path: "/", httpOnly: true, sameSite: "Lax" });
    // About a year.
    expect(cookie.expires * 1000 - Date.now()).toBeGreaterThan(360 * 86_400_000);

    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Einkaufsliste");
    await expect(page).toHaveTitle("Einkauf · Abendessen-Planer");

    const other = await context.newPage();
    await other.goto("/recipes/new");
    await expect(other.locator("html")).toHaveAttribute("lang", "de");
    await expect(other.getByRole("heading", { level: 1 })).toHaveText("Neues Rezept");
  });

  test("the picked language wins over the browser's", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();
    await page.goto("/");
    await switchTo(page, "English");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dinner plan");
    await context.close();
  });

  test("translates a validation error that is already shown", async ({ page }) => {
    await page.goto("/recipes/new");
    await page.getByLabel("Name", { exact: true }).fill(" ");
    await page.getByRole("button", { name: "Create recipe" }).click();
    const alert = page.getByRole("main").getByRole("alert");
    await expect(alert).toHaveText("Give the recipe a name.");

    await switchTo(page, "Deutsch");
    await expect(alert).toHaveText("Gib dem Rezept einen Namen.");
    await expect(page.getByRole("button", { name: "Rezept anlegen" })).toBeVisible();
  });

  test("works without JavaScript, through a normal form post", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-GB" });
    const page = await context.newPage();
    await page.goto("/recipes");
    await page.getByRole("button", { name: "Deutsch" }).click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Rezepte");
    await expect(page.locator("html")).toHaveAttribute("lang", "de");
    await context.close();
  });

  test("plans dinners and shows the grocery list in German", async ({ page }) => {
    const name = unique("Linsensuppe");
    const id = await createRecipe(page, {
      name,
      servings: 2,
      ingredients: [
        { quantity: "1.5", unit: "l", name: "Brühe" },
        { name: "Salz" },
      ],
    });
    await useGerman(page);

    await page.goto("/?week=2028-01-10");
    await expect(page.getByText(/0 von 7 geplant$/)).toBeVisible();
    await page.getByRole("combobox", { name: "Abendessen am Montag" }).fill(name);
    await afterServerAction(page, () => page.getByRole("option", { name, exact: true }).click());
    const tuesday = page.getByRole("combobox", { name: "Abendessen am Dienstag" });
    const once = unique("Reste");
    await tuesday.fill(once);
    await afterServerAction(page, () =>
      page.getByRole("option", { name: `„${once}“ nur für diesen Tag planen`, exact: true }).click(),
    );
    await expect(page.getByText(/2 von 7 geplant$/)).toBeVisible();

    await page.getByRole("link", { name: "Einkaufsliste für diese Woche" }).click();
    await expect(page.getByText(/aus 1 Rezept$/)).toBeVisible();
    await expect(page.getByRole("checkbox", { name: "Brühe abhaken" })).toBeVisible();
    await expect(page.getByText("1,5 l", { exact: true })).toBeVisible();
    await expect(page.getByText("nach Geschmack", { exact: true })).toBeVisible();

    await page.goto(`/recipes/${id}`);
    await expect(page.getByText("Für 2 Personen", { exact: false })).toBeVisible();
    // A label rather than a sentence, so no full stop after the abbreviated month ("10. Jan..").
    await expect(page.getByText(/^Geplant: Mo 10\. Jan\.$/)).toBeVisible();
  });

  test("every page passes axe in German, including contrast", async ({ page }) => {
    const name = unique("Gulasch");
    const id = await createRecipe(page, { name, ingredients: [{ quantity: "500", unit: "g", name: "Rind" }] });
    await useGerman(page);

    await page.goto("/?week=2028-01-17");
    await page.getByRole("combobox", { name: "Abendessen am Montag" }).fill(name);
    await afterServerAction(page, () => page.getByRole("option", { name, exact: true }).click());
    await page.getByRole("combobox", { name: "Abendessen am Dienstag" }).fill("Gul");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("option").first()).toBeVisible();
    await expectAccessible(page);
    await page.keyboard.press("Escape");

    for (const path of ["/recipes", `/recipes/${id}`, `/recipes/${id}/edit`, "/recipes/new", "/groceries?week=2028-01-17"]) {
      await page.goto(path);
      await expect(page.locator("html")).toHaveAttribute("lang", "de");
      await expectAccessible(page);
    }

    await page.goto("/recipes/new");
    await page.getByLabel("Name", { exact: true }).fill(" ");
    await page.getByRole("button", { name: "Rezept anlegen" }).click();
    await expect(page.getByRole("main").getByRole("alert")).toHaveText("Gib dem Rezept einen Namen.");
    await page.mouse.move(0, 0);
    await expectAccessible(page);
  });

  test("the German header fits a 320 px wide screen without scrolling sideways", async ({ page }) => {
    await useGerman(page);
    await page.setViewportSize({ width: 320, height: 640 });
    for (const path of ["/", "/groceries"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
      await expectAccessible(page);
    }
  });

  test("the page for a missing recipe is in German too", async ({ page }) => {
    await useGerman(page);
    const response = await page.goto("/recipes/does-not-exist");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { level: 1 })).toHaveText("Seite nicht gefunden");
    await expect(page).toHaveTitle("Abendessen-Planer");
    await expect(page.getByRole("link", { name: "Zurück zum Plan" })).toHaveAttribute("href", "/");
    await expectAccessible(page);
  });

  test("on a narrow screen, the keyboard goes from the switcher to the links", async ({ page }) => {
    await useGerman(page);
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto("/recipes/new");

    await page.getByRole("link", { name: "Abendessen-Planer" }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "English" })).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Diese Woche" })).toBeFocused();
  });

  // The scroll padding has to cover the sticky header at every width, in both
  // languages. Chromium centres a field it scrolls to on Tab, which hides the
  // question; Firefox and Safari align it to the top edge, as scrollIntoView
  // does here, and that is where scroll-padding-top decides.
  for (const { locale, width } of [
    { locale: "en", width: 320 },
    { locale: "en", width: 639 },
    { locale: "en", width: 640 },
    { locale: "en", width: 1280 },
    { locale: "de", width: 320 },
    { locale: "de", width: 375 },
    { locale: "de", width: 639 },
    { locale: "de", width: 640 },
    { locale: "de", width: 1280 },
  ]) {
    test(`a field scrolled to the top stays below the sticky header (${locale}, ${width} px)`, async ({ page }) => {
      await page.context().addCookies([{ name: "locale", value: locale, url: "http://localhost:3100" }]);
      await expectFieldBelowHeader(page, width);
    });
  }
});

/** Scroll the recipe form's name field to the top edge and check the header leaves it visible. */
async function expectFieldBelowHeader(page: Page, width: number) {
  await page.setViewportSize({ width, height: 640 });
  await page.goto("/recipes/new");
  const name = page.getByLabel(/^Name$/);
  await name.evaluate((field) => field.scrollIntoView({ block: "start" }));
  const header = await page.locator("header").first().boundingBox();
  const field = await name.boundingBox();
  expect(await page.evaluate(() => window.scrollY), "the page scrolled").toBeGreaterThan(0);
  expect(field!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
}
