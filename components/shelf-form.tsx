"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useId } from "react";
import { CategorySelect } from "@/components/category-select";
import { RequiredMark, RequiredNote } from "@/components/required-mark";
import type { GroceryCategory } from "@/lib/grocery-category";
import { MAX_SHELF_NAME, MAX_SHELF_UNIT } from "@/lib/shelf";

export type ShelfFormValues = {
  label: string;
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
  /** Day key (`YYYY-MM-DD`). */
  boughtOn: string;
};

export type ShelfFormProps = {
  action: (formData: FormData) => Promise<void>;
  values: ShelfFormValues;
  submitLabel: string;
  /** The entry that is changed; left out when one is added. */
  id?: string;
  /** Called when the form is sent, e.g. to close the disclosure it sits in. */
  onSubmit?: () => void;
};

/** The fields of a purchase on the shelf, for adding one and for changing one. Plain form, so it works without JavaScript. */
export function ShelfForm({ action, values, submitLabel, id, onSubmit }: ShelfFormProps) {
  const { i18n } = useLingui();
  const prefix = useId();
  return (
    <form action={action} onSubmit={onSubmit} className="flex flex-wrap items-end gap-2">
      {id && <input type="hidden" name="id" value={id} />}
      <div className="basis-full">
        <RequiredNote>{t(i18n)`required`}</RequiredNote>
      </div>
      <div className="min-w-48 flex-1">
        <label className="label" htmlFor={`${prefix}-label`}>
          {t(i18n)`Item`} <RequiredMark title={t(i18n)`Required`} />
        </label>
        <input
          id={`${prefix}-label`}
          name="label"
          className="field mt-1"
          required
          maxLength={MAX_SHELF_NAME}
          defaultValue={values.label}
          placeholder={t(i18n)`Milk`}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-quantity`}>
          {t(i18n)`Amount`}
        </label>
        <input
          id={`${prefix}-quantity`}
          name="quantity"
          className="field mt-1 w-20"
          inputMode="decimal"
          defaultValue={values.quantity ?? ""}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-unit`}>
          {t(i18n)`Unit`}
        </label>
        <input
          id={`${prefix}-unit`}
          name="unit"
          className="field mt-1 w-20"
          maxLength={MAX_SHELF_UNIT}
          defaultValue={values.unit ?? ""}
          placeholder={t(i18n)`l`}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-bought`}>
          {t(i18n)`Bought on`} <RequiredMark title={t(i18n)`Required`} />
        </label>
        <input
          id={`${prefix}-bought`}
          name="boughtOn"
          type="date"
          className="field mt-1"
          required
          defaultValue={values.boughtOn}
        />
      </div>
      <div>
        <label className="label" htmlFor={`${prefix}-category`}>
          {t(i18n)`Category`}
        </label>
        <CategorySelect id={`${prefix}-category`} name="category" className="field mt-1" defaultValue={values.category} />
      </div>
      <button type="submit" className="btn-primary">
        {submitLabel}
      </button>
    </form>
  );
}
