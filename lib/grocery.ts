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
import { GROCERY_CATEGORIES, type GroceryCategory } from "@/lib/grocery-category";

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
};

/**
 * Identity of a grocery line. Ingredients only combine when both the name and
 * the unit match, so "200 g tomatoes" never merges with "2 tomatoes".
 */
export function groceryKey(name: string, unit: string | null | undefined): string {
  return `${name.trim().toLowerCase()}|${(unit ?? "").trim().toLowerCase()}`;
}

/** Collapse the week's meals into one deduplicated shopping list. */
export function aggregateIngredients(meals: MealInput[]): Omit<GroceryLine, "manual" | "checked">[] {
  const lines = new Map<string, Omit<GroceryLine, "manual" | "checked">>();

  for (const meal of meals) {
    if (!meal.recipe) continue;

    // A recipe written for 2 that is planned for 3 needs 1.5x the ingredients.
    const baseServings = meal.recipe.servings > 0 ? meal.recipe.servings : 1;
    const scale = meal.servings / baseServings;

    for (const ingredient of meal.recipe.ingredients) {
      const name = ingredient.name.trim();
      if (!name) continue;

      const key = groceryKey(name, ingredient.unit);
      const scaled = ingredient.quantity === null ? null : ingredient.quantity * scale;
      const existing = lines.get(key);

      if (!existing) {
        lines.set(key, {
          key,
          label: name,
          quantity: scaled,
          unit: ingredient.unit,
          category: ingredient.category,
          sources: [meal.recipe.name],
        });
        continue;
      }

      // An unquantified ingredient makes the whole line unquantifiable — showing
      // a partial total would understate what to buy.
      existing.quantity =
        existing.quantity === null || scaled === null ? null : existing.quantity + scaled;
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

  return [...lines.values()].sort((a, b) => a.label.localeCompare(b.label));
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
