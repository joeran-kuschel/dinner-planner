import { describe, expect, it } from "vitest";
import { isCrossSite, readRequestedUrl } from "@/lib/recipe-import/request";

const request = (headers: Record<string, string> = {}) =>
  new Request("http://dinner.local/recipes/import", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ url: "https://example.com/recipe" }),
  });

describe("isCrossSite", () => {
  it.each([
    ["Sec-Fetch-Site: same-origin", { "sec-fetch-site": "same-origin" }],
    ["Sec-Fetch-Site: none (typed address)", { "sec-fetch-site": "none" }],
    ["an Origin that is this host", { origin: "http://dinner.local", host: "dinner.local" }],
    ["no browser headers at all (curl, the tests)", {}],
  ])("lets %s through", (_label, headers) => {
    expect(isCrossSite(request(headers))).toBe(false);
  });

  it.each([
    ["Sec-Fetch-Site: cross-site", { "sec-fetch-site": "cross-site" }],
    ["Sec-Fetch-Site: same-site", { "sec-fetch-site": "same-site" }],
    ["an Origin of another website", { origin: "https://evil.example", host: "dinner.local" }],
    ["an Origin on another port", { origin: "http://dinner.local:3000", host: "dinner.local" }],
    ["an Origin that is not an address", { origin: "null", host: "dinner.local" }],
  ])("stops %s", (_label, headers) => {
    expect(isCrossSite(request(headers))).toBe(true);
  });

  it("trusts Sec-Fetch-Site over a matching Origin", () => {
    expect(isCrossSite(request({ "sec-fetch-site": "cross-site", origin: "http://dinner.local", host: "dinner.local" }))).toBe(true);
  });

  it("falls back to the request's own address when there is no Host header", () => {
    expect(isCrossSite(request({ origin: "http://dinner.local" }))).toBe(false);
    expect(isCrossSite(request({ origin: "http://other.example" }))).toBe(true);
  });
});

describe("readRequestedUrl", () => {
  it("refuses a cross-site request with 403 before it reads the body", async () => {
    const result = await readRequestedUrl(request({ "sec-fetch-site": "cross-site" }));

    expect("refusal" in result && result.refusal.status).toBe(403);
    expect("refusal" in result && (await result.refusal.json())).toEqual({ ok: false, error: "blocked" });
  });

  it("reads the address of a same-origin request", async () => {
    expect(await readRequestedUrl(request({ "sec-fetch-site": "same-origin" }))).toEqual({ url: "https://example.com/recipe" });
  });
});
