import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/recipes/import/photo/route";
import { startRecipeSite } from "@/tests/support/recipe-site";

let site: Awaited<ReturnType<typeof startRecipeSite>>;
beforeAll(async () => {
  site = await startRecipeSite();
});
afterAll(() => site.close());
afterEach(() => vi.unstubAllEnvs());

const post = (body: unknown, headers: Record<string, string> = { "content-type": "application/json" }, signal?: AbortSignal) =>
  POST(new Request("http://localhost/recipes/import/photo", { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body), signal }));

describe("POST /recipes/import/photo", () => {
  // The sample website runs on this machine, which the import refuses unless the test switch is on.
  beforeEach(() => vi.stubEnv("RECIPE_IMPORT_ALLOW_PRIVATE", "1"));

  it.each([
    ["/photo.jpg", "image/jpeg"],
    ["/photo.png", "image/png"],
    ["/photo.webp", "image/webp"],
    ["/photo-moved", "image/jpeg"],
  ])("hands over %s as %s, as bytes", async (path, type) => {
    const response = await post({ url: `${site.base}${path}` });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(type);
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("cache-control")).toBe("no-store");
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(bytes.length).toBe(Number(response.headers.get("content-length")));
    expect(bytes.length).toBeGreaterThan(100);
  });

  it.each([
    ["a page that only calls itself a picture", "/fake.jpg", "not-image"],
    ["an SVG", "/vector.svg", "not-image"],
    ["a GIF", "/photo.gif", "not-image"],
    ["a web page", "/recipe", "not-image"],
    ["a picture that is not there", "/nothing-here.jpg", "unreachable"],
    ["a picture over the size of a photo", "/too-big.jpg", "too-large"],
  ])("answers %s with a code, not with bytes", async (_label, path, code) => {
    const response = await post({ url: `${site.base}${path}` });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(await response.json()).toEqual({ ok: false, error: code });
  });

  it("refuses private addresses in the normal setup", async () => {
    vi.unstubAllEnvs();
    for (const url of [`${site.base}/photo.jpg`, "http://169.254.169.254/x.jpg", "http://[::1]/x.png"]) {
      expect(await (await post({ url })).json(), url).toEqual({ ok: false, error: "blocked" });
    }
  });

  it("answers an invalid address with 400", async () => {
    const response = await post({ url: "ftp://example.com/x.jpg" });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "invalid-url" });
  });

  it.each([
    ["not JSON", "{ nope"],
    ["JSON without a url", {}],
    ["a url that is no string", { url: 7 }],
  ])("answers %s with 400", async (_label, body) => {
    expect((await post(body)).status).toBe(400);
  });

  it("wants a JSON body and a small one", async () => {
    const wrong: Record<string, string>[] = [{ "content-type": "text/plain" }, { "content-type": "application/x-www-form-urlencoded" }, {}];
    for (const headers of wrong) expect((await post("url=x", headers)).status).toBe(415);
    expect((await post({ url: `https://example.com/${"a".repeat(5_000)}` })).status).toBe(413);
  });

  it("stops when the request is cancelled", async () => {
    const controller = new AbortController();
    const result = post({ url: `${site.base}/slow` }, { "content-type": "application/json" }, controller.signal);
    setTimeout(() => controller.abort(), 100);
    expect(await (await result).json()).toEqual({ ok: false, error: "cancelled" });
  });
});

