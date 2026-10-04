"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useId, useState } from "react";

export type GroceryShareProps = {
  /** The list as plain text (`groceryListText()`), or null when there is nothing left to buy. */
  text: string | null;
};

type Status = "idle" | "copied" | "failed" | "unavailable";

/**
 * "Copy list" and "Print" for the grocery page. Copying answers in a status region; when the browser
 * cannot write to the clipboard (no HTTPS, no permission) the same text is offered in a read-only field to
 * select from. Nothing here prints: the print stylesheet (`app/globals.css`) does that.
 */
export function GroceryShare({ text }: GroceryShareProps) {
  const { i18n } = useLingui();
  const [answer, setAnswer] = useState<{ status: Status; text: string | null }>({ status: "idle", text });
  const fieldId = useId();
  // An answer is about the text that was copied: once the list changes, it no longer holds.
  const status = answer.text === text ? answer.status : "idle";
  const setStatus = (next: Status) => setAnswer({ status: next, text });

  // "Copied" fades after a moment, so copying again is announced again.
  useEffect(() => {
    if (answer.status !== "copied") return;
    const timer = setTimeout(() => setAnswer({ status: "idle", text: answer.text }), 4000);
    return () => clearTimeout(timer);
  }, [answer]);

  const copy = async () => {
    if (text === null) return;
    if (!navigator.clipboard?.writeText) {
      setStatus("unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  const message = {
    idle: "",
    copied: t(i18n)`Copied`,
    failed: t(i18n)`Couldn't copy. Select the text below instead.`,
    unavailable: t(i18n)`Copying isn't available here. Select the text below instead.`,
  }[status];

  return (
    <div className="flex flex-col gap-3 print:hidden">
      <div className="flex flex-wrap items-center gap-2">
        {text !== null && (
          <button type="button" className="btn-secondary" onClick={copy}>
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
        <div>
          <label className="label" htmlFor={fieldId}>
            {t(i18n)`The list as text`}
          </label>
          <textarea
            id={fieldId}
            readOnly
            value={text}
            rows={Math.min(text.split("\n").length, 14)}
            onFocus={(event) => event.currentTarget.select()}
            className="field mt-1 font-mono text-sm"
          />
        </div>
      )}
    </div>
  );
}
