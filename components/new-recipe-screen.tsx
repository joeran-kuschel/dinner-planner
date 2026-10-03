"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";
import { createRecipe } from "@/app/actions/recipes";
import { ImportRecipeDialog } from "@/components/import-recipe-dialog";
import { RecipeForm } from "@/components/recipe-form";
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
  const [announced, setAnnounced] = useState(Boolean(serverImported));
  const focusName = useRef(false);
  const opener = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (focusName.current) document.getElementById("name")?.focus();
    focusName.current = false;
  }, [imported]);

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <button ref={opener} type="button" className="btn-secondary" onClick={() => setDialogOpen(true)}>
          {t(i18n)`Add from a link`}
        </button>
        {/* Always on the page, so what happens after the dialog closes is announced. */}
        <p role="status" className="text-sm text-muted">
          {announced ? t(i18n)`Recipe imported. Check it, then press “Create recipe”.` : ""}
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
        onImported={(values) => {
          focusName.current = true;
          setImported((current) => ({ id: (current?.id ?? 0) + 1, values }));
          setAnnounced(true);
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
