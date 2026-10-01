"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { setLocale } from "@/app/actions/locale";
import { LOCALE_NAMES, LOCALES } from "@/lib/i18n/config";

/**
 * One button per language, each named in its own language. The action sets
 * the cookie and Next.js sends the page back re-rendered, so nothing reloads.
 */
export function LanguageSwitcher() {
  const { i18n } = useLingui();

  return (
    <form action={setLocale}>
      <div role="group" aria-label={t(i18n)`Language`} className="flex rounded-full bg-surface-muted p-1">
        {LOCALES.map((locale) => {
          const current = i18n.locale === locale;
          return (
            <button
              key={locale}
              type="submit"
              name="locale"
              value={locale}
              lang={locale}
              aria-pressed={current}
              className={
                current
                  ? "lang-btn rounded-full bg-surface px-3 text-xs font-bold text-foreground ring-2 ring-field"
                  : "lang-btn rounded-full px-3 text-xs font-semibold text-muted transition-colors hover:text-foreground"
              }
            >
              {LOCALE_NAMES[locale]}
            </button>
          );
        })}
      </div>
    </form>
  );
}
