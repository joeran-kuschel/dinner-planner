/**
 * Grocery list aggregation.
 *
 * The list is *derived* from the week's planned meals every time it is rendered;
 * only tick-off state and manually added extras are persisted (see the
 * `GroceryEntry` model). That way editing a recipe immediately corrects the list
 * instead of leaving a stale snapshot behind.
 */

import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { categoryLabel, GROCERY_CATEGORIES, type GroceryCategory } from "@/lib/grocery-category";
import type { Canonicaliser } from "@/lib/ingredients/canonical";
import { isSmallAmount } from "@/lib/ingredients/measures";

export type IngredientInput = {
  name: string;
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
};

export type MealInput = {
  /** Servings the meal is planned for; scales the recipe's quantities. */
  servings: number;
  recipe: {
    name: string;
    servings: number;
    ingredients: IngredientInput[];
  } | null;
};

export type GroceryLine = {
  key: string;
  label: string;
  /** Null when at least one source ingredient had no quantity ("to taste"). */
  quantity: number | null;
  unit: string | null;
  category: GroceryCategory;
  /** Recipe names this line came from, for the "used in" hint. */
  sources: string[];
  manual: boolean;
  checked: boolean;
  /** The total is too small to show ("1 pinch", under 100 g): the line keeps its name and loses its amount. */
  small?: boolean;
};

/**
 * Identity of a grocery line without the dictionary or any merge rule. Ingredients only combine when both the
 * name and the unit match, so "200 g tomatoes" never merges with "2 tomatoes".
 */
export function groceryKey(name: string, unit: string | null | undefined): string {
  return `${name.trim().toLowerCase()}|${(unit ?? "").trim().toLowerCase()}`;
}

/** Names and units exactly as typed: the identity of a line when no dictionary or rule is in play. */
export const PLAIN_NAMES: Canonicaliser = {
  identify: (name, unit) => {
    const unitId = (unit ?? "").trim().toLowerCase();
    return { key: groceryKey(name, unit), nameId: name.trim().toLowerCase(), unitId, ownUnitId: unitId, factor: 1 };
  },
  keyOfStored: (key) => key,
  nameLabel: () => null,
  aliases: (name) => [name.trim().toLowerCase()],
  amount: ({ quantity, typedUnit }) => ({ quantity, unit: typedUnit }),
  unitLabel: () => null,
};

/** Something added to the list by hand: its amount is added to the planned line it shares its key with. */
export type ExtraAmount = { name: string; quantity: number | null; unit: string | null };

/**
 * Collapse the week's meals into one deduplicated shopping list. With a canonicaliser (the dictionary and the
 * user's merge rules) the same ingredient in another spelling or language, and a synonym unit, is one line.
 * An extra added by hand that is the same line (`extras`) adds its amount to it: 200 g flour planned and
 * "2 kg flour" added by hand are 2.2 kg. An extra without an amount adds nothing, and a line "to taste" stays so.
 */
