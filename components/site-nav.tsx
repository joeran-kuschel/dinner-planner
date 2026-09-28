"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "This week" },
  { href: "/recipes", label: "Recipes" },
  { href: "/groceries", label: "Groceries" },
] as const;

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/85 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-5xl items-center gap-1 px-4 py-3 sm:px-6">
        <Link href="/" className="mr-auto flex items-center gap-2 text-sm font-semibold">
          <span aria-hidden className="text-lg leading-none">
            🍲
          </span>
          Dinner Planner
        </Link>
        {LINKS.map((link) => {
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
    </header>
  );
}
