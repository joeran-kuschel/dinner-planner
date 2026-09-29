/**
 * The languages the app speaks, and what client and server both need to know
 * about them. Server-only parts (reading the cookie, the catalogs) are in
 * `lib/i18n/server.ts`.
 */
import { type I18n, type Messages, setupI18n } from "@lingui/core";

export const LOCALES = ["en", "de"] as const;
export type Locale = (typeof LOCALES)[number];

/** Used when neither the cookie nor the browser names a language we have. */
export const DEFAULT_LOCALE: Locale = "en";

/** The cookie that remembers the language the user picked. */
export const LOCALE_COOKIE = "locale";

/** Each language in its own words, as the switcher shows it. */
export const LOCALE_NAMES: Record<Locale, string> = { en: "English", de: "Deutsch" };

/**
 * The regional variant used for dates and numbers. British English keeps the
 * day-before-month order ("28 Sep") the app had before it was translated.
 */
export const INTL_LOCALES: Record<Locale, string> = { en: "en-GB", de: "de-DE" };

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

/**
 * The best language for an `Accept-Language` header: the first of the
 * browser's languages, by preference, that we have ("de-AT" counts as "de").
 */
export function negotiateLocale(acceptLanguage: string | null | undefined): Locale {
  const ranked = (acceptLanguage ?? "")
    .split(",")
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const quality = q ? Number.parseFloat(q.slice(2)) : 1;
      return { language: tag.split("-")[0].toLowerCase(), quality: Number.isNaN(quality) ? 0 : quality, index };
    })
    .filter(({ quality }) => quality > 0)
    // Stable for equal weights: the header's own order decides.
    .sort((a, b) => b.quality - a.quality || a.index - b.index);
  return ranked.map(({ language }) => language).find(isLocale) ?? DEFAULT_LOCALE;
}

/** An i18n instance for one language, formatting dates and numbers regionally. */
export function createI18n(locale: Locale, messages: Messages): I18n {
  return setupI18n({ locale, locales: INTL_LOCALES[locale], messages: { [locale]: messages } });
}
