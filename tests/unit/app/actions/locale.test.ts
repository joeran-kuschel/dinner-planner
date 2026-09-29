import { beforeEach, describe, expect, it, vi } from "vitest";
import { formData } from "@/tests/support/db";

const jar = vi.hoisted(() => ({ set: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

const { setLocale } = await import("@/app/actions/locale");

beforeEach(() => jar.set.mockClear());

describe("setLocale", () => {
  it.each(["en", "de"])("remembers %s for a year in a cookie only the server reads", async (locale) => {
    await setLocale(formData({ locale }));

    expect(jar.set).toHaveBeenCalledWith("locale", locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: true,
    });
  });

  it("accepts the value with surrounding whitespace", async () => {
    await setLocale(formData({ locale: " de " }));
    expect(jar.set).toHaveBeenCalledWith("locale", "de", expect.any(Object));
  });

  it.each([["fr"], ["DE"], [""], ["de; Path=/admin"]])("rejects %j without setting a cookie", async (locale) => {
    await expect(setLocale(formData({ locale }))).rejects.toThrow("setLocale: unknown `locale`");
    expect(jar.set).not.toHaveBeenCalled();
  });

  it("rejects a form without a language", async () => {
    await expect(setLocale(new FormData())).rejects.toThrow("setLocale");
    expect(jar.set).not.toHaveBeenCalled();
  });
});
