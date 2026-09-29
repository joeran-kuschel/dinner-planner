"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import Link from "next/link";
import { type InputHTMLAttributes, useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { MAX_SERVINGS } from "@/lib/planner";
import {
  EMPTY_RECIPE_FORM_STATE,
  MAX_PREP_MINUTES,
  type IngredientValues,
  type RecipeFormState,
  type RecipeFormValues,
} from "@/lib/recipe-form";

export type RecipeFormProps = {
  action: (state: RecipeFormState, formData: FormData) => Promise<RecipeFormState>;
  /** Present when editing; absent when creating. */
  recipe?: {
    id: string;
    name: string;
    description: string | null;
    servings: number;
    prepMinutes: number | null;
    sourceUrl: string | null;
    instructions: string | null;
    ingredients: { name: string; quantity: number | null; unit: string | null }[];
  };
};

const BLANK_ROW: IngredientValues = { name: "", quantity: "", unit: "" };

/** A new recipe starts with three empty rows — enough to look fillable. */
const NEW_RECIPE: RecipeFormValues = {
  name: "",
  description: "",
  servings: "2",
  prepMinutes: "",
  sourceUrl: "",
  instructions: "",
  ingredients: [BLANK_ROW, BLANK_ROW, BLANK_ROW],
};

function toFormValues(recipe: RecipeFormProps["recipe"]): RecipeFormValues {
  if (!recipe) return NEW_RECIPE;
  return {
    name: recipe.name,
    description: recipe.description ?? "",
    servings: String(recipe.servings),
    prepMinutes: recipe.prepMinutes === null ? "" : String(recipe.prepMinutes),
    sourceUrl: recipe.sourceUrl ?? "",
    instructions: recipe.instructions ?? "",
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((row) => ({
          name: row.name,
          quantity: row.quantity === null ? "" : String(row.quantity),
          unit: row.unit ?? "",
        }))
      : NEW_RECIPE.ingredients,
  };
}

export function RecipeForm({ action, recipe }: RecipeFormProps) {
  const [state, formAction] = useActionState(action, EMPTY_RECIPE_FORM_STATE);
  const { i18n } = useLingui();

  // React resets the form once the action resolves, so a rejected submission is
  // re-filled from the values the action handed back rather than from the props.
  const values = state.values ?? toFormValues(recipe);
  const ingredients = useIngredientRows(values.ingredients, state.attempt);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      {recipe && <input type="hidden" name="id" value={recipe.id} />}

      {state.error && (
        <p role="alert" className="card border-accent bg-accent-soft p-3 text-sm">
          {i18n._(state.error)}
        </p>
      )}

      {/* Re-keying on `attempt` makes the reset inputs pick up the echoed defaults. */}
      <RecipeFields key={`fields-${state.attempt}`} values={values} />
      <IngredientRows key={`rows-${state.attempt}`} {...ingredients} />
      <MethodField key={`method-${state.attempt}`} instructions={values.instructions} />

      <div className="flex items-center gap-3">
        <SubmitButton label={recipe ? t(i18n)`Save changes` : t(i18n)`Create recipe`} />
        <Link href={recipe ? `/recipes/${recipe.id}` : "/recipes"} className="btn-ghost">
          {t(i18n)`Cancel`}
        </Link>
      </div>
    </form>
  );
}

type Row = { id: number; value: IngredientValues };

/**
 * The ingredient rows. Rows are keyed by a counter, not by index, so removing
 * a row does not make React reuse the wrong input's DOM state. A rejected
 * attempt replaces the rows with what was submitted.
 */
function useIngredientRows(ingredients: IngredientValues[], attempt: number) {
  const [rows, setRows] = useState(() => seedRows(ingredients));
  const [nextId, setNextId] = useState(() => rows.length);

  const [syncedAttempt, setSyncedAttempt] = useState(attempt);
  if (attempt !== syncedAttempt) {
    setSyncedAttempt(attempt);
    const seeded = seedRows(ingredients);
    setRows(seeded);
    // From the rows shown, not the echo: an empty echo still shows one blank row.
    setNextId(seeded.length);
  }

  const addRow = () => {
    setRows((current) => [...current, { id: nextId, value: BLANK_ROW }]);
    setNextId((id) => id + 1);
  };
  const removeRow = (id: number) =>
    setRows((current) => (current.length === 1 ? current : current.filter((row) => row.id !== id)));

  return { rows, addRow, removeRow };
}

