import { expect, test } from "@/tests/e2e/support/test";

// The tab icon is the logo from the header: the tomato disc with the plate (app/icon.svg).

test("the page links the logo as its icon, and the files are served", async ({ page, request }) => {
  await page.goto("/");
  const svg = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  expect(svg).toContain("/icon");

  const icon = await request.get(svg!);
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  expect(await icon.text()).toContain("#b8431f");

  expect((await request.get("/favicon.ico")).ok()).toBe(true);
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(touch!)).ok()).toBe(true);
});
