"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useRouter } from "next/navigation";
import { type FormEvent, useRef, useState, useTransition } from "react";
import { planFreeDay, planFreeDayFromForm } from "@/app/actions/meals";
import { activityHint, type RecipeActivity } from "@/lib/cook-again";

export type CookAgainProps = {
  /** The recipes to offer, in order (see `cookAgainSuggestions`). */
  suggestions: ({ id: string; name: string } & RecipeActivity)[];
  /** The days of the week shown that are still free, from today on. */
  freeDays: { key: string; label: string }[];
};

/** The id the section's heading has, so the focus can go to it. */
export const COOK_AGAIN_TITLE_ID = "cook-again-title";
const COOK_AGAIN_LIST_ID = "cook-again-list";

/**
 * "Cook again": favorites and the recipes not planned for a while, each with a choice of the week's free days and a Plan
 * button. It plans the recipe by its id, only while the day is still free (`planFreeDay`), and says so when it was not.
 * Plain forms, so it works without JavaScript (the day is then taken or not on the server, and the page shows the result).
 */
export function CookAgain({ suggestions, freeDays }: CookAgainProps) {
  const { i18n } = useLingui();
  const [open, setOpen] = useState(true);
  if (suggestions.length === 0 || freeDays.length === 0) return null;

  return (
    <section
      aria-labelledby={COOK_AGAIN_TITLE_ID}
      // From `lg` a column beside the week, kept in view while it scrolls, and no taller than the screen so its last rows can be reached.
      className="flex flex-col gap-3 lg:sticky lg:top-24 lg:max-h-[calc(100vh-7rem)] lg:overflow-y-auto"
    >
      <div>
        <h2 id={COOK_AGAIN_TITLE_ID} tabIndex={-1} className="section-title">
          {/* A disclosure: the title is the button, so its name stays "Cook again" and aria-expanded says the rest. */}
          <button
            type="button"
            aria-expanded={open}
            aria-controls={COOK_AGAIN_LIST_ID}
            onClick={() => setOpen(!open)}
            className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-left"
          >
            {t(i18n)`Cook again`}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              className={`size-5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m5 8 5 5 5-5" />
            </svg>
          </button>
        </h2>
        {open && <p className="mt-1 text-sm text-muted">{t(i18n)`Favorites and recipes you have not planned for a while.`}</p>}
      </div>
      <ul id={COOK_AGAIN_LIST_ID} hidden={!open} className="flex flex-col gap-3">
        {suggestions.map((recipe) => (
          // The last row and the last free day take the whole section with them: the focus then goes to the day's field.
          <Row key={recipe.id} recipe={recipe} freeDays={freeDays} sectionStays={suggestions.length > 1 && freeDays.length > 1} />
        ))}
      </ul>
    </section>
  );
}

function Row({
  recipe,
  freeDays,
  sectionStays,
}: {
  recipe: CookAgainProps["suggestions"][number];
  freeDays: CookAgainProps["freeDays"];
  sectionStays: boolean;
}) {
  const { i18n } = useLingui();
  const router = useRouter();
  const select = useRef<HTMLSelectElement>(null);
  const [problem, setProblem] = useState<"occupied" | "failed" | null>(null);
  const [pending, startTransition] = useTransition();
  const hint = activityHint(recipe, i18n);
  const selectId = `cook-again-day-${recipe.id}`;

  // The row goes away when it is planned (and the section with the last one): the focus is moved before the page is drawn again,
  // to the heading while there is one, else to the field of the day. If the day was taken meanwhile, the row stays and gets it back.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    document.getElementById(sectionStays ? COOK_AGAIN_TITLE_ID : `dinner-${String(data.get("day"))}`)?.focus();
    setProblem(null);
    startTransition(async () => {
      try {
        const result = await planFreeDay(data);
        if (result === "occupied") {
          setProblem("occupied");
          select.current?.focus();
          router.refresh();
        }
      } catch {
        setProblem("failed");
        select.current?.focus();
      }
    });
  };

  return (
    <li className="card p-4">
      <p className="text-base font-medium">{recipe.name}</p>
      {hint && <p className="mt-0.5 text-sm text-muted first-letter:uppercase">{hint}</p>}
      <form action={planFreeDayFromForm} onSubmit={submit} className="mt-3 flex items-center gap-2">
        <input type="hidden" name="recipeId" value={recipe.id} />
        <div className="min-w-0 flex-1">
          {/* The recipe's name is right above; the label is for a screen reader. */}
          <label className="sr-only" htmlFor={selectId}>
            {t(i18n)`Day for ${recipe.name}`}
          </label>
          <select
            ref={select}
            id={selectId}
            name="day"
            className="field"
            defaultValue={freeDays[0].key}
            aria-describedby={problem ? `${selectId}-problem` : undefined}
            aria-invalid={problem ? true : undefined}
          >
            {freeDays.map((day) => (
              <option key={day.key} value={day.key}>
                {day.label}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" aria-label={t(i18n)`Plan ${recipe.name}`} aria-disabled={pending || undefined}>
          {t(i18n)`Plan`}
        </button>
      </form>
      {problem && (
        <p id={`${selectId}-problem`} role="alert" className="mt-2 text-sm text-danger">
          {problem === "occupied"
            ? t(i18n)`That day has been planned in the meantime. Pick another day.`
            : t(i18n)`Could not plan this recipe. Reload the page and try again.`}
        </p>
      )}
    </li>
  );
}
