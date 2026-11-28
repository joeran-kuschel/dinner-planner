/**
 * The ten shop sections the migration creates, as the clean-up between tests restores them.
 *
 * A copy of `SEEDED_CATEGORIES` in `lib/grocery-category.ts` on purpose: that module uses Lingui's compile-time macros, which
 * Playwright's loader cannot load, and this file is imported by the end-to-end
 * support code. `tests/infra/e2e-isolation.test.ts` fails when the two differ.
 */
export const SEEDED_ROWS: readonly { id: string; key: string; name: null; position: number }[] = [
  "PRODUCE",
  "BAKERY",
  "MEAT_FISH",
  "DAIRY_EGGS",
  "PASTA_RICE",
  "PANTRY",
  "HERBS_SPICES",
  "FROZEN",
  "DRINKS",
  "OTHER",
].map((key, position) => ({ id: `cat_${key.toLowerCase()}`, key, name: null, position }));
