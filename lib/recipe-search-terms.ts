/**
 * The suggestions under the recipe list's search box. Safe for client code: the page hands the
 * box every name it could complete to, and the box narrows them as the user types.
 */

/** What the search box starts suggesting at: fewer letters match too much to help. */
export const MIN_SUGGESTION_LENGTH = 3;
/** How many suggestions are listed. */
export const MAX_SUGGESTIONS = 8;

export type SearchTerm = { text: string; kind: "recipe" | "tag" | "ingredient" };

const normalize = (text: string) => text.trim().toLowerCase();

/**
 * The terms containing what is typed, once it has at least `MIN_SUGGESTION_LENGTH` letters.
 * Those that start with it come first, then those that only contain it; each group keeps the
 * order it came in.
 */
export function searchSuggestions(terms: SearchTerm[], typed: string): SearchTerm[] {
  const needle = normalize(typed);
  if (needle.length < MIN_SUGGESTION_LENGTH) return [];
  const starting: SearchTerm[] = [];
  const containing: SearchTerm[] = [];
  for (const term of terms) {
    const text = normalize(term.text);
    if (text.startsWith(needle)) starting.push(term);
    else if (text.includes(needle)) containing.push(term);
  }
  return [...starting, ...containing].slice(0, MAX_SUGGESTIONS);
}
