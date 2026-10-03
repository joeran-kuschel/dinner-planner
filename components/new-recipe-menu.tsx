"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

/**
 * The recipe list's "New recipe" as a split button: the main part opens the empty form in one click, the arrow
 * beside it opens a short menu of other ways to start a recipe. The menu is a native `<details>`, so it opens
 * without JavaScript; the script only adds what people expect of a menu: Escape closes it (and puts the focus back
 * on the arrow) and so does a click anywhere else.
 */
export function NewRecipeMenu({
  newLabel,
  moreLabel,
  items,
}: {
  newLabel: string;
  /** The arrow's name for screen readers ("More ways to add a recipe"). */
  moreLabel: string;
  items: { href: string; label: string }[];
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node)) menu.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !menu.current) return;
      menu.current.open = false;
      menu.current.querySelector("summary")?.focus();
    };
    document.addEventListener("pointerdown", closeOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return (
    <div className="relative inline-flex">
      <Link href="/recipes/new" className="btn-primary rounded-r-none">
        {newLabel}
      </Link>
      <details ref={menu} onToggle={(event) => setOpen(event.currentTarget.open)} className="flex">
        <summary
          aria-label={moreLabel}
          className="btn-primary h-full cursor-pointer list-none rounded-l-none border-l border-white/30 px-3 [&::-webkit-details-marker]:hidden"
        >
          <svg aria-hidden="true" viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2.5 4.5 6 8l3.5-3.5" />
          </svg>
        </summary>
        <ul className="card absolute right-0 top-full z-20 mt-2 min-w-52 p-1">
          {items.map((item) => (
            <li key={item.href}>
              <Link href={item.href} className="flex min-h-11 items-center rounded-xl px-3 text-sm font-medium hover:bg-surface-muted">
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </details>
    </div>
  );
}
