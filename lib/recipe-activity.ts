/**
 * When each recipe was last planned. Server only.
 *
 * Read from the planned days, which stay in the database after their week has passed. A leftovers day names no recipe, so
 * it counts for nothing; a day planned ahead does not count either: only days up to today.
 */

import { prisma } from "@/lib/db";
import { daysSince } from "@/lib/cook-again";

/** Recipe id → whole days since it was last planned (today is 0). A recipe never planned is not in the map. */
export async function daysSinceLastPlanned(today: Date): Promise<Map<string, number>> {
  const rows = await prisma.plannedMeal.groupBy({
    by: ["recipeId"],
    where: { recipeId: { not: null }, date: { lte: today } },
    _max: { date: true },
  });
  const days = new Map<string, number>();
  for (const { recipeId, _max } of rows) if (recipeId && _max.date) days.set(recipeId, daysSince(_max.date, today));
  return days;
}
