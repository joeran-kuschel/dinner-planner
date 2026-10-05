"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parsePositiveInt, readText } from "@/lib/form-data";
import { isDinner, LEFTOVERS_DAYS } from "@/lib/leftovers";
import { isSameDinner, MAX_SERVINGS } from "@/lib/planner";
import { addDays, parseDayKey, startOfWeek } from "@/lib/week";

/**
 * Assign, change or clear the dinner for one day.
 *
 * Called from a plain `<form action={...}>` so the week view keeps working
 * without JavaScript; the day is passed as a `YYYY-MM-DD` key. The form posts
 * what the user typed as `dinner`, the recipe they picked from the suggestions
 * as `recipeId`, and `newRecipe=1` when they chose to add the name as a recipe.
 * See documentation/backend/planned-meals.md for how these combine.
 */
export async function setPlannedMeal(formData: FormData) {
  const day = parseDayKey(readText(formData, "day"));
  if (!day) throw new Error("setPlannedMeal: missing or malformed `day`");

  const dinner = readText(formData, "dinner");
  const pickedId = readText(formData, "recipeId");
  const addAsRecipe = readText(formData, "newRecipe") === "1";
  // The day saves by itself and has nowhere to show an error, so an amount
  // beyond the input's `max` is capped rather than rejected.
  const servings = Math.min(parsePositiveInt(readText(formData, "servings")) ?? 2, MAX_SERVINGS);
  const notes = readText(formData, "notes") || null;

  await prisma.$transaction(async (tx) => {
    let recipe = pickedId ? await tx.recipe.findUnique({ where: { id: pickedId }, select: { id: true, name: true } }) : null;
    if (pickedId && !recipe) throw new Error("setPlannedMeal: unknown `recipeId`");
    // Without JavaScript the picked id stays in the form while the user types
    // another name, so the id only counts while the text still names it.
    if (recipe && dinner && !isSameDinner(recipe.name, dinner)) recipe = null;

    // A typed name that matches a recipe plans that recipe: no duplicate, no
    // one-off title shadowing it.
    recipe ??= dinner
      ? await tx.recipe.findFirst({
          where: { name: { equals: likeLiteral(dinner), mode: "insensitive" } },
          orderBy: [{ createdAt: "asc" }, { id: "asc" }],
          select: { id: true, name: true },
        })
      : null;

    if (!recipe && dinner && addAsRecipe) {
      recipe = await tx.recipe.create({ data: { name: dinner }, select: { id: true, name: true } });
    }

    // Nothing named at all means "clear this day" rather than "save a blank meal".
    if (!recipe && !dinner) {
      await tx.plannedMeal.deleteMany({ where: { date: day } });
      return;
    }

    // A dinner replaces leftovers on the same day.
    const data = { recipeId: recipe?.id ?? null, customTitle: recipe ? null : dinner, servings, notes, leftoversOf: null };
    await tx.plannedMeal.upsert({ where: { date: day }, update: data, create: { date: day, ...data } });
  });

  revalidateMealViews();
}

/**
 * Put a day back after "Clear day": the same form `setPlannedMeal` reads, but only while the day is
 * still empty. If a dinner was planned for it in the meantime (another tab, another window), that
 * newer plan is left alone and the card is told, so an old Undo never overwrites it. Two Undos
 * landing within the same few milliseconds could still collide; that window is accepted.
 */
export async function restorePlannedMeal(formData: FormData): Promise<"restored" | "occupied"> {
  const day = parseDayKey(readText(formData, "day"));
  if (!day) throw new Error("restorePlannedMeal: missing or malformed `day`");

  // A row naming neither a recipe, a title nor a dinner it is the leftovers of shows as an empty day, so it does not count.
  const planned = await prisma.plannedMeal.findFirst({
    where: { date: day, OR: [{ recipeId: { not: null } }, { customTitle: { not: null } }, { leftoversOf: { not: null } }] },
    select: { date: true },
  });
  if (planned) {
    // The card shows what the day holds now.
    revalidateMealViews();
    return "occupied";
  }
  await setPlannedMeal(formData);
  return "restored";
}

/**
 * Make `day` the leftovers of an earlier dinner, `from`. The dinner must be one of its own (not leftovers
 * itself) and fall one to `LEFTOVERS_DAYS` days before `day`; anything else throws. The day must be empty (or
 * already leftovers, which then point to the new dinner): another dinner is never replaced. Returns
 * "changed" and writes nothing when the plan moved in the meantime (the day was planned, or the dinner
 * cleared). See documentation/backend/planned-meals.md.
 */
export async function setLeftovers(formData: FormData): Promise<"saved" | "changed"> {
  const day = parseDayKey(readText(formData, "day"));
  if (!day) throw new Error("setLeftovers: missing or malformed `day`");
  const from = parseDayKey(readText(formData, "from"));
  if (!from) throw new Error("setLeftovers: missing or malformed `from`");
  if (from >= day || from < addDays(day, -LEFTOVERS_DAYS)) throw new Error("setLeftovers: `from` is not within reach of `day`");

  const result = await prisma.$transaction(async (tx) => {
    const [source, target] = await Promise.all([
      tx.plannedMeal.findUnique({ where: { date: from } }),
      tx.plannedMeal.findUnique({ where: { date: day } }),
    ]);
    // A dinner of its own is what leftovers come from, so leftovers of leftovers never happen.
    if (!isDinner(source)) return "changed" as const;
    if (isDinner(target)) return "changed" as const;
    await tx.plannedMeal.upsert({
      where: { date: day },
      update: { leftoversOf: from, recipeId: null, customTitle: null },
      create: { date: day, leftoversOf: from },
    });
    return "saved" as const;
  });

  revalidateMealViews();
  return result;
}

/**
 * Prisma runs a case-insensitive `equals` as `ILIKE`, where `%` and `_` are
 * wildcards: "Shak_huka" would plan "Shakshuka". Escaped, they match themselves.
 */
function likeLiteral(text: string): string {
  return text.replace(/[\\%_]/g, "\\$&");
}

export async function clearPlannedMeal(formData: FormData) {
  const day = parseDayKey(readText(formData, "day"));
  if (!day) throw new Error("clearPlannedMeal: missing or malformed `day`");

  await prisma.plannedMeal.deleteMany({ where: { date: day } });
  revalidateMealViews();
}

/** Wipe a whole week, for starting over. */
export async function clearWeek(formData: FormData) {
  const day = parseDayKey(readText(formData, "weekStart"));
  if (!day) throw new Error("clearWeek: missing or malformed `weekStart`");
  // A stale or edited form may post another weekday; the week is still Monday-based.
  const weekStart = startOfWeek(day);

  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  await prisma.plannedMeal.deleteMany({
    where: { date: { gte: weekStart, lt: weekEnd } },
  });

  revalidateMealViews();
}

/**
 * The plan drives the grocery list, and the recipe pages show where each
 * recipe is planned (and list a recipe added from a day card).
 */
function revalidateMealViews() {
  revalidatePath("/");
  revalidatePath("/groceries");
  revalidatePath("/recipes", "layout");
}
