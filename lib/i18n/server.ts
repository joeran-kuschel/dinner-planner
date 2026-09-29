/**
 * The request's language on the server.
 *
 * Every server component and page that shows text calls `getServerI18n()` and
 * translates with `t(i18n)` or `<Trans>`. Never use Lingui's global `i18n` (or
 * a bare `t` / `plural` macro) on the server: it is shared by all requests and
 * never activated, so it throws.
 */
import { setI18n } from "@lingui/react/server";
import { cookies, headers } from "next/headers";
import { cache } from "react";
import { CATALOGS } from "./catalogs";
import { createI18n, isLocale, LOCALE_COOKIE, negotiateLocale, type Locale } from "./config";

/** The language the user picked (cookie), else the browser's, else English. */
export const getLocale = cache(async (): Promise<Locale> => {
  const picked = (await cookies()).get(LOCALE_COOKIE)?.value;
  if (isLocale(picked)) return picked;
  return negotiateLocale((await headers()).get("accept-language"));
});

/**
 * The request's i18n instance and language, created once per request. The
 * instance is also handed to Lingui's server `<Trans>`, which is why every page
 * that shows text must call this first.
 */
export const getServerI18n = cache(async () => {
  const locale = await getLocale();
  const i18n = createI18n(locale, CATALOGS[locale]);
  setI18n(i18n);
  return { i18n, locale };
});
