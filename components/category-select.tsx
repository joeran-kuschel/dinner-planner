"use client";

import { useLingui } from "@lingui/react";
import type { SelectHTMLAttributes } from "react";
import { type CategoryRow, categoryName, otherCategoryId } from "@/lib/grocery-category";

/**
 * The shop sections as a `<select>`, in shop order, "Other" unless a `defaultValue` (a category id) says otherwise.
 * The caller supplies the label and the sections (`loadCategories()` on the server).
 */
export function CategorySelect({
  categories,
  ...props
}: { categories: readonly CategoryRow[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  const { i18n } = useLingui();
  return (
    <select defaultValue={otherCategoryId(categories)} {...props}>
      {categories.map((category) => (
        <option key={category.id} value={category.id}>
          {categoryName(category, i18n)}
        </option>
      ))}
    </select>
  );
}
