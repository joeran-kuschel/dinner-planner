"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/language-switcher";

export function SiteNav() {
  const pathname = usePathname();
  const { i18n } = useLingui();

  const links = [
    { href: "/", label: t(i18n)`This week` },
    { href: "/recipes", label: t(i18n)`Recipes` },
    { href: "/groceries", label: t(i18n)`Groceries` },
  ];

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/85 backdrop-blur">
      <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="text-lg leading-none">
            🍲
          </span>
          {t(i18n)`Dinner Planner`}
        </Link>
        {/* The switcher sits outside <nav>: it changes the language, it goes nowhere. */}
        <nav aria-label={t(i18n)`Main`} className="order-last flex w-full gap-1 sm:order-none sm:w-auto">
          {links.map((link) => {
            // "/" would otherwise match every route, so it needs an exact test.
            const active = link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={
                  active
                    ? "rounded-lg bg-accent-soft px-3 py-1.5 text-sm font-medium text-foreground"
                    : "rounded-lg px-3 py-1.5 text-sm text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <LanguageSwitcher />
      </div>
    </header>
  );
}
