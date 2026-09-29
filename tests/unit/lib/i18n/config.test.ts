import { describe, expect, it } from "vitest";
import { CATALOGS } from "@/lib/i18n/catalogs";
import { createI18n, DEFAULT_LOCALE, isLocale, LOCALES, negotiateLocale } from "@/lib/i18n/config";

describe("isLocale", () => {
  it.each(["en", "de"])("accepts %s", (value) => expect(isLocale(value)).toBe(true));
  it.each(["fr", "EN", "de-DE", "", undefined, null, 1])("rejects %j", (value) => expect(isLocale(value)).toBe(false));
});

describe("negotiateLocale", () => {
  it.each([
    [null, "en"],
    ["", "en"],
    ["de", "de"],
    ["de-DE,de;q=0.9,en;q=0.8", "de"],
    ["de-AT", "de"],
    ["DE-ch", "de"],
    ["en-GB,en;q=0.9,de;q=0.8", "en"],
    ["fr-FR,fr;q=0.9,de;q=0.8,en;q=0.7", "de"],
    ["fr-FR,fr;q=0.9", "en"],
    ["en;q=0.5,de;q=0.9", "de"],
    ["de;q=0,en", "en"],
    ["*", "en"],
    ["de;q=abc, en", "en"],
  ])("picks the best language we have for %j: %s", (header, expected) => {
    expect(negotiateLocale(header)).toBe(expected);
  });

  it("falls back to the default language", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect(LOCALES).toContain(DEFAULT_LOCALE);
  });
});

describe("createI18n", () => {
  it("translates with the given catalog", () => {
    const i18n = createI18n("de", CATALOGS.de);
    expect(i18n.locale).toBe("de");
    expect(i18n._({ id: "missing", message: "Fallback" })).toBe("Fallback");
  });

  it("formats numbers regionally", () => {
    expect(createI18n("en", CATALOGS.en).number(1.5)).toBe("1.5");
    expect(createI18n("de", CATALOGS.de).number(1.5)).toBe("1,5");
  });
});
