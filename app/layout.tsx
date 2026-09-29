import type { Metadata } from "next";
import { t } from "@lingui/core/macro";
import { Geist, Geist_Mono } from "next/font/google";
import { I18nClientProvider } from "@/components/i18n-provider";
import { SiteNav } from "@/components/site-nav";
import { CATALOGS } from "@/lib/i18n/catalogs";
import { getServerI18n } from "@/lib/i18n/server";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col font-sans">
        <I18nClientProvider locale={locale} messages={CATALOGS[locale]}>
          <SiteNav />
          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 sm:px-6 sm:py-10">
            {children}
          </main>
        </I18nClientProvider>
      </body>
    </html>
  );
}
