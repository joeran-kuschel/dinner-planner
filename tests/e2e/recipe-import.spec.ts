import { expect, test } from "@/tests/e2e/support/test";
import { expectAccessible } from "@/tests/e2e/support/helpers";
import { startRecipeSite } from "@/tests/support/recipe-site";

// "Add from a link" against a small recipe website that runs on this machine (the app's guard against private
// addresses is switched off for the test server only; see playwright.config.ts).

let site: Awaited<ReturnType<typeof startRecipeSite>>;
test.beforeAll(async () => {
  site = await startRecipeSite();
});
test.afterAll(() => site.close());

const dialog = (page: import("@playwright/test").Page) => page.getByRole("dialog", { name: "Add from a link" });
const importButton = (page: import("@playwright/test").Page) => page.getByRole("button", { name: "Import", exact: true });

test.describe("add a recipe from a link", () => {
  test("opens from the New recipe menu, fills the form for review and saves only on request", async ({ page }) => {
    await page.goto("/recipes");
    // The main part is still one click to the empty form; the arrow opens the other ways.
    await expect(page.getByRole("link", { name: "New recipe", exact: true })).toHaveAttribute("href", "/recipes/new");
    await page.locator("summary[aria-label='More ways to add a recipe']").click();
    await page.getByRole("link", { name: "Add from a link" }).click();

    await expect(page).toHaveURL("/recipes/new?import=1");
    await expect(dialog(page)).toBeVisible();
    await expect(page.getByLabel("Link to the recipe")).toBeFocused();
    await expectAccessible(page);

    await page.getByLabel("Link to the recipe").fill(`${site.base}/recipe`);
    await importButton(page).click();
    await expect(dialog(page)).toBeHidden();

    // The form is filled in and waiting; nothing is saved yet.
    const name = page.locator("#name");
    await expect(name).toHaveValue("Lemon pancakes");
    await expect(name).toBeFocused();
    await expect(page.getByText("Recipe imported. Check it, then press “Create recipe”.")).toBeVisible();
    await expect(page.getByLabel("Serves", { exact: true })).toHaveValue("4");
    await expect(page.getByLabel("Prep time (min)")).toHaveValue("20");
    await expect(page.getByLabel("Source", { exact: true })).toHaveValue(`${site.base}/recipe`);
    await expect(page.getByLabel("Name of ingredient 1", { exact: true })).toHaveValue("flour");
    await expect(page.getByLabel("Amount for ingredient 1", { exact: true })).toHaveValue("200");
    await expect(page.getByLabel("Unit for ingredient 1", { exact: true })).toHaveValue("g");
    await expect(page.getByLabel("Name of ingredient 4", { exact: true })).toHaveValue("salt");
    await expect(page.getByRole("button", { name: "Remove tag breakfast" })).toBeVisible();
    await expect(page.getByLabel("Method", { exact: true })).toHaveValue("Whisk everything.\nFry in a hot pan.");
    await expectAccessible(page);
    await page.goto("/recipes");
    await expect(page.getByText("Lemon pancakes")).toHaveCount(0);

    // Back on the form, the visitor changes what they like and saves.
    await page.goto("/recipes/new?import=1");
    await page.getByLabel("Link to the recipe").fill(`${site.base}/recipe`);
    await importButton(page).click();
    await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
    await page.locator("#name").fill("My lemon pancakes");
    await page.getByRole("button", { name: "Create recipe" }).click();

    await expect(page.getByRole("heading", { level: 1, name: "My lemon pancakes" })).toBeVisible();
    await expect(page.getByRole("link", { name: "source" })).toHaveAttribute("href", `${site.base}/recipe`);
    await expect(page.getByText("Serves 4 · 20 min")).toBeVisible();
    await expect(page.getByRole("list", { name: "Tags" }).getByRole("link")).toHaveText(["breakfast", "quick"]);
  });

  test("starts from the New recipe page too, with the button above the form", async ({ page }) => {
    await page.goto("/recipes/new");
    await expect(dialog(page)).toBeHidden();
    await page.getByRole("button", { name: "Add from a link" }).click();
    await expect(dialog(page)).toBeVisible();
    await page.getByLabel("Link to the recipe").fill(`${site.base}/moved`);
    await importButton(page).click();
    await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
    // A redirect leads to the page the recipe is on, which becomes the source.
    await expect(page.getByLabel("Source", { exact: true })).toHaveValue(`${site.base}/recipe`);
  });

  test("answers a problem inside the dialog, keeps it open and takes the next try", async ({ page }) => {
    await page.goto("/recipes/new?import=1");
    const field = page.getByLabel("Link to the recipe");
    const alert = dialog(page).getByRole("alert");

    // A typo is answered at once.
    await field.fill("lemon pancakes");
    await importButton(page).click();
    await expect(alert).toHaveText("Enter a web address starting with http:// or https://.");
    await expect(field).toBeFocused();
    await expect(dialog(page)).toBeVisible();
    await expectAccessible(page);

    // A page without a recipe, and one that is not there.
    await field.fill(`${site.base}/plain`);
    await importButton(page).click();
    await expect(alert).toContainText("No recipe was found on that page.");
    await field.fill(`${site.base}/nothing-here`);
    await importButton(page).click();
    await expect(alert).toHaveText("The page could not be fetched. Check the address and try again.");
    await expect(dialog(page)).toBeVisible();
    await expect(page.locator("#name")).toHaveValue("");

    // The next try works, and the message goes.
    await field.fill(`${site.base}/recipe`);
    await importButton(page).click();
    await expect(dialog(page)).toBeHidden();
    await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
  });

  test("shows that it is working, and Cancel stops the wait and gives the focus back", async ({ page }) => {
    await page.goto("/recipes/new");
    const opener = page.getByRole("button", { name: "Add from a link" });
    await opener.click();
    await page.getByLabel("Link to the recipe").fill(`${site.base}/slow`);
    await importButton(page).click();

    await expect(dialog(page).getByRole("status")).toHaveText("Fetching the page…");
    await expect(page.getByRole("button", { name: "Importing…" })).toBeVisible();
    await expectAccessible(page);

    // The browser tells the server the wait is over: the request is cancelled.
    const cancelled = page.waitForEvent("requestfailed", (request) => request.url().endsWith("/recipes/import"));
    await dialog(page).getByRole("button", { name: "Cancel" }).click();
    await cancelled;
    await expect(dialog(page)).toBeHidden();
    await expect(opener).toBeFocused();
    await expect(page.locator("#name")).toHaveValue("");
  });

  test("gives the focus to the page's button when the dialog was opened on arrival and is cancelled", async ({ page }) => {
    await page.goto("/recipes/new?import=1");
    await expect(dialog(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(page.getByRole("button", { name: "Add from a link" })).toBeFocused();
  });

  test("does not fetch for a link that comes from another website", async ({ request }) => {
    const link = `/recipes/new?from=${encodeURIComponent(`${site.base}/recipe`)}`;
    const own = await request.get(link);
    expect(await own.text()).toContain("Lemon pancakes");
    // The browser says where a navigation comes from; a cross-site one does not make the app fetch anything.
    const foreign = await request.get(link, { headers: { "sec-fetch-site": "cross-site" } });
    expect(foreign.status()).toBe(200);
    expect(await foreign.text()).not.toContain("Lemon pancakes");
    const typed = await request.get(link, { headers: { "sec-fetch-site": "none" } });
    expect(await typed.text()).toContain("Lemon pancakes");
  });

  test("keeps the focus inside while open, and Escape closes it", async ({ page }) => {
    await page.goto("/recipes/new");
    const opener = page.getByRole("button", { name: "Add from a link" });
    await opener.click();
    await expect(page.getByLabel("Link to the recipe")).toBeFocused();

    // Tab moves through the dialog (link field, Cancel, Import) and never to the page behind it; going back returns.
    const inside = dialog(page).locator(":focus");
    await page.keyboard.press("Tab");
    await expect(dialog(page).getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(importButton(page)).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(page.getByLabel("Link to the recipe")).toBeFocused();
    await expect(inside).toHaveCount(1);
    // The form behind the dialog cannot be reached: a click on it does not move the focus there.
    await page.locator("#name").click({ force: true, trial: false }).catch(() => undefined);
    await expect(page.locator("#name")).not.toBeFocused();
    await page.keyboard.press("Escape");
    await expect(dialog(page)).toBeHidden();
    await expect(opener).toBeFocused();
  });

  test("works in German", async ({ browser }) => {
    const context = await browser.newContext({ locale: "de-DE" });
    const page = await context.newPage();
    await page.goto("/recipes/new?import=1");
    const german = page.getByRole("dialog", { name: "Über einen Link hinzufügen" });
    await expect(german).toBeVisible();
    await page.getByLabel("Link zum Rezept").fill("kein link");
    await page.getByRole("button", { name: "Importieren", exact: true }).click();
    await expect(german.getByRole("alert")).toHaveText("Gib eine Webadresse ein, die mit http:// oder https:// beginnt.");
    await page.getByLabel("Link zum Rezept").fill(`${site.base}/plain`);
    await page.getByRole("button", { name: "Importieren", exact: true }).click();
    await expect(german.getByRole("alert")).toContainText("Auf dieser Seite wurde kein Rezept gefunden.");
    await page.getByLabel("Link zum Rezept").fill(`${site.base}/recipe`);
    await page.getByRole("button", { name: "Importieren", exact: true }).click();
    await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
    await expect(page.getByText("Rezept importiert. Prüfe es und wähle dann „Rezept anlegen“.")).toBeVisible();
    await context.close();
  });

  test.describe("without JavaScript", () => {
    test("asks for the link on the page itself, and fills the form from it", async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-GB" });
      const page = await context.newPage();
      await page.goto("/recipes/new?import=1");
      await expect(page.getByRole("heading", { level: 2, name: "Add from a link" })).toBeVisible();
      await page.getByRole("textbox", { name: "Link to the recipe" }).fill(`${site.base}/recipe`);
      await importButton(page).click();

      await expect(page).toHaveURL(/\/recipes\/new\?from=/);
      await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
      await expect(page.getByLabel("Name of ingredient 2", { exact: true })).toHaveValue("eggs");
      await expect(page.getByText("Recipe imported. Check it, then press “Create recipe”.")).toBeVisible();
      await context.close();
    });

    test("explains a failed import beside the same field", async ({ browser }) => {
      const context = await browser.newContext({ javaScriptEnabled: false, locale: "en-GB" });
      const page = await context.newPage();
      await page.goto(`/recipes/new?from=${encodeURIComponent(`${site.base}/plain`)}`);
      await expect(page.getByRole("alert")).toContainText("No recipe was found on that page.");
      await expect(page.getByRole("textbox", { name: "Link to the recipe" })).toHaveValue(`${site.base}/plain`);
      await expect(page.locator("#name")).toHaveValue("");

      await page.goto("/recipes/new?from=lemon");
      await expect(page.getByRole("alert")).toHaveText("Enter a web address starting with http:// or https://.");
      await context.close();
    });

    test("is not shown to a browser with JavaScript, which has the dialog", async ({ page }) => {
      await page.goto("/recipes/new?import=1");
      // No plain form (it would send `?from=`); the dialog is what asks for the link.
      await expect(page.locator('form[action="/recipes/new"]')).toHaveCount(0);
      await expect(dialog(page)).toBeVisible();
    });
  });
  test.describe("the recipe's photo", () => {
    const photoName = (page: import("@playwright/test").Page) =>
      page.getByLabel("Photo file").evaluate((input: HTMLInputElement) => (input.files?.[0] ? `${input.files[0].name} ${input.files[0].type}` : null));

    test("goes into the photo field, described with the recipe's name, and is saved with the recipe", async ({ page }) => {
      await page.goto("/recipes/new?import=1");
      await page.getByLabel("Link to the recipe").fill(`${site.base}/recipe-photo`);
      await importButton(page).click();

      await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
      await expect(page.getByText("Recipe and photo imported. Check them, then press “Create recipe”.")).toBeVisible();
      expect(await photoName(page)).toBe("lemon-pancakes.jpg image/jpeg");
      // The photo needs a description; the recipe's name is where it starts, and it is required as for any photo.
      const description = page.getByLabel(/^Description of the photo/);
      await expect(description).toHaveValue("Lemon pancakes");
      await expect(description).toHaveAttribute("required", "");
      await expectAccessible(page);

      await description.fill("A stack of lemon pancakes");
      await page.getByRole("button", { name: "Create recipe" }).click();
      const photo = page.getByRole("img", { name: "A stack of lemon pancakes" });
      await expect(photo).toBeVisible();
      // Saved like any upload: re-encoded, never served as it came in.
      const answer = await page.request.get((await photo.getAttribute("src"))!);
      expect(answer.headers()["content-type"]).toBe("image/webp");
    });

    for (const [page_, expected] of [
      ["recipe-photo-object", "lemon-pancakes.png image/png"],
      ["recipe-photo-list", "lemon-pancakes.webp image/webp"],
      ["recipe-photo-redirect", "lemon-pancakes.jpg image/jpeg"],
    ]) {
      test(`finds the picture however the page names it: ${page_}`, async ({ page }) => {
        await page.goto("/recipes/new?import=1");
        await page.getByLabel("Link to the recipe").fill(`${site.base}/${page_}`);
        await importButton(page).click();
        await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
        expect(await photoName(page)).toBe(expected);
      });
    }

    for (const page_ of ["recipe-photo-fake", "recipe-photo-svg", "recipe-photo-gif", "recipe-photo-missing", "recipe-photo-too-big"]) {
      test(`imports the recipe without the picture when it cannot be used: ${page_}`, async ({ page }) => {
        await page.goto("/recipes/new?import=1");
        await page.getByLabel("Link to the recipe").fill(`${site.base}/${page_}`);
        await importButton(page).click();

        await expect(dialog(page)).toBeHidden();
        await expect(page.locator("#name")).toHaveValue("Lemon pancakes");
        await expect(page.getByText("Recipe imported, but its photo could not be fetched.", { exact: false })).toBeVisible();
        expect(await photoName(page)).toBeNull();
        await expect(page.getByLabel(/^Description of the photo/)).toHaveValue("");
        await expect(page.getByLabel(/^Description of the photo/)).not.toHaveAttribute("required", "");
        await expect(page.locator("#name")).toBeFocused();
      });
    }

    test("a recipe without a picture imports as before", async ({ page }) => {
      await page.goto("/recipes/new?import=1");
      await page.getByLabel("Link to the recipe").fill(`${site.base}/recipe`);
      await importButton(page).click();
      await expect(page.getByText("Recipe imported. Check it, then press “Create recipe”.")).toBeVisible();
      expect(await photoName(page)).toBeNull();
    });

    test("Cancel stops the wait for the picture too, and imports nothing", async ({ page }) => {
      await page.goto("/recipes/new?import=1");
      await page.getByLabel("Link to the recipe").fill(`${site.base}/recipe-photo-slow`);
      await importButton(page).click();
      await expect(dialog(page).getByRole("status")).toHaveText("Fetching the photo…");

      await dialog(page).getByRole("button", { name: "Cancel" }).click();
      await expect(dialog(page)).toBeHidden();
      await expect(page.locator("#name")).toHaveValue("");
      expect(await photoName(page)).toBeNull();
    });

    test("is described in German", async ({ browser }) => {
      const context = await browser.newContext({ locale: "de-DE" });
      const page = await context.newPage();
      await page.goto("/recipes/new?import=1");
      await page.getByLabel("Link zum Rezept").fill(`${site.base}/recipe-photo`);
      await page.getByRole("button", { name: "Importieren", exact: true }).click();
      await expect(page.getByText("Rezept und Foto importiert. Prüfe sie und wähle dann „Rezept anlegen“.")).toBeVisible();
      await context.close();
    });
  });
});
