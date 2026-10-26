/**
 * Plural forms of an ingredient name that is not in the dictionary. Safe for client code.
 *
 * Only regular endings are known, in English and German, since a name carries no language. A name is never
 * turned into a singular on its own: `createCanonicaliser` folds it only when one of the forms below is also on
 * the list ("shallots" and "shallot" in the same week), so an ending that only looks like a plural ("Kuchen",
 * "Wein", "couscous") is never cut.
 */

/** Names (the whole name or its last word) that end like a plural and are none. */
const NEVER_FOLDED: ReadonlySet<string> = new Set([
  "couscous",
  "hummus",
  "asparagus",
  "citrus",
  "molasses",
  "swiss",
  "cress",
  "watercress",
  "grass",
  "lemongrass",
  "bass",
  "gras",
]);

/** The shortest word a singular can be made from; shorter ones ("es", "ei") are left alone. */
const MIN_STEM = 3;

/**
 * The singular forms a normalised name could have, most specific first: "tomatoes" → "tomato", "berries" → "berry",
 * "Tomaten" → "tomate", "Zwiebeln" → "zwiebel". Empty for a name that is not a regular plural.
 */
export function singularCandidates(name: string): string[] {
  const words = name.split(" ");
  const last = words[words.length - 1] ?? "";
  if (NEVER_FOLDED.has(name) || NEVER_FOLDED.has(last)) return [];

  const forms: string[] = [];
  const add = (stem: string) => {
    if (stem.length >= MIN_STEM && stem !== last) forms.push([...words.slice(0, -1), stem].join(" "));
  };

  // English.
  if (last.endsWith("ies")) add(`${last.slice(0, -3)}y`);
  if (last.endsWith("ves")) {
    add(`${last.slice(0, -3)}f`);
    add(`${last.slice(0, -3)}fe`);
  }
  if (/(?:s|x|z|ch|sh|o)es$/.test(last)) add(last.slice(0, -2));
  if (last.endsWith("s") && !/(?:ss|us|is)$/.test(last)) add(last.slice(0, -1));
  // German: "Tomaten", "Zwiebeln", "Erdbeeren" lose their n; "Salze" and "Weine" their e.
  if (/(?:e|l|r)n$/.test(last)) add(last.slice(0, -1));
  if (last.endsWith("e")) add(last.slice(0, -1));

  return [...new Set(forms)];
}
