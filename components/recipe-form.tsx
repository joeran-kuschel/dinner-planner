"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import Link from "next/link";
import {
  type ChangeEvent,
  type FormEvent,
  type InputHTMLAttributes,
  startTransition,
  type KeyboardEvent,
  useActionState,
  useEffect,
  useRef,
  useState,
} from "react";
import { CategorySelect } from "@/components/category-select";
import { TagInput } from "@/components/tag-input";
import { RecipePhoto } from "@/components/recipe-photo";
import { RequiredMark, RequiredNote } from "@/components/required-mark";
import { DEFAULT_GROCERY_CATEGORY, type GroceryCategory, parseGroceryCategory } from "@/lib/grocery-category";
import { MAX_SERVINGS } from "@/lib/planner";
import {
  EMPTY_RECIPE_FORM_STATE,
  MAX_PREP_MINUTES,
  type IngredientValues,
  type RecipeFormState,
  type RecipeFormValues,
} from "@/lib/recipe-form";
import {
  MAX_PHOTO_ALT_LENGTH,
  MAX_PHOTO_BYTES,
  MAX_PHOTO_MEGABYTES,
  PHOTO_THUMB_HEIGHT,
  PHOTO_THUMB_WIDTH,
} from "@/lib/recipe-photo-shared";

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
    /** The recipe's photo, if it has one; `version` is its last change, see `recipePhotoUrl`. */
    photo?: { alt: string; version: number } | null;
    ingredients: { name: string; quantity: number | null; unit: string | null; category: GroceryCategory }[];
    tags: string[];
  };
  /** The tags in use, offered while typing one. */
  tagSuggestions?: string[];
  /** The units to offer in the ingredient rows. */
  unitSuggestions?: string[];
};

const BLANK_ROW: IngredientValues = { name: "", quantity: "", unit: "", category: DEFAULT_GROCERY_CATEGORY };

/** A new recipe starts with three empty rows — enough to look fillable. */
const NEW_RECIPE: RecipeFormValues = {
  name: "",
  description: "",
  servings: "2",
  prepMinutes: "",
  sourceUrl: "",
  instructions: "",
  photoAlt: "",
  tags: [],
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
    photoAlt: recipe.photo?.alt ?? "",
    tags: recipe.tags,
    ingredients: recipe.ingredients.length
      ? recipe.ingredients.map((row) => ({
          name: row.name,
          quantity: row.quantity === null ? "" : String(row.quantity),
          unit: row.unit ?? "",
          category: row.category,
        }))
      : NEW_RECIPE.ingredients,
  };
}

