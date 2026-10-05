"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { setLeftovers } from "@/app/actions/meals";
import type { LeftoverSource } from "@/lib/leftovers";

/** The day whose card should take the focus once it appears: the button that had it is gone with the old card. */
let focusDay: string | null = null;

/** Whether this day's card is the one that just replaced the empty card the dialog was opened from. */
export function takeLeftoversFocus(dayKey: string): boolean {
  const mine = focusDay === dayKey;
  if (mine) focusDay = null;
  return mine;
}

/**
 * "Leftovers" on an empty day: a button that opens a modal dialog to choose which dinner of the days
 * before this day eats the rest of. A native `<dialog>` opened with `showModal()` does the modal work (focus
 * goes in, Tab stays inside, Escape closes, the focus returns to the button). The dialog sits inside the day
 * card's form, so it has no form of its own: the dinners are radio buttons whose name the card's action ignores,
 * and Save posts the chosen one to `setLeftovers` itself. The radios share a name so the arrow keys move
 * between them.
 */
export function LeftoversButton({ dayKey, weekday, sources }: { dayKey: string; weekday: string; sources: LeftoverSource[] }) {
  const { i18n } = useLingui();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [chosen, setChosen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState<"error" | "changed" | null>(null);

  const open = () => {
    setChosen(null);
    setFailed(null);
    dialog.current?.showModal();
  };

  const save = () => {
    if (!chosen || pending) return;
    const data = new FormData();
    data.set("day", dayKey);
    data.set("from", chosen);
    setFailed(null);
    startTransition(async () => {
      try {
        if ((await setLeftovers(data)) === "changed") {
          setFailed("changed");
          router.refresh();
          return;
        }
        focusDay = dayKey;
        dialog.current?.close();
      } catch {
        setFailed("error");
      }
    });
  };

  return (
    <>
      <button type="button" className="btn-secondary self-start px-3 text-sm" aria-haspopup="dialog" aria-label={t(i18n)`Leftovers on ${weekday}`} onClick={open}>
        {t(i18n)`Leftovers`}
      </button>
      <dialog
        ref={dialog}
        aria-labelledby={`leftovers-title-${dayKey}`}
        aria-describedby={`leftovers-hint-${dayKey}`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-6 text-foreground shadow-xl backdrop:bg-black/40"
      >
        <div className="flex flex-col gap-4">
          <h2 id={`leftovers-title-${dayKey}`} className="section-title">
            {t(i18n)`Leftovers on ${weekday}`}
          </h2>
          <p id={`leftovers-hint-${dayKey}`} className="text-sm text-muted">
            {t(i18n)`Pick the dinner this day eats the rest of. The grocery list stays as it is: raise “Serves” on that dinner to cook enough.`}
          </p>
          {sources.length === 0 ? (
            <p className="text-sm">{t(i18n)`No dinner is planned in the six days before this one.`}</p>
          ) : (
            <fieldset className="flex flex-col gap-1">
              <legend className="label">{t(i18n)`Eat the rest of`}</legend>
              {sources.map((source) => (
                <label
                  key={source.key}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                >
                  <input
                    type="radio"
                    name={`leftovers-from-${dayKey}`}
                    checked={chosen === source.key}
                    onChange={() => setChosen(source.key)}
                    className="size-5 shrink-0 accent-[var(--herb)]"
                  />
                  <span className="min-w-0">
                    <span className="block">{source.title}</span>
                    <span className="block text-sm text-muted">
                      {source.weekday} {source.dateLabel}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}
          {failed && (
            <p role="alert" className="text-sm font-medium text-accent-text">
              {failed === "changed"
                ? t(i18n)`The plan changed in the meantime, so nothing was saved. The list shows what is planned now.`
                : t(i18n)`The leftovers could not be saved. Please try again.`}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
              {t(i18n)`Cancel`}
            </button>
            <button type="button" className="btn-primary" aria-disabled={!chosen || pending || undefined} onClick={save}>
              {t(i18n)`Save`}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
