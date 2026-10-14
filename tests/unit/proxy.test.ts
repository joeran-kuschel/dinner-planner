import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { proxy } from "@/proxy";
import { ACCESS_COOKIE, nowSeconds, RENEW_AFTER_SECONDS, signSession } from "@/lib/access";

const KEY = "p".repeat(43);

function request(path: string, init: { headers?: Record<string, string>; cookie?: string; method?: string } = {}) {
  const headers = new Headers(init.headers);
  if (init.cookie) headers.set("cookie", `${ACCESS_COOKIE}=${init.cookie}`);
  return new NextRequest(`https://dinner.local${path}`, { method: init.method ?? "GET", headers });
}
const PAGE = { accept: "text/html,application/xhtml+xml" };
const passes = (response: Response) => response.headers.get("x-middleware-next") === "1";

afterEach(() => vi.unstubAllEnvs());

describe("proxy with a key", () => {
  const valid = () => signSession(KEY, nowSeconds());
  const withKey = () => vi.stubEnv("ACCESS_KEY", KEY);

  it("lets a valid cookie through to any path, without touching the cookie", () => {
    withKey();
    for (const path of ["/", "/recipes", "/groceries?week=2027-01-04", "/recipes/abc/photo", "/_next/static/chunks/a.js"]) {
      const response = proxy(request(path, { cookie: valid() }));
      expect(passes(response), path).toBe(true);
      expect(response.headers.get("set-cookie"), path).toBeNull();
    }
  });

  it("lets a server action's POST through with the cookie, and refuses it without", () => {
    withKey();
    expect(passes(proxy(request("/", { method: "POST", cookie: valid(), headers: { "next-action": "abc" } })))).toBe(true);
    expect(proxy(request("/", { method: "POST", headers: { "next-action": "abc" } })).status).toBe(401);
  });

  it("answers a browser without the cookie with the access page: 401, HTML, never cached", async () => {
    withKey();

    const response = proxy(request("/recipes", { headers: PAGE }));

    expect(response.status).toBe(401);
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("www-authenticate")).toBeNull();
    const html = await response.text();
    expect(html).toContain("This planner needs its access link");
    expect(html).toContain('<html lang="en">');
  });

  it("speaks German to a German browser, and the picked language beats the browser's", async () => {
    withKey();

    const german = await proxy(request("/", { headers: { ...PAGE, "accept-language": "de-DE,de;q=0.9" } })).text();
    expect(german).toContain("Dieser Planer braucht seinen Zugangslink");
    expect(german).toContain('<html lang="de">');

    const picked = await proxy(request("/", { headers: { ...PAGE, "accept-language": "de-DE", cookie: "locale=en" } })).text();
    expect(picked).toContain("This planner needs its access link");
  });

  it("answers everything that is not a page request with a plain 401 and no prompt", async () => {
    withKey();
    for (const init of [
      { headers: { accept: "application/json" } },
      { headers: { accept: "*/*" } },
      { headers: PAGE, method: "POST" },
      {},
    ]) {
      const response = proxy(request("/recipes/import", init));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "access-required" });
      expect(response.headers.get("www-authenticate")).toBeNull();
    }
  });

  it("refuses a tampered cookie, one from another key and an expired one", () => {
    withKey();
    const stale = signSession(KEY, nowSeconds() - 400 * 24 * 60 * 60);
    for (const cookie of [`${valid().slice(0, -2)}xx`, signSession("other-key-0123456789abcdef", nowSeconds()), stale]) {
      expect(proxy(request("/", { cookie, headers: PAGE })).status, cookie).toBe(401);
    }
  });

  it("leaves /healthz (the probes) and /access (which hands the cookie out) open", () => {
    withKey();
    expect(passes(proxy(request("/healthz")))).toBe(true);
    expect(passes(proxy(request("/access", { headers: PAGE })))).toBe(true);
    expect(passes(proxy(request("/access", { method: "POST" })))).toBe(true);
    // Only exactly those paths: a path that merely starts with one is gated.
    expect(proxy(request("/healthz/anything")).status).toBe(401);
    expect(proxy(request("/access/other")).status).toBe(401);
  });

  it("renews a cookie that is more than a month old, as Secure over HTTPS, and not a younger one", () => {
    withKey();
    const old = signSession(KEY, nowSeconds() - RENEW_AFTER_SECONDS - 60);

    const renewed = proxy(request("/", { cookie: old, headers: { "x-forwarded-proto": "https" } }));
    const setCookie = renewed.headers.get("set-cookie") ?? "";

    expect(passes(renewed)).toBe(true);
    expect(setCookie).toContain(`${ACCESS_COOKIE}=v1.`);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/Secure/i);
    expect(setCookie).toMatch(/SameSite=lax/i);
    expect(setCookie).not.toContain(KEY);
    expect(proxy(request("/", { cookie: valid() })).headers.get("set-cookie")).toBeNull();
  });
});

describe("proxy without a key", () => {
  it("is open outside production", () => {
    expect(passes(proxy(request("/recipes", { headers: PAGE })))).toBe(true);
  });

  it("refuses everything in production, except what stays open, so a missing Secret never leaves the app open", async () => {
    vi.stubEnv("NODE_ENV", "production");

    const response = proxy(request("/recipes", { headers: PAGE }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "access-key-not-configured" });
    expect(passes(proxy(request("/healthz")))).toBe(true);
  });
});
