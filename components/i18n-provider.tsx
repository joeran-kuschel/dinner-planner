"use client";

import type { Messages } from "@lingui/core";
import { I18nProvider } from "@lingui/react";
import { type ReactNode, useState } from "react";
import { createI18n, type Locale } from "@/lib/i18n/config";

/**
 * Gives client components the request's language. The root layout passes only
 * the active catalog; after a switch it passes the other one, and the
 * components below re-render in place, keeping their state and focus.
 */
export function I18nClientProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages: Messages;
  children: ReactNode;
}) {
  const [current, setCurrent] = useState(() => ({ locale, i18n: createI18n(locale, messages) }));
  if (current.locale !== locale) {
    setCurrent({ locale, i18n: createI18n(locale, messages) });
  }
  return <I18nProvider i18n={current.i18n}>{children}</I18nProvider>;
}
