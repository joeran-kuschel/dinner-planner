"use client";

import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useEffect, useRef, useState } from "react";
import {
  addGroceryCategory,
  deleteGroceryCategory,
  moveGroceryCategory,
  renameGroceryCategory,
} from "@/app/actions/grocery-categories";
import { ConfirmAction } from "@/components/confirm-action";
import {
  type CategoryError,
  type CategoryRow,
  categoryName,
  MAX_CATEGORIES,
  MAX_CATEGORY_NAME,
  OTHER_KEY,
} from "@/lib/grocery-category";

export type ManagedCategory = CategoryRow & {
  /** Ingredients and list entries filed under it: what a delete moves to "Other". */
  ingredients: number;
  entries: number;
};

/**
 * The shop sections of the grocery list, to rename, move and delete, and one to add. Plain forms that name their fields
 * with the `form` attribute (so a row can wrap on a phone), which also work without JavaScript; the script only keeps
 * the keyboard focus on the button that moved a section and says where it went. "Other" is last and stays: it can be
 * renamed, but not moved or deleted.
 */
export function CategoryManager({
  categories,
  error,
  refusal,
}: {
  categories: ManagedCategory[];
  error: CategoryError | null;
  /** What came back with a refusal: the section it was for (none for "Add"), the name that was typed, and a number that is new every time. */
  refusal: { id?: string; name?: string; nonce?: string };
}) {
  const { i18n } = useLingui();
  const list = useRef<HTMLOListElement>(null);
  const pending = useRef<{ id: string; direction: "up" | "down"; at: number } | null>(null);
  const known = useRef(new Map(categories.map((category) => [category.id, categoryName(category, i18n)])));
  const [announcement, setAnnouncement] = useState("");
  const order = categories.map((category) => category.id).join(",");
  // While an earlier refusal is on screen, a change that goes through sends the page back to its bare address, which clears it.
  const clear = error ? <input type="hidden" name="clear" value="1" /> : null;

  // After a move the section is somewhere else in the list, and the browser drops the focus of a button that moves:
  // put it back on the same button (or on the other one, when the section reached an end) and say where it is now.
  useEffect(() => {
    // A section that is gone was deleted: say so (the focus goes to the add field, see `focusAfter`).
    const names = new Map(categories.map((category) => [category.id, categoryName(category, i18n)]));
    const removed = [...known.current].find(([id]) => !names.has(id));
    known.current = names;
    if (removed) setAnnouncement(t(i18n)`${removed[1]} deleted`);

    // A move that changed nothing (a stale page) leaves its mark behind: it only counts for a few seconds.
    const moved = pending.current;
    pending.current = null;
    if (!moved || Date.now() - moved.at > 5000) return;
    const index = categories.findIndex((category) => category.id === moved.id);
    if (index < 0) return;
    const name = categoryName(categories[index], i18n);
    setAnnouncement(t(i18n)`${name} moved to position ${index + 1} of ${categories.length}`);
    const buttons = list.current?.querySelectorAll<HTMLButtonElement>(`button[data-move="${CSS.escape(moved.id)}"]`);
    const same = [...(buttons ?? [])].find((button) => button.value === moved.direction && !button.disabled);
    const other = [...(buttons ?? [])].find((button) => !button.disabled);
    (same ?? other)?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs when the order changes
  }, [order]);

  const otherName = categoryName(categories.find((category) => category.key === OTHER_KEY) ?? categories[categories.length - 1], i18n);

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <p key={refusal.nonce} role="alert" className="rounded-xl border border-danger/30 bg-danger-soft px-3 py-2 text-sm font-medium text-danger">
          {error === "empty" && t(i18n)`Give the category a name.`}
          {error === "long" && t(i18n)`A name can have at most ${MAX_CATEGORY_NAME} characters.`}
          {error === "duplicate" && t(i18n)`There is already a category with that name.`}
          {error === "limit" && t(i18n)`You can have at most ${MAX_CATEGORIES} categories.`}
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ol ref={list} className="card divide-y divide-border">
        {categories.map((category, index) => {
          const name = categoryName(category, i18n);
          const isOther = category.key === OTHER_KEY;
          const canUp = !isOther && index > 0;
          const canDown = !isOther && index < categories.length - 1 && categories[index + 1].key !== OTHER_KEY;
          const unnamed = category.key !== null && category.name === null;
          const nameId = `category-name-${category.id}`;
          const hintId = `category-hint-${category.id}`;

          return (
            <li key={category.id} className="flex flex-wrap items-end gap-2 p-3">
              <form id={`rename-${category.id}`} action={renameGroceryCategory}>
                <input type="hidden" name="id" value={category.id} />
                {clear}
              </form>
              <form id={`move-${category.id}`} action={moveGroceryCategory}>
                <input type="hidden" name="id" value={category.id} />
                {clear}
              </form>

              <div className="min-w-48 flex-1 basis-full sm:basis-0">
                <label className="label" htmlFor={nameId}>
                  {t(i18n)`Name`}
                  <span className="sr-only">{` ${index + 1}`}</span>
                </label>
                <input
                  // A new language names an unnamed section anew, so the field starts over.
                  key={`${category.id}-${name}-${refusal.nonce ?? ""}`}
                  id={nameId}
                  form={`rename-${category.id}`}
                  name="name"
                  defaultValue={error && refusal.id === category.id ? (refusal.name ?? name) : name}
                  maxLength={MAX_CATEGORY_NAME}
                  autoComplete="off"
                  aria-describedby={isOther || unnamed ? hintId : undefined}
                  className="field mt-1"
                />
                {(isOther || unnamed) && (
                  <p id={hintId} className="mt-1 text-xs text-muted">
                    {isOther
                      ? t(i18n)`Where items go when their category is deleted. Always last.`
                      : t(i18n)`Shown in the page's language until you rename it.`}
                  </p>
                )}
              </div>

              <button type="submit" form={`rename-${category.id}`} className="btn-primary flex-1 sm:flex-none">
                {t(i18n)`Save`}
                <span className="sr-only">{` ${name}`}</span>
              </button>

              <div className="flex gap-1.5">
                <button
                  type="submit"
                  form={`move-${category.id}`}
                  name="direction"
                  value="up"
                  data-move={category.id}
                  disabled={!canUp}
                  onClick={() => {
                    pending.current = { id: category.id, direction: "up", at: Date.now() };
                  }}
                  className="btn-secondary w-11 px-0"
                  aria-label={t(i18n)`Move ${name} up`}
                >
                  <span aria-hidden>↑</span>
                </button>
                <button
                  type="submit"
                  form={`move-${category.id}`}
                  name="direction"
                  value="down"
                  data-move={category.id}
                  disabled={!canDown}
                  onClick={() => {
                    pending.current = { id: category.id, direction: "down", at: Date.now() };
                  }}
                  className="btn-secondary w-11 px-0"
                  aria-label={t(i18n)`Move ${name} down`}
                >
                  <span aria-hidden>↓</span>
                </button>
              </div>

              <div className="basis-full sm:basis-auto [&_summary]:w-full [&_summary]:justify-center sm:[&_summary]:w-auto">
                {isOther ? (
                  <button type="button" disabled className="btn-danger-quiet w-full sm:w-auto" aria-label={t(i18n)`Delete ${name}`}>
                    {t(i18n)`Delete`}
                  </button>
                ) : (
                  <ConfirmAction
                    label={t(i18n)`Delete`}
                    accessibleLabel={t(i18n)`Delete ${name}`}
                    question={
                      category.ingredients + category.entries === 0
                        ? t(i18n)`Delete ${name}? Nothing is filed under it.`
                        : t(i18n)`Delete ${name}? Its ${plural(category.ingredients, { one: "# ingredient", other: "# ingredients" })} and ${plural(category.entries, { one: "# list entry", other: "# list entries" })} move to ${otherName}.`
                    }
                    confirmLabel={t(i18n)`Delete category`}
                    action={deleteGroceryCategory}
                    fields={{ id: category.id, ...(error ? { clear: "1" } : {}) }}
                    focusAfter="new-category"
                  />
                )}
              </div>
            </li>
          );
        })}
      </ol>

      <form action={addGroceryCategory} className="card flex flex-wrap items-end gap-2 p-3">
        {clear}
        <div className="min-w-48 flex-1">
          <label className="label" htmlFor="new-category">
            {t(i18n)`Add a category`}
          </label>
          <input
            key={refusal.nonce ?? ""}
            id="new-category"
            name="name"
            defaultValue={error && !refusal.id ? (refusal.name ?? "") : ""}
            maxLength={MAX_CATEGORY_NAME}
            autoComplete="off"
            placeholder={t(i18n)`Pet food`}
            className="field mt-1"
          />
        </div>
        <button type="submit" className="btn-primary">
          {t(i18n)`Add category`}
        </button>
      </form>
    </div>
  );
}
