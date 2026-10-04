/**
 * Finding recipes: the list's text search and tag filter, and the tags in use.
 * Server only (it builds Prisma queries).
 */

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { SearchTerm } from "@/lib/recipe-search-terms";
import { rawText } from "@/lib/form-data";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTag } from "@/lib/tags";

/** The longest search word read from the address. */
export const MAX_SEARCH_LENGTH = 100;

export type RecipeSearch = {
  /** Matches a recipe's name, one of its tags or one of its ingredients. */
  text: string;
  /** Every one of these tags must be on the recipe. */
  tags: string[];
};

/** The search as the list's address carries it (`?q=…&tag=…&tag=…`); anything else is ignored. */
export function readRecipeSearch(params: { q?: string | string[]; tag?: string | string[] }): RecipeSearch {
  // The address is user input: Postgres refuses a NUL character, and there is no use for more.
  const one = (value: string | string[] | undefined) => (typeof value === "string" ? rawText(value) : "");
  const many = (value: string | string[] | undefined) => (Array.isArray(value) ? value : value ? [value] : []);
  const tags = many(params.tag)
    .map((tag) => normalizeTag(rawText(tag)))
    .filter((tag) => tag && tag.length <= MAX_TAG_LENGTH);
  return {
    text: one(params.q).trim().slice(0, MAX_SEARCH_LENGTH),
    tags: [...new Set(tags)].slice(0, MAX_TAGS),
  };
}

/** The search as address parameters (`?q=…&tag=…`), empty when nothing filters. Encoded, so safe in an `href`. */
function searchQuery({ text, tags }: RecipeSearch): string {
  const params = new URLSearchParams();
  if (text) params.set("q", text);
  for (const tag of tags) params.append("tag", tag);
  const query = params.toString();
  return query ? `?${query}` : "";
}

/** The recipe list filtered by a search: where "Back to recipes" leads. */
export const recipeListHref = (search: RecipeSearch) => `/recipes${searchQuery(search)}`;

/** A recipe's page, carrying the search it was opened from, so the way back keeps the filter. */
export const recipeHref = (id: string, search: RecipeSearch) => `/recipes/${id}${searchQuery(search)}`;

/**
 * The words of a search text: split on spaces and commas, a phrase in double quotes kept whole.
 * At most `MAX_TAGS` different words, each cut at `MAX_SEARCH_LENGTH`.
 */
export function searchWords(text: string): string[] {
  const words = [...text.matchAll(/"([^"]*)"|[^\s,"]+/g)]
    .map((match) => (match[1] ?? match[0]).trim().replace(/\s+/g, " ").slice(0, MAX_SEARCH_LENGTH))
    .filter(Boolean);
  return [...new Set(words)].slice(0, MAX_TAGS);
}

export function recipeSearchWhere({ text, tags }: RecipeSearch): Prisma.RecipeWhereInput {
  // The text, or one word of it, matches a recipe's name, one of its tags or one of its ingredients.
  const matches = (word: string): Prisma.RecipeWhereInput => {
    // `contains` hands `%` and `_` on as LIKE wildcards; a search for them means the characters.
    const contains = { contains: word.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } as const;
    return {
      OR: [
        { name: contains },
        { tags: { some: { name: contains } } },
        { ingredients: { some: { name: contains } } },
      ],
    };
  };
  const words = searchWords(text);
  // The whole text keeps every search that worked before; with several words, every word may
  // instead match somewhere (not necessarily in the same field).
  const wholeOrWords: Prisma.RecipeWhereInput =
    !words.length || (words.length === 1 && words[0] === text)
      ? matches(text)
      : { OR: [matches(text), { AND: words.map(matches) }] };
  return {
    AND: [...(text ? [wholeOrWords] : []), ...tags.map((name) => ({ tags: { some: { name } } }))],
  };
}

/**
 * Everything the search box can complete to: recipe names, tags and ingredient names, once each
 * (a word that is a recipe and an ingredient is listed as the recipe), in alphabetical order
 * within each kind.
 */
export async function searchTerms(): Promise<SearchTerm[]> {
  const [recipes, tags, ingredients] = await Promise.all([
    prisma.recipe.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    prisma.tag.findMany({ select: { name: true }, orderBy: { name: "asc" } }),
    prisma.ingredient.findMany({ select: { name: true }, distinct: ["name"], orderBy: { name: "asc" } }),
  ]);
  const seen = new Set<string>();
  const terms: SearchTerm[] = [];
  for (const [kind, rows] of [
    ["recipe", recipes],
    ["tag", tags],
    ["ingredient", ingredients],
  ] as const) {
    for (const { name } of rows) {
      const key = name.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      terms.push({ text: name.trim(), kind });
    }
  }
  return terms;
}

/** Every tag in use, in alphabetical order. */
export async function tagNames(): Promise<string[]> {
  const tags = await prisma.tag.findMany({ select: { name: true }, orderBy: { name: "asc" } });
  return tags.map((tag) => tag.name);
}
