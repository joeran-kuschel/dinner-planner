/**
 * The recipe list's search as its address carries it (`?q=…&tag=…&fav=1&sort=…`). Safe for client code: the sort select
 * builds the address it moves to; the server-only part of the search (reading it, the queries) is `lib/recipe-search.ts`.
 */

import type { RecipeSearch } from "@/lib/recipe-search";
import { DEFAULT_RECIPE_SORT } from "@/lib/recipe-sort";

/** The search as address parameters (`?q=…&tag=…`), empty when nothing filters or sorts. Encoded, so safe in an `href`. */
export function searchQuery({ text, tags, favorites, sort }: RecipeSearch): string {
  const params = new URLSearchParams();
  if (text) params.set("q", text);
  for (const tag of tags) params.append("tag", tag);
  if (favorites) params.set("fav", "1");
  if (sort !== DEFAULT_RECIPE_SORT) params.set("sort", sort);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The recipe list filtered by a search: where "Back to recipes" leads. */
export const recipeListHref = (search: RecipeSearch) => `/recipes${searchQuery(search)}`;

/** A recipe's page, carrying the search it was opened from, so the way back keeps the filter. */
export const recipeHref = (id: string, search: RecipeSearch) => `/recipes/${id}${searchQuery(search)}`;
