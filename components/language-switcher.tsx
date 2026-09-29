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
      <div role="group" aria-label={t(i18n)`Language`} className="flex rounded-lg border border-border p-0.5">
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
                  ? "rounded-md bg-accent-soft px-2 py-1 text-xs font-medium text-foreground"
                  : "rounded-md px-2 py-1 text-xs text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
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
