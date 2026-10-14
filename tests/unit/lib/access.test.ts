import { describe, expect, it } from "vitest";
import {
  accessMode,
  keyMatches,
  MIN_KEY_LENGTH,
  RENEW_AFTER_SECONDS,
  sessionCookieOptions,
  SESSION_SECONDS,
  signSession,
  verifySession,
} from "@/lib/access";

const KEY = "k".repeat(43);
const NOW = 1_800_000_000;

describe("accessMode", () => {
  it("is on when a key of enough length is set, whatever the environment", () => {
    expect(accessMode({ ACCESS_KEY: KEY, NODE_ENV: "production" })).toEqual({ mode: "on", key: KEY });
    expect(accessMode({ ACCESS_KEY: KEY, NODE_ENV: "development" })).toEqual({ mode: "on", key: KEY });
    expect(accessMode({ ACCESS_KEY: `  ${KEY}\n` })).toEqual({ mode: "on", key: KEY });
  });

  it("is off without a key outside production, so dev and tests need none", () => {
    expect(accessMode({})).toEqual({ mode: "off" });
    expect(accessMode({ NODE_ENV: "test" })).toEqual({ mode: "off" });
    expect(accessMode({ NODE_ENV: "development", ACCESS_KEY: "  " })).toEqual({ mode: "off" });
  });

  it("is unconfigured in production without a key: everything is refused, nothing is left open", () => {
    expect(accessMode({ NODE_ENV: "production" })).toEqual({ mode: "unconfigured" });
    expect(accessMode({ NODE_ENV: "production", ACCESS_KEY: "" })).toEqual({ mode: "unconfigured" });
  });

  it("refuses a key that is too short, in any environment", () => {
    const short = "x".repeat(MIN_KEY_LENGTH - 1);
    expect(accessMode({ ACCESS_KEY: short, NODE_ENV: "production" })).toEqual({ mode: "unconfigured" });
    expect(accessMode({ ACCESS_KEY: short, NODE_ENV: "development" })).toEqual({ mode: "unconfigured" });
  });
});

describe("signSession and verifySession", () => {
  it("accepts a fresh cookie, which does not need renewing", () => {
    expect(verifySession(signSession(KEY, NOW), KEY, NOW)).toEqual({ valid: true, renew: false });
  });

  it("does not contain the key", () => {
    expect(signSession(KEY, NOW)).not.toContain(KEY);
    expect(signSession(KEY, NOW)).toMatch(/^v1\.\d+\.[A-Za-z0-9_-]+$/);
  });

  it("expires after a year, to the second", () => {
    const cookie = signSession(KEY, NOW);

    expect(verifySession(cookie, KEY, NOW + SESSION_SECONDS - 1).valid).toBe(true);
    expect(verifySession(cookie, KEY, NOW + SESSION_SECONDS).valid).toBe(false);
    expect(verifySession(cookie, KEY, NOW + SESSION_SECONDS + 1).valid).toBe(false);
  });

  it("asks for a renewal once the cookie is older than a month, and not before", () => {
    const cookie = signSession(KEY, NOW);

    expect(verifySession(cookie, KEY, NOW + RENEW_AFTER_SECONDS - 1).renew).toBe(false);
    expect(verifySession(cookie, KEY, NOW + RENEW_AFTER_SECONDS + 1)).toEqual({ valid: true, renew: true });
  });

  it("refuses a cookie made with another key: changing the key logs everyone out", () => {
    expect(verifySession(signSession("another-key-0123456789abcdef", NOW), KEY, NOW).valid).toBe(false);
  });

  it("refuses a changed signature, a changed expiry and a changed version", () => {
    const [version, expires, signature] = signSession(KEY, NOW).split(".");

    expect(verifySession(`${version}.${expires}.${signature.slice(0, -1)}A`, KEY, NOW).valid).toBe(false);
    expect(verifySession(`${version}.${Number(expires) + 100000}.${signature}`, KEY, NOW).valid).toBe(false);
    expect(verifySession(`v2.${expires}.${signature}`, KEY, NOW).valid).toBe(false);
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["one part", "v1"],
    ["two parts", "v1.123"],
    ["four parts", "v1.123.abc.def"],
    ["a non-numeric expiry", "v1.soon.abc"],
    ["an enormous expiry", `v1.${"9".repeat(40)}.abc`],
    ["the key itself", KEY],
  ])("refuses a cookie that is %s", (_label, value) => {
    expect(verifySession(value, KEY, NOW)).toEqual({ valid: false, renew: false });
  });
});

describe("keyMatches", () => {
  it("is true for the key only", () => {
    expect(keyMatches(KEY, KEY)).toBe(true);
    expect(keyMatches(`${KEY}x`, KEY)).toBe(false);
    expect(keyMatches(KEY.slice(1), KEY)).toBe(false);
    expect(keyMatches("", KEY)).toBe(false);
  });
});

describe("sessionCookieOptions", () => {
  it("is HttpOnly, Lax and lasts a year, for the whole site", () => {
    expect(sessionCookieOptions(new Headers())).toEqual({
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      path: "/",
      maxAge: SESSION_SECONDS,
    });
  });

  it("is Secure when the ingress says the request came in over HTTPS", () => {
    expect(sessionCookieOptions(new Headers({ "x-forwarded-proto": "https" })).secure).toBe(true);
    expect(sessionCookieOptions(new Headers({ "x-forwarded-proto": "https, http" })).secure).toBe(true);
    expect(sessionCookieOptions(new Headers({ "x-forwarded-proto": "http" })).secure).toBe(false);
  });
});
