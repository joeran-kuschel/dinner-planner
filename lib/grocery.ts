/**
 * Grocery list aggregation.
 *
 * The list is *derived* from the week's planned meals every time it is rendered;
 * only tick-off state and manually added extras are persisted (see the
 * `GroceryEntry` model). That way editing a recipe immediately corrects the list
 * instead of leaving a stale snapshot behind.
 */

export type IngredientInput = {
  name: string;
  quantity: number | null;
  unit: string | null;
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
          sources: [meal.recipe.name],
        });
        continue;
      }

      // An unquantified ingredient makes the whole line unquantifiable — showing
      // a partial total would understate what to buy.
      existing.quantity =
        existing.quantity === null || scaled === null ? null : existing.quantity + scaled;
      if (!existing.sources.includes(meal.recipe.name)) {
        existing.sources.push(meal.recipe.name);
      }
    }
  }

  return [...lines.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * The amount on a grocery line. A line built from recipes without a total
 * reads "to taste" even when it has a unit: "g" alone would hide that part of
 * the amount is unknown. A hand-added extra ("bottles" of wine) keeps its unit.
 */
export function formatGroceryQuantity(
  line: Pick<GroceryLine, "quantity" | "unit" | "sources">,
): string {
  if (line.quantity === null && line.sources.length > 0) return "to taste";
  return formatQuantity(line.quantity, line.unit);
}

/** Render a quantity without trailing noise: 1.5 → "1.5", 2.0 → "2", 0.333… → "0.33". */
export function formatQuantity(quantity: number | null, unit: string | null): string {
  if (quantity === null) return unit ? unit : "to taste";
  const rounded = Math.round(quantity * 100) / 100;
  return unit ? `${rounded} ${unit}` : String(rounded);
}
