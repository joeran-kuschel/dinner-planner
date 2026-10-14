import type { Browser } from "@playwright/test";
import { ACCESS_COOKIE, nowSeconds, signSession } from "@/lib/access";
import { E2E_ACCESS_KEY } from "../../playwright.config";
import { expect, test } from "@/tests/e2e/support/test";
import { expectAccessible } from "@/tests/e2e/support/helpers";

// The gate itself: these tests start with no access cookie at all (an empty storage state), where every other spec
// starts with a valid one.
const NO_ACCESS = { cookies: [], origins: [] };
test.use({ storageState: NO_ACCESS });

const accessCookie = async (page: { context(): { cookies(): Promise<{ name: string; value: string; httpOnly: boolean; sameSite: string }[]> } }) =>
  (await page.context().cookies()).find((cookie) => cookie.name === ACCESS_COOKIE);

async function open(browser: Browser, options: Parameters<Browser["newContext"]>[0] = {}) {
  const context = await browser.newContext({ storageState: NO_ACCESS, ...options });
  return { context, page: await context.newPage() };
}

test.describe("the access gate", () => {
  test("a browser without the cookie is told the planner needs its access link, and nothing else", async ({ page }) => {
    const response = await page.goto("/recipes");

    expect(response?.status()).toBe(401);
    await expect(page.getByRole("heading", { level: 1, name: "This planner needs its access link" })).toBeVisible();
    await expect(page.getByText("npm run k8s:access-link")).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
    await expectAccessible(page);
  });

  test("answers other requests with a plain 401, and leaves the readiness probe open", async ({ request }) => {
    const refused = await request.get("/recipes", { headers: { accept: "application/json" } });
    expect(refused.status()).toBe(401);
    expect(await refused.json()).toEqual({ error: "access-required" });
    expect(refused.headers()["www-authenticate"]).toBeUndefined();

    expect((await request.post("/recipes/import", { data: { url: "https://example.com" } })).status()).toBe(401);
    expect((await request.get("/recipes/anything/photo")).status()).toBe(401);
    expect((await request.get("/healthz")).status()).toBe(200);
  });

  test("the private link opens the planner and sets a cookie that is HttpOnly and lasts", async ({ page }) => {
    await page.goto(`/access#${E2E_ACCESS_KEY}`);

    await expect(page).toHaveURL("/");
    await expect(page.getByRole("heading", { level: 1, name: "Dinner plan" })).toBeVisible();
    // The key is gone from the address bar and from the history.
    expect(page.url()).not.toContain(E2E_ACCESS_KEY);
    const cookie = await accessCookie(page);
    expect(cookie).toMatchObject({ httpOnly: true, sameSite: "Lax" });
    expect(cookie!.value).not.toContain(E2E_ACCESS_KEY);

    await page.goto("/recipes");
    await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { level: 1, name: "Recipes" })).toBeVisible();
  });

  test("a wrong key says so, gives no cookie and leaves the gate shut", async ({ page }) => {
    await page.goto("/access#not-the-key");

    await expect(page.getByRole("alert")).toContainText("That link is not valid");
    expect(await accessCookie(page)).toBeUndefined();
    expect((await page.goto("/"))?.status()).toBe(401);
  });

  test("/access without a key goes on to the planner, which asks for the link", async ({ page }) => {
    const response = await page.goto("/access");

    await expect(page).toHaveURL("/");
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: "This planner needs its access link" })).toBeVisible();
  });

  test("a tampered cookie, one from another key and an expired one are all refused", async ({ page, context }) => {
    const valid = signSession(E2E_ACCESS_KEY, nowSeconds());
    const candidates = [
      `${valid.slice(0, -2)}xx`,
      signSession("another-key-0123456789abcdef", nowSeconds()),
      signSession(E2E_ACCESS_KEY, nowSeconds() - 400 * 24 * 60 * 60),
    ];
    for (const value of candidates) {
      await context.addCookies([{ name: ACCESS_COOKIE, value, domain: "localhost", path: "/" }]);
      expect((await page.goto("/"))?.status(), value).toBe(401);
    }
    await context.addCookies([{ name: ACCESS_COOKIE, value: valid, domain: "localhost", path: "/" }]);
    expect((await page.goto("/"))?.status()).toBe(200);
  });

  test("the pages are in German for a German browser, and the language the visitor picked wins", async ({ browser }) => {
    const { context, page } = await open(browser, { locale: "de-DE" });
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Dieser Planer braucht seinen Zugangslink" })).toBeVisible();
    await expect(page.locator("html")).toHaveAttribute("lang", "de");

    await context.addCookies([{ name: "locale", value: "en", domain: "localhost", path: "/" }]);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "This planner needs its access link" })).toBeVisible();
    await context.close();
  });

  test("without JavaScript the link page says what is needed", async ({ request }) => {
    // Playwright's "JavaScript off" keeps parsing <noscript> as hidden text, which no real browser with scripting off
    // does, so the markup the server sends is checked instead.
    const html = await (await request.get("/access", { headers: { accept: "text/html" } })).text();

    expect(html).toMatch(/<noscript><p class="error">This one-time step needs JavaScript\./);
  });

  test("another website cannot hand out the cookie", async ({ request }) => {
    const response = await request.post("/access", {
      data: { key: E2E_ACCESS_KEY },
      headers: { "sec-fetch-site": "cross-site", origin: "https://evil.example" },
    });

    expect(response.status()).toBe(403);
    expect(response.headers()["set-cookie"]).toBeUndefined();
  });
});
