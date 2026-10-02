"use client";

import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import Link from "next/link";
import { useEffect, useRef } from "react";
import { addPantryStaple, removePantryStaple } from "@/app/actions/pantry";
import { MAX_STAPLE_LENGTH, MAX_STAPLES } from "@/lib/pantry";

export type PantrySectionProps = {
  staples: { id: string; name: string }[];
  /** Grocery lines of the shown week that a staple hides. */
  hiddenCount: number;
  /** Whether the hidden lines are shown in the list anyway (`?pantry=show`). */
  showHidden: boolean;
  /** Where the link that shows or hides them leads: the same week, with or without `pantry=show`. */
  toggleHref: string;
  /** Names of ingredients in recipes, offered while typing a staple. */
  suggestions: string[];
};

/**
 * The pantry staples: what is always at home and so not on the list. A disclosure at the bottom of the
 * grocery page, closed until wanted (and open while the hidden lines are shown, so the link that undoes
 * that is in sight). Plain forms, so it works without JavaScript.
 */
export function PantrySection({ staples, hiddenCount, showHidden, toggleHref, suggestions }: PantrySectionProps) {
  const { i18n } = useLingui();
  const chosen = new Set(staples.map((staple) => staple.name));
  const full = staples.length >= MAX_STAPLES;

  // After a staple is removed its button is gone, and the focus would fall back to the top of the
  // page: it moves to the chip now in its place, or to the add field when none is left.
  const chips = useRef<HTMLUListElement>(null);
  const field = useRef<HTMLInputElement>(null);
  const focusAfterRemoval = useRef<number | null>(null);
  useEffect(() => {
    const index = focusAfterRemoval.current;
    if (index === null) return;
    focusAfterRemoval.current = null;
    const buttons = chips.current?.querySelectorAll("button") ?? [];
    (buttons[Math.min(index, buttons.length - 1)] ?? field.current)?.focus();
  }, [staples]);

  return (
    <details open={showHidden} className="card p-4">
      <summary className="disclosure-summary">
        {t(i18n)`Pantry staples`}
        {hiddenCount > 0 && (
          <>
            {" "}
            <span className="ml-1 font-normal text-muted">
              {t(i18n)`${plural(hiddenCount, { one: "# item hidden", other: "# items hidden" })}`}
            </span>
          </>
        )}
      </summary>

      <div className="mt-3 flex flex-col gap-4">
        <p className="text-sm text-muted">
          {t(i18n)`Things you always have at home. They are left off the grocery list.`}
        </p>

        <form action={addPantryStaple} className="flex flex-wrap items-end gap-2">
          <div className="min-w-48 flex-1">
            <label className="label" htmlFor="staple">
              {t(i18n)`Add a staple`}
            </label>
            <input
              id="staple"
              ref={field}
              name="name"
              disabled={full}
              className="field mt-1"
              maxLength={MAX_STAPLE_LENGTH}
              list="staple-suggestions"
              autoComplete="off"
              placeholder={t(i18n)`Salt`}
            />
            <datalist id="staple-suggestions">
              {suggestions
                .filter((name) => !chosen.has(name))
                .map((name) => (
                  <option key={name} value={name} />
                ))}
            </datalist>
          </div>
          <button type="submit" className="btn-primary" disabled={full}>
            {t(i18n)`Add`}
          </button>
          {full && (
            <p className="basis-full text-sm text-muted">
              {t(i18n)`The list is full: ${MAX_STAPLES} staples. Remove one to add another.`}
            </p>
          )}
        </form>

        {staples.length === 0 ? (
          <p className="text-sm text-muted">{t(i18n)`No staples yet.`}</p>
        ) : (
          <ul ref={chips} aria-label={t(i18n)`Pantry staples`} className="flex flex-wrap gap-2">
            {staples.map(({ id, name }, index) => (
              <li key={id} className="pill">
                {name}
                <form
                  action={removePantryStaple}
                  onSubmit={() => (focusAfterRemoval.current = index)}
                  className="flex"
                >
                  <input type="hidden" name="id" value={id} />
                  <button
                    type="submit"
                    className="pill-remove"
                    aria-label={t(i18n)`Remove ${name} from the pantry staples`}
                  >
                    ✕
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        {hiddenCount > 0 && (
          <Link href={toggleHref} scroll={false} className="self-start text-sm font-medium text-accent-text underline">
            {showHidden
              ? t(i18n)`Hide the pantry items again`
              : t(i18n)`${plural(hiddenCount, { one: "Show the # hidden item", other: "Show the # hidden items" })}`}
          </Link>
        )}
      </div>
    </details>
  );
}
