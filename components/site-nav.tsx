"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { LanguageSwitcher } from "@/components/language-switcher";

/** 22 px outline icons for the phone's tab bar; the words beside them name them, so they are decorative. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-[22px] shrink-0 sm:hidden"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {children}
    </svg>
  );
}

const ICONS = {
  "/": (
    <Icon>
      <rect x="4" y="5" width="16" height="15" rx="3" />
      <path d="M4 10h16M9 3v4M15 3v4" />
    </Icon>
  ),
  "/recipes": (
    <Icon>
      <path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z" />
      <path d="M9 9h6M9 13h6" />
    </Icon>
  ),
  "/groceries": (
    <Icon>
      <path d="M4 5h2l2 10h10l2-7H8" />
      <circle cx="10" cy="19" r="1" />
      <circle cx="17" cy="19" r="1" />
    </Icon>
  ),
} as const;

export function SiteNav() {
  const pathname = usePathname();
  const { i18n } = useLingui();

  const links = [
    { href: "/", label: t(i18n)`This week` },
    { href: "/recipes", label: t(i18n)`Recipes` },
    { href: "/groceries", label: t(i18n)`Groceries` },
  ] as const;

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:h-[4.5rem] sm:flex-nowrap sm:px-8 sm:py-0">
        <Link href="/" className="mr-auto flex items-center gap-3">
          <span
            aria-hidden
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.75}
            >
              <circle cx="12" cy="12" r="7.5" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </span>
          <span className="font-display text-xl font-semibold tracking-tight">{t(
            i18n,
          )`Dinner Planner`}</span>
        </Link>
        {/* Outside <nav>: it changes the language, it goes nowhere. */}
        <LanguageSwitcher />
        {/* On a phone the menu is a tab bar fixed to the bottom edge, where a thumb reaches; from `sm` it
            sits in the header. It is one <nav> either way, so there is one "Main" landmark and one focus
            order: language, then the links, as on every screen size. */}
        <nav
          aria-label={t(i18n)`Main`}
          className="fixed inset-x-0 bottom-0 z-20 flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] sm:static sm:w-auto sm:gap-1 sm:border-0 sm:bg-transparent sm:pb-0"
        >
          {links.map((link) => {
            // "/" would otherwise match every route, so it needs an exact test.
            const active =
              link.href === "/"
                ? pathname === "/"
                : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-semibold transition-colors sm:min-h-11 sm:flex-none sm:flex-row sm:rounded-full sm:px-4 sm:text-[0.9375rem] ${
                  active
                    ? "text-accent-text sm:bg-foreground sm:text-background"
                    : "text-muted hover:text-foreground sm:hover:bg-surface-muted"
                }`}
              >
                {ICONS[link.href]}
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
