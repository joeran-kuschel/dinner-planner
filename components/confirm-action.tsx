"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId, useRef } from "react";

export type ConfirmActionProps = {
  /** The button that asks; a second click on it, Cancel or Escape closes the question again. */
  label: string;
  question: string;
  confirmLabel: string;
  action: (formData: FormData) => Promise<void>;
  /** Hidden fields the action reads, e.g. the id of what is deleted. */
  fields: Record<string, string>;
  /** Open the question above the button, for a button at the bottom of the page. */
  openUpward?: boolean;
};

/**
 * A destructive action that asks first. A `<details>` disclosure, so the
 * question is announced as a collapsed/expanded button and the form works
 * without JavaScript; the script only adds Cancel and Escape.
 */
export function ConfirmAction({ label, question, confirmLabel, action, fields, openUpward }: ConfirmActionProps) {
  const { i18n } = useLingui();
  const questionId = useId();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);

  const close = () => {
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
        className={`card absolute right-0 z-10 flex w-64 flex-col gap-3 p-3 shadow-lg ${
          openUpward ? "bottom-full mb-1" : "top-full mt-1"
        }`}
      >
        <p id={questionId} className="text-sm">
          {question}
        </p>
        <form action={action} className="flex items-center gap-2">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <button type="submit" className="btn-primary">
            {confirmLabel}
          </button>
          <button type="button" className="btn-secondary" onClick={close}>
            {t(i18n)`Cancel`}
          </button>
        </form>
      </div>
    </details>
  );
}
