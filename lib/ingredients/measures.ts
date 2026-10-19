/**
 * The units the grocery list knows by name, in English and German. Safe for client code.
 *
 * Two spellings of one unit are one unit ("EL" and "tbsp", "grams" and "g"): their amounts add up. A unit is
 * never turned into another one, with one exception: a metric unit and its own multiple (g and kg, ml and l),
 * which share a `base`. A spoon, cup or pinch has no fixed weight or size (a tablespoon of salt weighs
 * something else than one of mustard seeds, and spoons differ between countries), so those are never converted.
 *
 * The FIRST name of a language is the one a line shows when the page is in that language. A unit that is not in
 * the table stays as it was typed and only merges with itself.
 */

export type Measure = {
  id: string;
  en: readonly string[];
  de: readonly string[];
  /** For a multiple of a base unit: the unit it is counted in and how many of those it is. */
  base?: { id: string; factor: number };
  /** The name for an amount other than one ("3 cloves", "2 Dosen"), where it differs from the first name. */
  plural?: { en?: string; de?: string };
};

export const MEASURES: readonly Measure[] = [
  { id: "g", en: ["g", "gram", "grams", "gr"], de: ["g", "Gramm", "Gr"] },
  { id: "kg", en: ["kg", "kilogram", "kilograms", "kilo", "kilos"], de: ["kg", "Kilogramm", "Kilo"], base: { id: "g", factor: 1000 } },
  { id: "ml", en: ["ml", "milliliter", "milliliters", "millilitre", "millilitres"], de: ["ml", "Milliliter"] },
  { id: "l", en: ["l", "liter", "liters", "litre", "litres"], de: ["l", "Liter"], base: { id: "ml", factor: 1000 } },
  { id: "tsp", en: ["tsp", "teaspoon", "teaspoons"], de: ["TL", "Teelöffel"] },
  { id: "tbsp", en: ["tbsp", "tablespoon", "tablespoons"], de: ["EL", "Esslöffel"] },
  { id: "cup", en: ["cup", "cups"], de: ["Tasse", "Tassen"], plural: { en: "cups", de: "Tassen" } },
  { id: "piece", en: ["piece", "pieces", "pc", "pcs"], de: ["Stück", "Stk"], plural: { en: "pieces", de: "Stück" } },
  { id: "pinch", en: ["pinch", "pinches"], de: ["Prise", "Prisen"], plural: { en: "pinches", de: "Prisen" } },
  { id: "dash", en: ["dash", "dashes"], de: ["Spritzer"], plural: { en: "dashes", de: "Spritzer" } },
  { id: "clove", en: ["clove", "cloves"], de: ["Zehe", "Zehen"], plural: { en: "cloves", de: "Zehen" } },
  { id: "can", en: ["can", "cans", "tin", "tins"], de: ["Dose", "Dosen"], plural: { en: "cans", de: "Dosen" } },
  { id: "bunch", en: ["bunch", "bunches"], de: ["Bund", "Bünde"], plural: { en: "bunches", de: "Bund" } },
  { id: "slice", en: ["slice", "slices"], de: ["Scheibe", "Scheiben"], plural: { en: "slices", de: "Scheiben" } },
  { id: "pack", en: ["pack", "packs", "packet", "packets", "package", "packages"], de: ["Packung", "Packungen", "Päckchen"], plural: { en: "packs", de: "Packungen" } },
  { id: "sprig", en: ["sprig", "sprigs"], de: ["Zweig", "Zweige"], plural: { en: "sprigs", de: "Zweige" } },
];
