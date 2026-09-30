"use client";

import { useLingui } from "@lingui/react";
import type { SelectHTMLAttributes } from "react";
import { categoryLabel, DEFAULT_GROCERY_CATEGORY, GROCERY_CATEGORIES } from "@/lib/grocery-category";

/** The shop sections as a `<select>`, "Other" unless told otherwise. The caller supplies the label. */
export function CategorySelect(props: SelectHTMLAttributes<HTMLSelectElement>) {
  const { i18n } = useLingui();
  return (
    <select defaultValue={DEFAULT_GROCERY_CATEGORY} {...props}>
      {GROCERY_CATEGORIES.map((category) => (
        <option key={category} value={category}>
          {categoryLabel(category, i18n)}
        </option>
      ))}
    </select>
  );
}