export function aggregateIngredients(
  meals: MealInput[],
  canon: Canonicaliser = PLAIN_NAMES,
  extras: readonly ExtraAmount[] = [],
): Omit<GroceryLine, "manual" | "checked">[] {
  // Amounts are summed in the line's base unit ("g" for "kg") and turned back for display at the end.
  type Sum = Omit<GroceryLine, "manual" | "checked"> & {
    unitId: string;
    ownUnitIds: Set<string>;
    typedUnit: string | null;
  };
  const lines = new Map<string, Sum>();

  for (const meal of meals) {
    if (!meal.recipe) continue;

    // A recipe written for 2 that is planned for 3 needs 1.5x the ingredients.
    const baseServings = meal.recipe.servings > 0 ? meal.recipe.servings : 1;
    const scale = meal.servings / baseServings;

    for (const ingredient of meal.recipe.ingredients) {
      const name = ingredient.name.trim();
      if (!name) continue;

      const id = canon.identify(name, ingredient.unit);
      const scaled = ingredient.quantity === null ? null : ingredient.quantity * scale * id.factor;
      const existing = lines.get(id.key);

      if (!existing) {
        lines.set(id.key, {
          key: id.key,
          label: canon.nameLabel(id.nameId) ?? name,
          quantity: scaled,
          unit: ingredient.unit,
          category: ingredient.category,
          sources: [meal.recipe.name],
          unitId: id.unitId,
          ownUnitIds: new Set([id.ownUnitId]),
          typedUnit: ingredient.unit,
        });
        continue;
      }

      // An unquantified ingredient makes the whole line unquantifiable — showing
      // a partial total would understate what to buy.
      existing.quantity =
        existing.quantity === null || scaled === null ? null : existing.quantity + scaled;
      existing.ownUnitIds.add(id.ownUnitId);
      // Recipes may file the same ingredient differently. The category that comes first in the
      // shop wins, whatever the order of the meals, so the line never moves when the plan changes.
      if (GROCERY_CATEGORIES.indexOf(ingredient.category) < GROCERY_CATEGORIES.indexOf(existing.category)) {
        existing.category = ingredient.category;
      }
      if (!existing.sources.includes(meal.recipe.name)) {
        existing.sources.push(meal.recipe.name);
      }
    }
  }

  for (const extra of extras) {
    const id = canon.identify(extra.name, extra.unit);
    const line = lines.get(id.key);
    if (!line || extra.quantity === null) continue;
    if (line.quantity !== null) line.quantity += extra.quantity * id.factor;
    line.ownUnitIds.add(id.ownUnitId);
  }

  return [...lines.values()]
    .map(({ unitId, ownUnitIds, typedUnit, ...line }) => ({
      ...line,
      // Decided last, on the merged total in the base unit, so two small parts of one ingredient still add up.
      small: isSmallAmount(unitId, line.quantity),
      ...canon.amount({ unitId, ownUnitIds, quantity: line.quantity, typedUnit }),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Split lines into shop sections, in shopping order. Sections without a line
 * are left out; the lines keep the order they came in.
 */
export function groupByCategory<T extends Pick<GroceryLine, "category">>(
  lines: T[],
): { category: GroceryCategory; lines: T[] }[] {
  return GROCERY_CATEGORIES.map((category) => ({
    category,
    lines: lines.filter((line) => line.category === category),
  })).filter((group) => group.lines.length > 0);
}

/**
 * The amount on a grocery line. A line built from recipes without a total
 * reads "to taste" even when it has a unit: "g" alone would hide that part of
 * the amount is unknown. A hand-added extra ("bottles" of wine) keeps its unit.
 */
export function formatGroceryQuantity(
  line: Pick<GroceryLine, "quantity" | "unit" | "sources">,
  i18n: I18n,
): string {
  if (line.quantity === null && line.sources.length > 0) return t(i18n)`to taste`;
  return formatQuantity(line.quantity, line.unit, i18n);
}

/**
 * Render a quantity without trailing noise, with the language's decimal
 * separator: 1.5 → "1.5" (German "1,5"), 2.0 → "2", 0.333… → "0.33". No
 * thousands separators: "1500 g" reads better on a shopping list than "1,500 g".
 */
export function formatQuantity(quantity: number | null, unit: string | null, i18n: I18n): string {
  if (quantity === null) return unit ? unit : t(i18n)`to taste`;
  const amount = i18n.number(quantity, { maximumFractionDigits: 2, useGrouping: false });
  return unit ? `${amount} ${unit}` : amount;
}

/**
 * The list as plain text for the clipboard: the title with the week, then each shop section with one
 * "- amount name" line per item ("- 300 g Rice"; "- Salt" for a small amount; "- Salt (to taste)" when no amount is known; a hand-added
 * item without an amount is just its name, or "- Wine (bottles)" with a unit only). Ticked lines and lines a pantry staple hides are left out, since
 * they are not to be bought. Sections left empty by that are left out. Returns "" when nothing is left.
 */
export function groceryListText(
  { weekRange, lines }: { weekRange: string; lines: (GroceryLine & { pantry?: boolean })[] },
  i18n: I18n,
): string {
  const open = lines.filter((line) => !line.checked && !line.pantry);
  if (open.length === 0) return "";

  const sections = groupByCategory(open).map(({ category, lines: group }) => {
    const items = group.map((line) => {
      if (line.small) return `- ${line.label}`;
      if (line.quantity === null && line.sources.length > 0) return `- ${line.label} (${t(i18n)`to taste`})`;
      if (line.quantity === null) return line.unit ? `- ${line.label} (${line.unit})` : `- ${line.label}`;
      return `- ${formatQuantity(line.quantity, line.unit, i18n)} ${line.label}`;
    });
    return [categoryLabel(category, i18n), ...items].join("\n");
  });

  return [`${t(i18n)`Grocery list`} · ${weekRange}`, ...sections].join("\n\n");
}

/**
 * What a week's planned days contribute to the list: the distinct recipes (one recipe on three days
 * is still one) and the days that are only a typed name, which add no ingredients.
 */
export function mealSources(meals: { recipe: { id: string } | null; customTitle: string | null }[]): {
  recipes: number;
  typed: number;
} {
  return {
    recipes: new Set(meals.flatMap((meal) => (meal.recipe ? [meal.recipe.id] : []))).size,
    typed: meals.filter((meal) => meal.recipe === null && meal.customTitle).length,
  };
}