export function RecipeForm({ action, recipe, tagSuggestions = [], unitSuggestions = [] }: RecipeFormProps) {
  const [state, formAction, pending] = useActionState(action, EMPTY_RECIPE_FORM_STATE);
  const { i18n } = useLingui();

  // React resets a form once its action resolves, which would empty the photo field: a
  // browser cannot fill a file field in again, so a refused form would lose the photo, and
  // the retry would save the recipe without it. Submitting through a transition skips the
  // reset. The `action` prop stays for browsers without JavaScript, where the form posts
  // normally and the page is rendered again from `state`.
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => formAction(data));
  };

  // Also without the reset, a rejected submission is re-filled from the values the action
  // handed back, which covers the browsers without JavaScript.
  const values = state.values ?? toFormValues(recipe);
  const ingredients = useIngredientRows(values.ingredients, state.attempt);

  return (
    <form action={formAction} onSubmit={submit} className="flex flex-col gap-6">
      {recipe && <input type="hidden" name="id" value={recipe.id} />}

      <RequiredNote>{t(i18n)`required`}</RequiredNote>

      {state.error && (
        <p role="alert" className="card border-accent bg-accent-soft p-3 text-sm">
          {i18n._(state.error)}
        </p>
      )}

      {/* Re-keying on `attempt` makes the inputs pick up the echoed defaults. The photo section
          is not re-keyed: its file field keeps the chosen file. */}
      <RecipeFields key={`fields-${state.attempt}`} values={values} />
      <PhotoFields recipe={recipe} alt={values.photoAlt} />
      <TagInput key={`tags-${state.attempt}`} initial={values.tags} suggestions={tagSuggestions} />
      <IngredientRows key={`rows-${state.attempt}`} {...ingredients} units={unitSuggestions} />
      <MethodField key={`method-${state.attempt}`} instructions={values.instructions} />

      <div className="flex items-center gap-3">
        <SubmitButton label={recipe ? t(i18n)`Save changes` : t(i18n)`Create recipe`} pending={pending} />
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
        label={t(i18n)`Prep time (min)`}
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
}: { label: string; name: keyof RecipeFormValues | "photo"; hint?: string } & InputHTMLAttributes<HTMLInputElement>) {
  const { i18n } = useLingui();
  return (
    <div>
      <label className="label" htmlFor={name}>
        {label}
        {input.required && (
          <>
            {" "}
            <RequiredMark title={t(i18n)`Required`} />
          </>
        )}
      </label>
      <input
        id={name}
        name={name}
        className="field mt-1"
        aria-describedby={hint ? `${name}-hint` : undefined}
        {...input}
      />
      {hint && (
        <p id={`${name}-hint`} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The recipe's photo: what it shows now (with a way to remove it), a file to
 * choose, and what the photo shows in words. The description is needed for any
 * photo, so a screen reader can say something in its place.
 *
 * The browser checks what it can before anything is sent, so a mistake is caught
 * without a round trip: a file over the limit is refused on the spot, and the
 * description is required as soon as a file is chosen or for a photo that stays. The server checks all of it
 * too, for browsers without JavaScript.
 */
function PhotoFields({ recipe, alt }: { recipe: RecipeFormProps["recipe"]; alt: string }) {
  const { i18n } = useLingui();
  const photo = recipe?.photo;
  const [chosen, setChosen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    setChosen(Boolean(file));
    event.currentTarget.setCustomValidity(
      file && file.size > MAX_PHOTO_BYTES ? t(i18n)`The photo is too large: ${MAX_PHOTO_MEGABYTES} MB at most.` : "",
    );
  };

  return (
    <section className="card flex flex-col gap-4 p-4">
      <h2 className="section-title">{t(i18n)`Photo`}</h2>
      {recipe && photo && (
        <div className="flex flex-wrap items-center gap-4">
          <RecipePhoto
            recipeId={recipe.id}
            version={photo.version}
            alt={photo.alt}
            size="thumb"
            width={PHOTO_THUMB_WIDTH}
            height={PHOTO_THUMB_HEIGHT}
            className="aspect-[3/2] w-40 rounded-lg border border-border object-cover"
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="removePhoto"
              value="1"
              onChange={(event) => setRemoving(event.currentTarget.checked)}
              className="size-4 accent-[var(--accent)]"
            />
            {t(i18n)`Remove photo`}
          </label>
        </div>
      )}
      <Field
        label={photo ? t(i18n)`Replace photo` : t(i18n)`Photo file`}
        name="photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={onFileChange}
        className="field mt-1 file:mr-3 file:rounded-md file:border-0 file:bg-surface-muted file:px-3 file:py-1 file:text-sm file:text-foreground"
        hint={t(i18n)`JPEG, PNG or WebP, up to ${MAX_PHOTO_MEGABYTES} MB.`}
      />
      <Field
        label={t(i18n)`Description of the photo`}
        name="photoAlt"
        defaultValue={alt}
        required={chosen || (Boolean(photo) && !removing)}
        maxLength={MAX_PHOTO_ALT_LENGTH}
        placeholder={t(i18n)`A bowl of red lentil dal with coriander`}
        hint={t(i18n)`Say what it shows, for people who cannot see it. Needed for every photo.`}
      />
    </section>
  );
}

/** The ingredient fields, in row order; Enter in one of them moves on to the next row's first instead of submitting. */
const ROW_FIELDS = ["ingredientQuantity", "ingredientUnit", "ingredientName"];

function IngredientRows({
  rows,
  addRow,
  removeRow,
  units,
}: ReturnType<typeof useIngredientRows> & { units: string[] }) {
  const { i18n } = useLingui();
  const list = useRef<HTMLUListElement>(null);
  const focusAfterAdd = useRef<string | null>(null);

  // A row added by Enter takes the focus once it is on the page.
  useEffect(() => {
    const field = focusAfterAdd.current;
    focusAfterAdd.current = null;
    if (field) list.current?.querySelector<HTMLInputElement>(`li:last-child [name="${field}"]`)?.focus();
  }, [rows.length]);

  // Enter in a field goes to the first field of the next row, adding one after the last. A row with
  // nothing in it lets Enter submit, so the keyboard is never stuck in the list.
  const onKeyDown = (event: KeyboardEvent<HTMLUListElement>) => {
    const field = event.target;
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (!(field instanceof HTMLInputElement) || !ROW_FIELDS.includes(field.name)) return;
    const row = field.closest("li");
    if (!row) return;
    const blank = ROW_FIELDS.every((name) => !row.querySelector<HTMLInputElement>(`[name="${name}"]`)?.value.trim());
    if (blank) return;
    event.preventDefault();
    const [first] = ROW_FIELDS;
    const next = row.nextElementSibling?.querySelector<HTMLInputElement>(`[name="${first}"]`);
    if (next) next.focus();
    else {
      focusAfterAdd.current = first;
      addRow();
    }
  };

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <h2 className="section-title">{t(i18n)`Ingredients`}</h2>
        <p id="ingredients-hint" className="mt-1 text-sm text-muted">
          {t(i18n)`Leave the amount blank for “to taste”.`}
        </p>
      </div>

      {/* The column names, from sm; on a phone each field names itself. The inputs carry their own labels. */}
      <div aria-hidden className="hidden gap-2 text-xs font-semibold text-muted sm:flex">
        <span className="w-20">{t(i18n)`Amount`}</span>
        <span className="w-20">{t(i18n)`Unit`}</span>
        <span className="flex-1">{t(i18n)`Ingredient`}</span>
        <span className="w-44">{t(i18n)`Category`}</span>
        <span className="min-w-9 pointer-coarse:min-w-11" />
      </div>

      <ul ref={list} onKeyDown={onKeyDown} className="flex flex-col gap-3 sm:gap-2">
        {rows.map((row, index) => (
          <IngredientRow key={row.id} row={row} number={index + 1} onRemove={() => removeRow(row.id)} />
        ))}
      </ul>
      <datalist id="unit-suggestions">
        {units.map((unit) => (
          <option key={unit} value={unit} />
        ))}
      </datalist>

      <button type="button" onClick={addRow} className="btn-secondary self-start">
        {t(i18n)`Add ingredient`}
      </button>
    </section>
  );
}

/** A phone's visible name for a field; from sm the column heading above the rows does it. */
function FieldName({ children }: { children: string }) {
  return (
    <span aria-hidden className="text-xs font-semibold text-muted sm:hidden">
      {children}
    </span>
  );
}

function IngredientRow({ row, number, onRemove }: { row: Row; number: number; onRemove: () => void }) {
  const { i18n } = useLingui();
  return (
    <li className="flex flex-wrap items-end gap-2 sm:flex-nowrap">
      <div className="flex w-20 flex-col gap-1">
        <FieldName>{t(i18n)`Amount`}</FieldName>
        <input
          name="ingredientQuantity"
          className="field"
          inputMode="decimal"
          aria-label={t(i18n)`Amount for ingredient ${number}`}
          aria-describedby="ingredients-hint"
          defaultValue={row.value.quantity}
        />
      </div>
      <div className="flex w-20 flex-col gap-1">
        <FieldName>{t(i18n)`Unit`}</FieldName>
        <input
          name="ingredientUnit"
          className="field"
          list="unit-suggestions"
          autoComplete="off"
          aria-label={t(i18n)`Unit for ingredient ${number}`}
          defaultValue={row.value.unit}
        />
      </div>
      <div className="flex min-w-40 flex-1 flex-col gap-1 sm:min-w-0">
        <FieldName>{t(i18n)`Ingredient`}</FieldName>
        <input
          name="ingredientName"
          className="field"
          aria-label={t(i18n)`Name of ingredient ${number}`}
          defaultValue={row.value.name}
        />
      </div>
      <div className="flex w-44 flex-col gap-1">
        <FieldName>{t(i18n)`Category`}</FieldName>
        <CategorySelect
          name="ingredientCategory"
          className="field"
          aria-label={t(i18n)`Category for ingredient ${number}`}
          defaultValue={parseGroceryCategory(row.value.category)}
        />
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="btn-icon"
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

function SubmitButton({ label, pending }: { label: string; pending: boolean }) {
  const { i18n } = useLingui();
  return (
    <button type="submit" className="btn-primary" disabled={pending}>
      {pending ? t(i18n)`Saving…` : label}
    </button>
  );
}
