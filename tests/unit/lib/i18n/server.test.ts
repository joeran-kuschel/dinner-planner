import { beforeEach, describe, expect, it, vi } from "vitest";

const request = vi.hoisted(() => ({ cookie: undefined as string | undefined, acceptLanguage: null as string | null }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => (name === "locale" && request.cookie ? { value: request.cookie } : undefined) }),
  headers: async () => new Headers(request.acceptLanguage ? { "accept-language": request.acceptLanguage } : {}),
}));

// React's `cache` only memoizes inside a server request; outside one it calls through.
const { getLocale, getServerI18n } = await import("@/lib/i18n/server");

beforeEach(() => {
  request.cookie = undefined;
  request.acceptLanguage = null;
});

describe("getLocale", () => {
  it("uses the language the user picked", async () => {
    request.cookie = "de";
    request.acceptLanguage = "en-GB";
    expect(await getLocale()).toBe("de");
  });

  it("uses the browser's language when nothing was picked", async () => {
    request.acceptLanguage = "de-DE,de;q=0.9";
    expect(await getLocale()).toBe("de");
  });

  it("ignores a cookie naming a language the app does not have", async () => {
    request.cookie = "fr";
    request.acceptLanguage = "de";
    expect(await getLocale()).toBe("de");
  });

  it("falls back to English", async () => {
    expect(await getLocale()).toBe("en");
  });
});

describe("getServerI18n", () => {
  it("returns an instance active in the request's language", async () => {
    request.cookie = "de";
    const { i18n, locale } = await getServerI18n();
    expect(locale).toBe("de");
    expect(i18n.locale).toBe("de");
    expect(i18n.number(0.5)).toBe("0,5");
  });
});
