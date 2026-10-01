import { expect, test } from "@/tests/e2e/support/test";

// The Kubernetes readiness probe, against the real production build.
test("the readiness probe answers 200 while the database is reachable, uncached", async ({ request }) => {
  const response = await request.get("/healthz");

  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers()["cache-control"] ?? "").not.toMatch(/s-maxage|max-age=[1-9]/);
});
