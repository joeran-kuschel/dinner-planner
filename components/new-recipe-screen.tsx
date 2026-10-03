"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";
import { createRecipe } from "@/app/actions/recipes";
import { ImportRecipeDialog } from "@/components/import-recipe-dialog";
import { RecipeForm } from "@/components/recipe-form";
import { attachFile } from "@/lib/attach-file";
import type { RecipeFormValues } from "@/lib/recipe-form";

/**
 * The new-recipe page's form with "Add from a link" above it. An imported recipe replaces the form (a fresh one,
 * started from the imported values) and the focus goes to its name, so the visitor can check it and save.
 */
export function NewRecipeScreen({
  tagSuggestions,
  unitSuggestions,
  openImport,
  imported: serverImported,
}: {
  tagSuggestions: string[];
  unitSuggestions: string[];
  /** Open the dialog on arrival (the menu's "Add from a link"). */
  openImport: boolean;
  /** A recipe the server already imported (the page without JavaScript, or a link with `?from=`). */
  imported?: RecipeFormValues;
}) {
  const { i18n } = useLingui();
  const [dialogOpen, setDialogOpen] = useState(openImport);
  const [imported, setImported] = useState<{ id: number; values: RecipeFormValues } | null>(
    serverImported ? { id: 1, values: serverImported } : null,
  );
  // What to say after an import: the recipe alone, with its photo, or without a photo the page had.
  const [announced, setAnnounced] = useState<"recipe" | "with-photo" | "photo-failed" | null>(serverImported ? "recipe" : null);
  const afterImport = useRef<{ file: File | null } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const pending = afterImport.current;
    afterImport.current = null;
    if (!pending) return;
    // The photo goes into the new form's file field as if it had been chosen; the visitor then checks it like the rest.
    const field = document.getElementById("photo");
    if (pending.file && field instanceof HTMLInputElement) attachFile(field, pending.file);
    document.getElementById("name")?.focus();
  }, [imported]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button ref={opener} type="button" className="btn-secondary" onClick={() => setDialogOpen(true)}>
          {t(i18n)`Add from a link`}
        </button>
        {/* Always on the page, so what happens after the dialog closes is announced. */}
        <p role="status" className="text-sm text-muted">
          {announced === "recipe" && t(i18n)`Recipe imported. Check it, then press “Create recipe”.`}
          {announced === "with-photo" && t(i18n)`Recipe and photo imported. Check them, then press “Create recipe”.`}
          {announced === "photo-failed" &&
            t(i18n)`Recipe imported, but its photo could not be fetched. Check the recipe, then press “Create recipe”.`}
        </p>
      </div>
      <ImportRecipeDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          // Opened on arrival, the dialog has no button to return the focus to. A browser fires `close` while the
          // focus can still be on the (now hidden) field and moves it to the page afterwards, so "still inside the
          // dialog, or nowhere" is the sign that it has not gone back to anything: the page's own button is next best.
          queueMicrotask(() => {
            const active = document.activeElement;
            if (!active || active === document.body || active.closest("dialog")) opener.current?.focus();
          });
        }}
        onImported={(values, photo) => {
          afterImport.current = { file: photo.file };
          // The photo needs a description; the recipe's name is where the visitor starts from.
          const start = photo.file ? { ...values, photoAlt: values.name } : values;
          setImported((current) => ({ id: (current?.id ?? 0) + 1, values: start }));
          setAnnounced(photo.file ? "with-photo" : photo.failed ? "photo-failed" : "recipe");
        }}
      />
      <RecipeForm
        key={imported?.id ?? 0}
        action={createRecipe}
        tagSuggestions={tagSuggestions}
        unitSuggestions={unitSuggestions}
        initialValues={imported?.values}
      />
    </>
  );
}
