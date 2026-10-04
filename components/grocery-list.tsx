"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { type FormEvent, useOptimistic, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useFormStatus } from "react-dom";
import { removeGroceryExtra, toggleGroceryLine } from "@/app/actions/groceries";
import { formatGroceryQuantity, groupByCategory, type GroceryLine } from "@/lib/grocery";
import { categoryLabel } from "@/lib/grocery-category";

/** A line of the list; `pantry` marks one that a pantry staple would hide, shown because the user asked. */
export type GroceryListLine = GroceryLine & { entryId: string | null; pantry?: boolean };

export type GroceryListProps = {
  weekStart: string;
  lines: GroceryListLine[];
  /** True when there is nothing to list only because pantry staples hide it all. */
  allInPantry?: boolean;
};

export function GroceryList({ weekStart, lines, allInPantry = false }: GroceryListProps) {
  const { i18n } = useLingui();

  if (lines.length === 0) {
    return (
      <p className="card p-6 text-sm text-muted">
        {allInPantry
          ? t(i18n)`Everything this week's dinners need is in your pantry.`
          : t(i18n)`Nothing to buy yet. Plan some dinners and their ingredients land here.`}
      </p>
    );
  }

  const total = lines.length;
  const ticked = lines.filter((line) => line.checked).length;

  return (
    <div className="flex flex-col gap-6">
      {/* A polite status, so ticking a line is answered in words too. */}
      <div className="flex flex-col gap-3">
        <p role="status" className="font-display text-2xl font-semibold">
          {ticked === total ? t(i18n)`Everything ticked off.` : t(i18n)`${ticked} of ${total} ticked off`}
          {/* Not read out: a screen reader would say "party popper" every time. */}
          {ticked === total && <span aria-hidden="true"> 🎉</span>}
        </p>
        {/* The words above say it; the bar is for a glance. */}
        <div aria-hidden className="h-3 overflow-hidden rounded-full bg-border">
          <div className="h-full bg-herb transition-[width]" style={{ width: `${(ticked / total) * 100}%` }} />
        </div>
      </div>

      {/* A ticked line stays where it is, struck through, so the list does not move under the thumb. */}
      <div className="md:columns-2 md:gap-6 [&>*]:mb-6 [&>*]:break-inside-avoid">
      {groupByCategory(lines).map(({ category, lines: group }) => {
        const name = categoryLabel(category, i18n);
        const headingId = `category-${category}`;
        return (
          <section key={category} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className="section-title">
              {name} ({group.length})
            </h2>
            <div className="card divide-y divide-border">
              {group.map((line) => (
                <GroceryRow key={line.key} weekStart={weekStart} line={line} />
              ))}
            </div>
          </section>
        );
      })}
      </div>
    </div>
  );
}

const noSubscription = () => () => {};

/**
 * False in the server-rendered HTML and while React hydrates, true once the page is interactive.
 * A tick before that has no handler to save it, so the box stays disabled until then.
 */
function useHydrated() {
  return useSyncExternalStore(
    noSubscription,
    () => true,
    () => false,
  );
}

/**
 * One line: a tick box that the whole row works as (a big target for a thumb), the name, a second
 * line saying where it comes from, and the amount. The box flips at once while the server saves;
 * if the save fails, it flips back.
 */
function GroceryRow({ weekStart, line }: { weekStart: string; line: GroceryListLine }) {
  const formRef = useRef<HTMLFormElement>(null);
  const { i18n } = useLingui();
  const { label } = line;
  const [checked, setChecked] = useOptimistic(line.checked);
  const [failed, setFailed] = useState(false);
  const hydrated = useHydrated();
  const [, startTransition] = useTransition();

  // The box flips for the time of the save and shows what is stored again once it ends, so a save
  // that fails leaves the box as it was; the message says so. The form is submitted by hand, not
  // through its `action`: React 19 resets a form once its action resolves, and the reset puts the
  // checkbox back to the value it was rendered with, so it showed the opposite of what was saved.
  const toggle = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    startTransition(async () => {
      setFailed(false);
      setChecked(formData.get("checked") === "true");
      try {
        await toggleGroceryLine(formData);
      } catch {
        setFailed(true);
      }
    });
  };

  const notes = [
    line.sources.length > 0 ? line.sources.join(", ") : null,
    line.pantry ? t(i18n)`in the pantry` : null,
    line.manual && line.sources.length === 0 ? t(i18n)`added by hand` : null,
  ].filter((note) => note !== null);

  return (
    <div className="flex items-center">
      <form ref={formRef} action={toggleGroceryLine} onSubmit={toggle} className="flex-1">
        <input type="hidden" name="weekStart" value={weekStart} />
        <input type="hidden" name="key" value={line.key} />
        <input type="hidden" name="label" value={line.label} />
        {/* The hidden field carries the value the action should persist, which is the opposite of the
            state shown now. */}
        <input type="hidden" name="checked" value={String(!checked)} />

        <label className="flex min-h-14 cursor-pointer items-center gap-3 p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-inset has-[:focus-visible]:ring-accent">
          <input
            type="checkbox"
            checked={checked}
            disabled={!hydrated}
            onChange={() => formRef.current?.requestSubmit()}
            className="size-6 shrink-0 accent-[var(--herb)]"
            aria-label={t(i18n)`Tick off ${label}`}
          />

          <span className="flex min-w-0 flex-1 flex-col">
            {/* Ticked lines are struck through and muted rather than faded: opacity would push the text
                below AA contrast. */}
            <span className={`text-base ${checked ? "text-muted line-through" : ""}`}>{line.label}</span>
            {notes.length > 0 && <span className="text-sm text-muted">{notes.join(" · ")}</span>}
          </span>

          <span className="shrink-0 text-sm text-muted">{formatGroceryQuantity(line, i18n)}</span>
        </label>
        {failed && (
          <p role="alert" className="px-3 pb-3 text-sm text-danger">
            {t(i18n)`Could not save the tick. Try again.`}
          </p>
        )}
      </form>

      {/* Only hand-added lines can be deleted; derived ones come back from the plan. */}
      {line.manual && line.entryId && (
        <form action={removeGroceryExtra} className="pr-2">
          <input type="hidden" name="id" value={line.entryId} />
          <RemoveButton label={line.label} />
        </form>
      )}
    </div>
  );
}

function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const { i18n } = useLingui();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-icon text-xs"
      aria-label={t(i18n)`Remove ${label}`}
    >
      ✕
    </button>
  );
}
