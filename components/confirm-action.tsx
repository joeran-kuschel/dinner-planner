"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useId, useRef } from "react";
import { useFormStatus } from "react-dom";

export type ConfirmActionProps = {
  /** The button that asks; a second click on it, Cancel or Escape closes the question again. */
  label: string;
  question: string;
  confirmLabel: string;
  action: (formData: FormData) => Promise<void>;
  /** Hidden fields the action reads, e.g. the id of what is deleted. */
  fields: Record<string, string>;
  /** From `sm` up, open the question above the button, for a button at the bottom of the page. */
  openUpward?: boolean;
  /**
   * The id of an element that takes the focus once the action has gone through and
   * removed this button with it, so the focus does not fall back to the top of the page.
   */
  focusAfter?: string;
};

/**
 * A destructive action that asks first. A `<details>` disclosure, so the
 * question is announced as a collapsed/expanded button and the form works
 * without JavaScript; the script only adds Cancel and Escape.
 */
export function ConfirmAction({
  label,
  question,
  confirmLabel,
  action,
  fields,
  openUpward,
  focusAfter,
}: ConfirmActionProps) {
  const { i18n } = useLingui();
  const questionId = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  // The form posts to the server action itself, so it works without JavaScript; the
  // focus is handed on when the confirmed action takes this whole component away.
  const submitted = useRef(false);
  useEffect(
    () => () => {
      if (submitted.current && focusAfter) document.getElementById(focusAfter)?.focus();
    },
    [focusAfter],
  );

  const close = () => {
    submitted.current = false;
    if (details.current) details.current.open = false;
    summary.current?.focus();
  };

  return (
    <details
      ref={details}
      className="relative"
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current?.open) {
          event.stopPropagation();
          close();
        }
      }}
    >
      <summary ref={summary} className="btn-ghost cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        {label}
      </summary>
      <div
        role="group"
        aria-labelledby={questionId}
        // Where the button sits varies with how the page wraps, so on a small screen no anchor edge
        // keeps the question on screen: there it is a sheet at the bottom of the viewport. From `sm`
        // it hangs off the button.
        className={`card fixed inset-x-4 bottom-4 z-20 flex flex-col gap-3 p-3 shadow-lg sm:absolute sm:inset-x-auto sm:right-0 sm:w-64 sm:z-10 ${
          openUpward ? "sm:bottom-full sm:mb-1" : "sm:bottom-auto sm:top-full sm:mt-1"
        }`}
      >
        <p id={questionId} className="text-sm">
          {question}
        </p>
        <form action={action} onSubmit={() => (submitted.current = true)} className="flex items-center gap-2">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <ConfirmButton>{confirmLabel}</ConfirmButton>
          <button type="button" className="btn-secondary" onClick={close}>
            {t(i18n)`Cancel`}
          </button>
        </form>
      </div>
    </details>
  );
}

/** Off while the action runs, so a double click cannot delete twice. */
function ConfirmButton({ children }: { children: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {children}
    </button>
  );
}
