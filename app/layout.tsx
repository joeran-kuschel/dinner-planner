import type { Metadata, Viewport } from "next";
import { t } from "@lingui/core/macro";
import { Fraunces, Hanken_Grotesk } from "next/font/google";
import { I18nClientProvider } from "@/components/i18n-provider";
import { SiteNav } from "@/components/site-nav";
import { CATALOGS } from "@/lib/i18n/catalogs";
import { getServerI18n } from "@/lib/i18n/server";
import "./globals.css";

// Fonts are fetched at build time and served by the app itself, so nothing is requested from Google at run time.
const body = Hanken_Grotesk({
  variable: "--font-body",
  subsets: ["latin"],
});

const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
});

// Lets the tab bar reach the screen edge and keep clear of the home indicator (env(safe-area-inset-bottom)).
export const viewport: Viewport = { viewportFit: "cover" };

export async function generateMetadata(): Promise<Metadata> {
  const { i18n } = await getServerI18n();
  const appName = t(i18n)`Dinner Planner`;
  return {
    // Pages set only their own part of the title.
    title: { default: appName, template: `%s · ${appName}` },
    description: t(i18n)`Plan the week's dinners, keep recipes, and get one grocery list.`,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { locale } = await getServerI18n();

  return (
    <html
      lang={locale}
      className={`${body.variable} ${display.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <I18nClientProvider locale={locale} messages={CATALOGS[locale]}>
          <SiteNav />
          <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 sm:px-8 sm:pb-12 sm:pt-10">
            {children}
          </main>
        </I18nClientProvider>
      </body>
    </html>
  );
}
