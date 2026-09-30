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

export function recipeSearchWhere({ text, tags }: RecipeSearch): Prisma.RecipeWhereInput {
  // `contains` hands `%` and `_` on as LIKE wildcards; a search for them means the characters.
  const contains = { contains: text.replace(/[\\%_]/g, "\\$&"), mode: "insensitive" } as const;
  return {
    AND: [
      ...(text
        ? [
            {
              OR: [
                { name: contains },
                { tags: { some: { name: contains } } },
                { ingredients: { some: { name: contains } } },
              ],
            },
          ]
        : []),
      ...tags.map((name) => ({ tags: { some: { name } } })),
    ],
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
