"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { keepGroceryNameSeparate, mergeGroceryLines } from "@/app/actions/groceries";

/** A line the open one can be merged into. */
export type MergeTarget = { key: string; nameId: string; label: string; amount: string };

export type MergeLineButtonProps = {
  /** The line to merge away: its name id (the name it is counted under) and the name shown. */
  from: { nameId: string; label: string };
  targets: MergeTarget[];
  /** The spellings this line combines ("Tomaten", "tomatoes"), when it combines more than one. */
  parts?: string[];
  /** Called once the merge is saved and the dialog is closed, with the line that remains. */
  onMerged: (from: string, to: MergeTarget) => void;
  /** Called once a spelling is kept on a line of its own and the dialog is closed. */
  onSeparated: (name: string) => void;
};

/**
 * "Merge" on a grocery line: a small symbol button that opens a modal dialog to choose the line this one is listed as from
 * now on. A native `<dialog>` opened with `showModal()` does the modal work (focus goes in, Tab stays inside,
 * Escape closes, the focus returns to the button). The line chosen keeps its name; this line's name is listed as
 * that one in every week (a rule, see `mergeGroceryLines`). Only lines in the same unit are offered, because
 * amounts in different units are never added.
 */
export function MergeLineButton({ from, targets, parts, onMerged, onSeparated }: MergeLineButtonProps) {
  const { i18n } = useLingui();
  const dialog = useRef<HTMLDialogElement>(null);
  // The dialog's content exists only while it is open: every line has a dialog, and each lists all the other lines.
  const [isOpen, setIsOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [failed, setFailed] = useState<"error" | "limit" | null>(null);
  // The tooltip with the spellings: open while the pointer or the focus is on the button, until Escape.
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [pending, startTransition] = useTransition();
  const label = from.label;
  const target = targets.find((candidate) => candidate.key === chosen) ?? null;

  const open = () => {
    setChosen(null);
    setFailed(null);
    setIsOpen(true);
  };

  // Opened once the content is there, so the focus goes to the first choice and not to the box itself.
  useEffect(() => {
    if (isOpen && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [isOpen]);

  const save = () => {
    if (!target || pending) return;
    const data = new FormData();
    data.set("from", from.nameId);
    data.set("fromLabel", label);
    data.set("to", target.nameId);
    data.set("toLabel", target.label);
    setFailed(null);
    startTransition(async () => {
      try {
        const result = await mergeGroceryLines(data);
        if (result !== "merged") {
          setFailed(result === "limit" ? "limit" : "error");
          return;
        }
        dialog.current?.close();
        onMerged(label, target);
      } catch {
        setFailed("error");
      }
    });
  };

  // One spelling goes on a line of its own: the dictionary and the plural rule leave that name alone from now on.
  const separate = (name: string) => {
    if (pending) return;
    const data = new FormData();
    data.set("label", name);
    setFailed(null);
    startTransition(async () => {
      try {
        const result = await keepGroceryNameSeparate(data);
        if (result !== "kept") {
          setFailed(result === "limit" ? "limit" : "error");
          return;
        }
        dialog.current?.close();
        onSeparated(name);
      } catch {
        setFailed("error");
      }
    });
  };

  const id = useId();
  const combined = parts?.join(", ") ?? "";
  const tipOpen = Boolean(parts) && (hovered || focused) && !tipDismissed;

  return (
    <>
      {/* The tooltip belongs to the button and stays while the pointer is on either (WCAG 1.4.13: dismissible with
          Escape, hoverable, persistent). Screen readers get the same words from the button's description. */}
      <span
        className="relative inline-flex"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => {
          setHovered(false);
          setTipDismissed(false);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          setTipDismissed(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape" && tipOpen) {
            event.stopPropagation();
            setTipDismissed(true);
          }
        }}
      >
      {/* A symbol button like the ✕ beside it: small with a mouse, 44 px on a touch screen. */}
      <button
        type="button"
        className="btn-icon"
        aria-haspopup="dialog"
        aria-label={targets.length > 0 ? t(i18n)`Merge ${label} with another line` : t(i18n)`Show what ${label} combines`}
        aria-describedby={parts ? `${id}-tip` : undefined}
        title={parts ? undefined : t(i18n)`Merge`}
        onClick={open}
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M4 5h5a4 4 0 0 1 4 4v1M4 19h5a4 4 0 0 0 4-4v-1M13 12h7m0 0-3-3m3 3-3 3" />
        </svg>
      </button>
      {parts && (
        <span
          id={`${id}-tip`}
          role="tooltip"
          className={`absolute right-0 top-full z-10 mt-1 w-max max-w-64 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground shadow-lg before:absolute before:inset-x-0 before:-top-1 before:h-1 before:content-[''] ${tipOpen ? "" : "sr-only"}`}
        >
          {t(i18n)`Combines ${combined}`}
        </span>
      )}
      </span>
      <dialog
        ref={dialog}
        aria-labelledby={`${id}-title`}
        aria-describedby={targets.length > 0 ? `${id}-hint` : undefined}
        onClose={() => setIsOpen(false)}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-6 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {isOpen && (
          <div className="flex flex-col gap-4">
            <h2 id={`${id}-title`} className="section-title">
              {targets.length > 0 ? t(i18n)`Merge ${label}` : t(i18n)`Spellings of ${label}`}
            </h2>
            {parts && (
              <section aria-labelledby={`${id}-parts`} className="flex flex-col gap-2">
                <h3 id={`${id}-parts`} className="label">
                  {t(i18n)`This line combines`}
                </h3>
                <p className="text-sm text-muted">
                  {t(i18n)`The app lists these spellings as one. You can put one on a line of its own; undo it under “Merged lines”.`}
                </p>
                <ul className="flex flex-col gap-1">
                  {parts.map((part) => (
                    <li key={part} className="flex min-h-11 flex-wrap items-center justify-between gap-2">
                      <span>{part}</span>
                      <button
                        type="button"
                        className="btn-secondary px-3 text-sm"
                        aria-disabled={pending || undefined}
                        aria-label={t(i18n)`List separately: ${part}`}
                        onClick={() => separate(part)}
                      >
                        {t(i18n)`List separately`}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {targets.length > 0 && (
            <>
            <p id={`${id}-hint`} className="text-sm text-muted">
              {t(i18n)`Pick the line to list this one as from now on, in every week. Amounts in the same unit add up. You can undo it under “Merged lines”.`}
            </p>
            <fieldset className="flex flex-col gap-1">
              <legend className="label">{t(i18n)`List it as`}</legend>
              {targets.map((candidate) => (
                <label
                  key={candidate.key}
                  className="flex min-h-11 items-center gap-3 rounded-lg px-2 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
                >
                  <input
                    type="radio"
                    name={`${id}-target`}
                    checked={chosen === candidate.key}
                    onChange={() => setChosen(candidate.key)}
                    className="size-5 shrink-0 accent-[var(--herb)]"
                  />
                  <span className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                    <span className="min-w-0">{candidate.label}</span>
                    <span className="shrink-0 text-sm text-muted">{candidate.amount}</span>
                  </span>
                </label>
              ))}
            </fieldset>
            </>
            )}
            {/* Always in the dialog, so the sentence is announced when it appears. */}
            <p role="status" className="min-h-5 text-sm">
              {target ? t(i18n)`${label} will be listed as ${target.label}.` : ""}
            </p>
            {failed && (
              <p role="alert" className="text-sm font-medium text-accent-text">
                {failed === "limit"
                  ? t(i18n)`There are too many merges already. Undo one under “Merged lines” first.`
                  : t(i18n)`These lines cannot be merged. Please try again.`}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
                {t(i18n)`Cancel`}
              </button>
              {targets.length > 0 && (
                <button type="button" className="btn-primary" aria-disabled={!target || pending || undefined} onClick={save}>
                  {t(i18n)`Merge`}
                </button>
              )}
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
