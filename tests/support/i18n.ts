import type { I18n } from "@lingui/core";
import { CATALOGS } from "@/lib/i18n/catalogs";
import { createI18n, type Locale } from "@/lib/i18n/config";

/** An i18n instance with the real catalogs, as the app creates it. */
export function testI18n(locale: Locale = "en"): I18n {
  return createI18n(locale, CATALOGS[locale]);
}
