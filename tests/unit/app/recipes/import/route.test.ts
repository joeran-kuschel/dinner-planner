import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/recipes/import/route";
import { startRecipeSite } from "@/tests/support/recipe-site";

let site: Awaited<ReturnType<typeof startRecipeSite>>;
beforeAll(async () => {
  site = await startRecipeSite();
});
afterAll(() => site.close());
afterEach(() => vi.unstubAllEnvs());

const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }, signal?: AbortSignal) =>
  POST(
    new Request("http://localhost/recipes/import", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
      signal,
    }),
  );

describe("POST /recipes/import", () => {
  it("answers with the recipe form's values", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    const response = await post({ url: `${site.base}/recipe` });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, values: { name: "Lemon pancakes", servings: "4" } });
  });

  it("names the picture of the recipe, as an absolute address, or none", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    expect((await (await post({ url: `${site.base}/recipe-photo` })).json()).photoUrl).toBe(`${site.base}/photo.jpg`);
    expect((await (await post({ url: `${site.base}/recipe` })).json()).photoUrl).toBeNull();
  });

  it.each([
    ["no recipe on the page", "/plain", "no-recipe"],
    ["a page that does not exist", "/nothing-here", "unreachable"],
  ])("answers %s with its code, not an error status", async (_label, path, code) => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    const response = await post({ url: `${site.base}${path}` });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: false, error: code });
  });

  it("refuses this machine and private networks in the normal setup", async () => {
    for (const url of [`${site.base}/recipe`, "http://169.254.169.254/latest/meta-data/", "http://dinner-planner-db:5432/", "http://[::1]/"]) {
      const response = await post({ url });
      expect(await response.json(), url).toEqual({ ok: false, error: "blocked" });
    }
  });

  it("answers an invalid address with 400", async () => {
    const response = await post({ url: "ftp://example.com/" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid-url" });
  });

  it.each([
    ["not JSON", "{ nope"],
    ["JSON without a url", {}],
    ["a url that is no string", { url: 42 }],
    ["a list", [1, 2]],
  ])("answers %s with 400", async (_label, body) => {
    const response = await post(body);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ ok: false });
  });

  it("wants a JSON body, which also keeps other websites from posting to it without asking first", async () => {
    const wrong: Record<string, string>[] = [{ "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded" }, {}];
    for (const headers of wrong) {
      const response = await post("url=https://example.com", headers);
      expect(response.status, JSON.stringify(headers)).toBe(415);
    }
  });

  it("reads no more than an address needs: a large body is refused, whatever it claims to be", async () => {
    const big = { url: `https://example.com/${"a".repeat(5_000)}` };
    const response = await post(big);
    expect(response.status).toBe(413);
    // Also when the length header is missing or understated.
    const sneaky = await POST(
      new Request("http://localhost/recipes/import", {
        method: "POST",
        headers: { "content-type": "application/json", "content-length": "10" },
        body: JSON.stringify(big),
      }),
    );
    expect([400, 413]).toContain(sneaky.status);
    // A body at the limit's size but with a long address is still an invalid address, not a crash.
    expect((await post({ url: "https://example.com/" + "a".repeat(2_100) })).status).toBe(400);
  });

  it("stops the fetch when the request is cancelled", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    const controller = new AbortController();
    const result = post({ url: `${site.base}/slow` }, { "content-type": "application/json" }, controller.signal);
    setTimeout(() => controller.abort(), 100);
    expect(await (await result).json()).toEqual({ ok: false, error: "cancelled" });
  });

  it("never lets an unexpected failure through as an error page", async () => {
    vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1");
    const response = await post({ url: "http://127.0.0.1:1/" });
    expect(await response.json()).toEqual({ ok: false, error: "unreachable" });
  });
});
