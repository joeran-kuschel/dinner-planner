"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useRouter } from "next/navigation";
import { type ChangeEvent, useState, useTransition } from "react";
import type { RecipeSearch } from "@/lib/recipe-search";
import { recipeListHref } from "@/lib/recipe-search-url";
import { parseRecipeSort, RECIPE_SORTS, recipeSortLabel } from "@/lib/recipe-sort";

/**
 * The recipe list's sort. A choice applies at once: the address moves to the same search in the new order (the filter, the
 * tags and the text as the page shows them, whatever is typed but not searched yet stays where it is), and a polite status
 * says so. The list is re-ordered in place, the focus stays on the select. Without JavaScript the search form's Search button
 * sends it.
 */
export function RecipeSortSelect({ search }: { search: RecipeSearch }) {
  const { i18n } = useLingui();
  const router = useRouter();
  const [selected, setSelected] = useState(search.sort);
  const [shown, setShown] = useState(search.sort);
  const [announcement, setAnnouncement] = useState("");
  const [, startTransition] = useTransition();

  // The address changed by itself (the back button): the select follows it.
  if (shown !== search.sort) {
    setShown(search.sort);
    setSelected(search.sort);
    // What the status said belongs to the choice that was made, not to this order.
    if (search.sort !== selected) setAnnouncement("");
  }

  const change = (event: ChangeEvent<HTMLSelectElement>) => {
    const sort = parseRecipeSort(event.target.value);
    setSelected(sort);
    setAnnouncement(t(i18n)`Sorted by: ${recipeSortLabel(sort, i18n)}`);
    startTransition(() => router.replace(recipeListHref({ ...search, sort })));
  };

  return (
    // At the right end of the row beside Favorites only from sm (level with the Search button above); on a phone the label goes above the select and the select takes the width (there is no room for both in a line).
    <div className="flex min-w-60 flex-1 flex-col gap-1 sm:ml-auto sm:flex-none sm:flex-row sm:items-center sm:gap-2">
      <label htmlFor="recipe-sort" className="label whitespace-nowrap">
        {t(i18n)`Sort by`}
      </label>
      <select id="recipe-sort" name="sort" value={selected} onChange={change} className="field w-full sm:w-auto">
        {RECIPE_SORTS.map((sort) => (
          <option key={sort} value={sort}>
            {recipeSortLabel(sort, i18n)}
          </option>
        ))}
      </select>
      <p role="status" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
