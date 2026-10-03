"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { isWebUrl, type RecipeFormValues } from "@/lib/recipe-form";
import type { ImportErrorCode } from "@/lib/recipe-import/errors";
import { IMPORT_ERROR_MESSAGES } from "@/lib/recipe-import/messages";

/**
 * "Add from a link": a modal dialog that asks for the address of a recipe page, has the server read the recipe
 * (`POST /recipes/import`) and hands the values over for the visitor to review. A native `<dialog>` opened with
 * `showModal()` does the modal work: focus goes in, Tab stays inside, Escape closes it, and the focus returns to
 * the button that opened it. Cancel (and Escape) also stops the wait, on the server too.
 */
export function ImportRecipeDialog({
  open,
  onClose,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: (values: RecipeFormValues) => void;
}) {
  const { i18n } = useLingui();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<ImportErrorCode | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working) return;
    const url = String(new FormData(event.currentTarget).get("url") ?? "").trim();
    // Checked here first, so a typo is answered at once, without closing the dialog or asking the server.
    if (!isWebUrl(url)) {
      setError("invalid-url");
      input.current?.focus();
      return;
    }
    setError(null);
    setWorking(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/recipes/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const result: { ok: true; values: RecipeFormValues } | { ok: false; error: ImportErrorCode } = await response.json();
      if (result.ok) {
        onImported(result.values);
        dialog.current?.close();
      } else {
        setError(result.error);
        input.current?.focus();
      }
    } catch {
      if (!controller.signal.aborted) setError("unreachable");
    } finally {
      if (request.current === controller) {
        request.current = null;
        setWorking(false);
      }
    }
  };

  return (
    <dialog
      ref={dialog}
      aria-labelledby="import-title"
      aria-describedby="import-hint"
      onClose={() => {
        request.current?.abort();
        request.current = null;
        setWorking(false);
        setError(null);
        onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-6 text-foreground shadow-xl backdrop:bg-black/40"
    >
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <h2 id="import-title" className="section-title">
          {t(i18n)`Add from a link`}
        </h2>
        <p id="import-hint" className="text-sm text-muted">
          {t(i18n)`Paste the address of a recipe page. The recipe is filled in for you to check; nothing is saved until you save it.`}
        </p>
        <div>
          <label className="label" htmlFor="import-url">
            {t(i18n)`Link to the recipe`}
          </label>
          <input
            ref={input}
            id="import-url"
            name="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            readOnly={working}
            aria-invalid={error === "invalid-url" || undefined}
            aria-describedby={error ? "import-error" : undefined}
            placeholder="https://…"
            className="field mt-1"
          />
        </div>
        {/* Always on the page, so a screen reader is already listening when the text appears. */}
        <p role="status" className="min-h-5 text-sm text-muted">
          {working ? t(i18n)`Fetching the page…` : ""}
        </p>
        {error && (
          <p id="import-error" role="alert" className="text-sm font-medium text-accent-text">
            {i18n._(IMPORT_ERROR_MESSAGES[error])}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
            {t(i18n)`Cancel`}
          </button>
          <button type="submit" className="btn-primary" aria-disabled={working || undefined}>
            {working ? t(i18n)`Importing…` : t(i18n)`Import`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
