"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useId, useRef, useState } from "react";

export type GroceryShareProps = {
  /** The list as plain text (`groceryListText()`), or null when there is nothing left to buy. */
  text: string | null;
};

type Status = "idle" | "copied" | "failed" | "unavailable" | "closed";

/**
 * "Copy list" and "Print" for the grocery page. Copying answers in a status region; when the browser
 * cannot write to the clipboard (no HTTPS, no permission) the same text is offered in a read-only field to
 * select from. That field closes with its Close button or Escape, and has an icon button that runs the same
 * copy (where the clipboard is missing it selects the text for Ctrl/Cmd+C instead). Nothing here prints: the
 * print stylesheet (`app/globals.css`) does that.
 */
export function GroceryShare({ text }: GroceryShareProps) {
  const { i18n } = useLingui();
  const [answer, setAnswer] = useState<{ status: Status; text: string | null }>({ status: "idle", text });
  const fieldId = useId();
  const copyButton = useRef<HTMLButtonElement>(null);
  const field = useRef<HTMLTextAreaElement>(null);
  // An answer is about the text that was copied: once the list changes, it no longer holds.
  const status = answer.text === text ? answer.status : "idle";
  const setStatus = (next: Status) => setAnswer({ status: next, text });

  // "Copied" and "Closed" fade after a moment, so doing it again is announced again.
  useEffect(() => {
    if (answer.status !== "copied" && answer.status !== "closed") return;
    const timer = setTimeout(() => setAnswer({ status: "idle", text: answer.text }), 4000);
    return () => clearTimeout(timer);
  }, [answer]);

  /** Writes the list to the clipboard and answers in the status; false when that did not work. */
  const copy = async () => {
    if (text === null) return false;
    if (!navigator.clipboard?.writeText) {
      setStatus("unavailable");
      return false;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
      return true;
    } catch {
      setStatus("failed");
      return false;
    }
  };

  // The box's icon button runs the same copy. A copy that works removes the box, so the focus goes to
  // "Copy list"; one that does not leaves the text selected (the field's focus handler selects it).
  const copyFromBox = async () => {
    if (await copy()) copyButton.current?.focus();
    else field.current?.focus();
  };

  const close = () => {
    setStatus("closed");
    copyButton.current?.focus();
  };

  const message = {
    idle: "",
    copied: t(i18n)`Copied`,
    failed: t(i18n)`Couldn't copy. Select the text below instead.`,
    unavailable: t(i18n)`Copying isn't available here. Select the text below instead.`,
    closed: t(i18n)`Closed the list as text.`,
  }[status];

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {text !== null && (
          <button ref={copyButton} type="button" className="btn-secondary" onClick={copy}>
            {t(i18n)`Copy list`}
          </button>
        )}
        <button type="button" className="btn-secondary" onClick={() => window.print()}>
          {t(i18n)`Print`}
        </button>
        {/* Always in the page, so a screen reader hears the text appear. */}
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      </div>
      {text !== null && (status === "failed" || status === "unavailable") && (
        // Escape closes the box from anywhere in it (the text, the icon, Close), as it does for a dialog.
        <div onKeyDown={(event) => event.key === "Escape" && close()}>
          <label className="label" htmlFor={fieldId}>
            {t(i18n)`The list as text`}
          </label>
          <div className="relative mt-1">
            <textarea
              ref={field}
              id={fieldId}
              readOnly
              value={text}
              rows={Math.min(text.split("\n").length, 14)}
              onFocus={(event) => event.currentTarget.select()}
              className="field pr-12 font-mono text-sm"
            />
            <button
              type="button"
              className="btn-icon absolute right-1 top-1"
              aria-label={t(i18n)`Copy to clipboard`}
              onClick={copyFromBox}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="11" height="11" rx="2" />
                <path d="M5 15V6a2 2 0 0 1 2-2h9" />
              </svg>
            </button>
          </div>
          <button type="button" className="btn-secondary mt-2" onClick={close}>
            {t(i18n)`Close`}
          </button>
        </div>
      )}
    </div>
  );
}