function seedRows(ingredients: IngredientValues[]): Row[] {
  const source = ingredients.length ? ingredients : [BLANK_ROW];
  return source.map((value, id) => ({ id, value }));
}

function RecipeFields({ values }: { values: RecipeFormValues }) {
  const { i18n } = useLingui();
  return (
    <section className="card flex flex-col gap-4 p-4">
      <Field
        label={t(i18n)`Name`}
        name="name"
        required
        defaultValue={values.name}
        placeholder={t(i18n)`Mushroom risotto`}
      />
      <Field
        label={t(i18n)`Description`}
        name="description"
        defaultValue={values.description}
        placeholder={t(i18n)`One line on why you make this`}
      />
      <RecipeNumbers values={values} />
    </section>
  );
}

/** Servings, prep time and source, side by side from `sm`. */
function RecipeNumbers({ values }: { values: RecipeFormValues }) {
  const { i18n } = useLingui();
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      <Field
        label={t(i18n)`Serves`}
        name="servings"
        type="number"
        min={1}
        max={MAX_SERVINGS}
        defaultValue={values.servings}
        hint={t(i18n)`Quantities below are for this many people.`}
      />
      <Field
        label={t(i18n)`Minutes`}
        name="prepMinutes"
        type="number"
        min={1}
        max={MAX_PREP_MINUTES}
        defaultValue={values.prepMinutes}
      />
      <Field
        label={t(i18n)`Source`}
        name="sourceUrl"
        type="url"
        defaultValue={values.sourceUrl}
        placeholder="https://…"
      />
    </div>
  );
}

/** A labelled input; the field name doubles as its id. */
function Field({
  label,
  name,
  hint,
  ...input
}: { label: string; name: keyof RecipeFormValues; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
      </label>
      <input id={name} name={name} className="field mt-1" {...input} />
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function IngredientRows({
  rows,
  addRow,
  removeRow,
}: ReturnType<typeof useIngredientRows>) {
  const { i18n } = useLingui();
  return (
    <section className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{t(i18n)`Ingredients`}</h2>
        <p className="text-xs text-muted">{t(i18n)`Leave the amount blank for “to taste”.`}</p>
      </div>

      <ul className="flex flex-col gap-2">
        {rows.map((row, index) => (
          <IngredientRow key={row.id} row={row} number={index + 1} onRemove={() => removeRow(row.id)} />
        ))}
      </ul>

      <button type="button" onClick={addRow} className="btn-secondary self-start">
        {t(i18n)`Add ingredient`}
      </button>
    </section>
  );
}

function IngredientRow({ row, number, onRemove }: { row: Row; number: number; onRemove: () => void }) {
  const { i18n } = useLingui();
  return (
    <li className="flex items-start gap-2">
      <input
        name="ingredientQuantity"
        className="field w-20"
        inputMode="decimal"
        aria-label={t(i18n)`Amount for ingredient ${number}`}
        defaultValue={row.value.quantity}
        placeholder="200"
      />
      <input
        name="ingredientUnit"
        className="field w-20"
        aria-label={t(i18n)`Unit for ingredient ${number}`}
        defaultValue={row.value.unit}
        placeholder={t(i18n)`g`}
      />
      <input
        name="ingredientName"
        className="field flex-1"
        aria-label={t(i18n)`Name of ingredient ${number}`}
        defaultValue={row.value.name}
        placeholder={t(i18n)`Arborio rice`}
      />
      <button
        type="button"
        onClick={onRemove}
        className="btn-ghost px-2"
        aria-label={t(i18n)`Remove ingredient ${number}`}
      >
        ✕
      </button>
    </li>
  );
}

function MethodField({ instructions }: { instructions: string }) {
  const { i18n } = useLingui();
  return (
    <section className="card flex flex-col gap-2 p-4">
      <label className="label" htmlFor="instructions">
        {t(i18n)`Method`}
      </label>
      <textarea
        id="instructions"
        name="instructions"
        rows={8}
        className="field font-mono text-xs leading-relaxed"
        defaultValue={instructions}
        placeholder={t(i18n)`One step per line.
Soften the onion…
Toast the rice…`}
      />
    </section>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  const { i18n } = useLingui();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? t(i18n)`Saving…` : label}
    </button>
  );
}
