"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { isWebUrl, type RecipeFormValues } from "@/lib/recipe-form";
import type { ImportErrorCode } from "@/lib/recipe-import/errors";
import { IMPORT_ERROR_MESSAGES } from "@/lib/recipe-import/messages";

/** The recipe's picture as a file, or none (`failed` when the page had one that could not be fetched). */
export type ImportedPhoto = { file: File | null; failed: boolean };

type RecipeAnswer = { ok: true; values: RecipeFormValues; photoUrl: string | null } | { ok: false; error: ImportErrorCode };

/** Post an address to one of the import routes. */
const postUrl = (path: string, url: string, signal: AbortSignal) =>
  fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url }), signal });

const NO_PHOTO: ImportedPhoto = { file: null, failed: false };

const PHOTO_EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** The recipe's picture as a file, or `failed` when it cannot be had: the recipe is worth importing without it. */
async function fetchPhoto(url: string, recipeName: string, signal: AbortSignal): Promise<ImportedPhoto> {
  try {
    const response = await postUrl("/recipes/import/photo", url, signal);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || !(type in PHOTO_EXTENSIONS)) return { file: null, failed: true };
    const base = recipeName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "photo";
    const blob = await response.blob();
    // A cancel that lands while the picture arrives ends the whole import.
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    return { file: new File([blob], `${base}.${PHOTO_EXTENSIONS[type]}`, { type }), failed: false };
  } catch {
    // A cancel is the visitor's own doing and ends the whole import; anything else just leaves the photo out.
    if (signal.aborted) throw new DOMException("aborted", "AbortError");
    return { file: null, failed: true };
  }
}

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
  /** The recipe, and its picture as a file when the page had one (`failed` when it had one that could not be fetched). */
  onImported: (values: RecipeFormValues, photo: ImportedPhoto) => void;
}) {
  const { i18n } = useLingui();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const request = useRef<AbortController | null>(null);
  // "page" while the recipe page is fetched, then "photo" while its picture is.
  const [working, setWorking] = useState<"page" | "photo" | null>(null);
  const [error, setError] = useState<ImportErrorCode | null>(null);

  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (open && !element.open) element.showModal();
    if (!open && element.open) element.close();
  }, [open]);

  /** The picture, while the dialog says so. */
  const photoOf = (url: string, recipeName: string, signal: AbortSignal) => {
    setWorking("photo");
    return fetchPhoto(url, recipeName, signal);
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (working !== null) return;
    const url = String(new FormData(event.currentTarget).get("url") ?? "").trim();
    // Checked here first, so a typo is answered at once, without closing the dialog or asking the server.
    if (!isWebUrl(url)) {
      setError("invalid-url");
      input.current?.focus();
      return;
    }
    setError(null);
    setWorking("page");
    const controller = new AbortController();
    request.current = controller;
    try {
      const result: RecipeAnswer = await (await postUrl("/recipes/import", url, controller.signal)).json();
      if (result.ok) {
        const photo = result.photoUrl ? await photoOf(result.photoUrl, result.values.name, controller.signal) : NO_PHOTO;
        onImported(result.values, photo);
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
        setWorking(null);
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
        setWorking(null);
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
            readOnly={working !== null}
            aria-invalid={error === "invalid-url" || undefined}
            aria-describedby={error ? "import-error" : undefined}
            placeholder="https://…"
            className="field mt-1"
          />
        </div>
        {/* Always on the page, so a screen reader is already listening when the text appears. */}
        <p role="status" className="min-h-5 text-sm text-muted">
          {working === "page" ? t(i18n)`Fetching the page…` : working === "photo" ? t(i18n)`Fetching the photo…` : ""}
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
          <button type="submit" className="btn-primary" aria-disabled={working !== null || undefined}>
            {working !== null ? t(i18n)`Importing…` : t(i18n)`Import`}
          </button>
        </div>
      </form>
    </dialog>
  );
}
