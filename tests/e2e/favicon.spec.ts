import { expect, test } from "@/tests/e2e/support/test";

// The tab icon is the logo from the header: the tomato disc with the cloche (app/icon.svg).

test("the page links the logo as its icon, and the files are served", async ({ page, request }) => {
  await page.goto("/");
  const svg = await page.locator('link[rel="icon"][type="image/svg+xml"]').getAttribute("href");
  expect(svg).toContain("/icon");

  const icon = await request.get(svg!);
  expect(icon.ok()).toBe(true);
  expect(icon.headers()["content-type"]).toContain("image/svg+xml");
  const source = await icon.text();
  expect(source).toContain("#b8431f");
  expect(source).toContain("M7.5 23.5"); // the cloche's dome, not the old plate

  expect((await request.get("/favicon.ico")).ok()).toBe(true);
  const touch = await page.locator('link[rel="apple-touch-icon"]').getAttribute("href");
  expect((await request.get(touch!)).ok()).toBe(true);
});
