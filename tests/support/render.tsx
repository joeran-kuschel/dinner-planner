import { I18nProvider } from "@lingui/react";
import { render, type RenderOptions } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n/config";
import { testI18n } from "./i18n";

/**
 * Render a client component the way the layout provides it: inside Lingui's
 * provider, in English unless `locale` says otherwise. `rerender` keeps it.
 */
export function renderWithI18n(ui: ReactNode, { locale = "en", ...options }: RenderOptions & { locale?: Locale } = {}) {
  const i18n = testI18n(locale);
  return render(ui, { ...options, wrapper: ({ children }) => <I18nProvider i18n={i18n}>{children}</I18nProvider> });
}
