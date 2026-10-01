import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import { prisma } from "@/lib/db";

/** Offered in the ingredient rows even before any recipe uses them, in the language of the page. */
export function commonUnits(i18n: I18n): string[] {
  return [
    t(i18n)`g`,
    t(i18n)`kg`,
    t(i18n)`ml`,
    t(i18n)`l`,
    t(i18n)`tbsp`,
    t(i18n)`tsp`,
    t(i18n)`cup`,
    t(i18n)`piece`,
    t(i18n)`pinch`,
    t(i18n)`clove`,
  ];
}

/** The common units, then the ones recipes already use (each once, ignoring case). */
export function mergeUnits(used: string[], i18n: I18n): string[] {
  const common = commonUnits(i18n);
  const seen = new Set(common.map((unit) => unit.toLowerCase()));
  const extra = used.filter((unit) => {
    const key = unit.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return [...common, ...extra.map((unit) => unit.trim())];
}

/** What the unit field of the recipe form suggests. Server only. */
export async function unitSuggestions(i18n: I18n): Promise<string[]> {
  const rows = await prisma.ingredient.findMany({
    where: { unit: { not: null } },
    select: { unit: true },
    distinct: ["unit"],
    orderBy: { unit: "asc" },
  });
  return mergeUnits(
    rows.map((row) => row.unit ?? ""),
    i18n,
  );
}
