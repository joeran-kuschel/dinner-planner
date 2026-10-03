import { DEFAULT_GROCERY_CATEGORY } from "@/lib/grocery-category";
import type { IngredientValues } from "@/lib/recipe-form";

/**
 * One line of a recipe site's ingredient list ("200 g flour", "½ TL Salz", "2-3 cloves garlic, minced") as the
 * recipe form's amount, unit and name. Anything that cannot be read cleanly stays in the name, so nothing is
 * lost: the visitor reviews every row before saving.
 */

/** Spellings (lower case, in English and German) of the units found on recipe sites, and how they are stored. */
const UNITS: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  gramm: "g",
  kg: "kg",
  kilogram: "kg",
  kilograms: "kg",
  kilogramm: "kg",
  ml: "ml",
  milliliter: "ml",
  milliliters: "ml",
  millilitre: "ml",
  millilitres: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  litre: "l",
  litres: "l",
  tbsp: "tbsp",
  tbs: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  tsp: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  cup: "cup",
  cups: "cup",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  pinch: "pinch",
  dash: "dash",
  clove: "clove",
  cloves: "clove",
  can: "can",
  cans: "can",
  tin: "can",
  tins: "can",
  bunch: "bunch",
  bunches: "bunch",
  slice: "slice",
  slices: "slice",
  sprig: "sprig",
  sprigs: "sprig",
  el: "EL",
  esslöffel: "EL",
  tl: "TL",
  teelöffel: "TL",
  tasse: "Tasse",
  tassen: "Tasse",
  prise: "Prise",
  prisen: "Prise",
  zehe: "Zehe",
  zehen: "Zehe",
  dose: "Dose",
  dosen: "Dose",
  bund: "Bund",
  scheibe: "Scheibe",
  scheiben: "Scheibe",
  stück: "Stück",
  stücke: "Stück",
  piece: "piece",
  pieces: "piece",
  pck: "Pck.",
  päckchen: "Päckchen",
};

/** Units that stand for an amount on their own ("a pinch of salt"). */
const SOLO_UNITS = new Set(["pinch", "dash", "Prise"]);

const FRACTIONS: Record<string, string> = {
  "½": "1/2",
  "⅓": "1/3",
  "⅔": "2/3",
  "¼": "1/4",
  "¾": "3/4",
  "⅕": "1/5",
  "⅛": "1/8",
  "⅜": "3/8",
  "⅝": "5/8",
  "⅞": "7/8",
};

const NUMBER = String.raw`(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?)`;
const AMOUNT = new RegExp(String.raw`^(${NUMBER})(?:\s*(?:-|–|—|to|bis)\s*(${NUMBER}))?`, "i");

const MAX_NAME_LENGTH = 120;

function evaluate(text: string): number {
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text.replace(",", "."));
}

function formatAmount(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/** The shopping-list name: without bracketed notes or what follows a comma ("garlic, minced" → "garlic"). */
function cleanName(text: string): string {
  const name = text
    .replace(/\([^()]{0,200}\)/g, " ")
    .split(/[,;]/)[0]
    .replace(/^(?:of|von)\s+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return name.slice(0, MAX_NAME_LENGTH);
}

/** A longer line is not an ingredient; the cut also keeps the patterns below from ever working on a huge string. */
const MAX_LINE_LENGTH = 300;

export function parseIngredientLine(line: string): IngredientValues {
  let rest = line
    .slice(0, MAX_LINE_LENGTH)
    .replace(/[ \s]+/g, " ")
    .replace(/^[-•*·\s]+/, "")
    .replace(/(\d)([½⅓⅔¼¾⅕⅛⅜⅝⅞])/g, "$1 $2")
    .replace(/[½⅓⅔¼¾⅕⅛⅜⅝⅞]/g, (char) => FRACTIONS[char])
    .trim();
  const whole = rest;
  let quantity = "";
  let unit = "";

  const amount = rest.match(AMOUNT);
  if (amount) {
    // A range ("2-3 cloves") is shopped for at its upper end.
    quantity = formatAmount(evaluate(amount[2] ?? amount[1]));
    rest = rest.slice(amount[0].length).trim();
  }

  const word = rest.match(/^([A-Za-zÄÖÜäöüß]+)\.?(?=\s|$)/);
  if (word) {
    const known = UNITS[word[1].toLowerCase()];
    if (known && (amount || SOLO_UNITS.has(known))) {
      unit = known;
      rest = rest.slice(word[0].length).trim();
    }
  }

  // What is left after the amount; else the whole line, even a bracketed one, so that no row comes out empty.
  const name = cleanName(rest) || cleanName(whole) || whole.slice(0, MAX_NAME_LENGTH);
  if (quantity === "0") quantity = "";
  return { name, quantity, unit, category: DEFAULT_GROCERY_CATEGORY };
}
