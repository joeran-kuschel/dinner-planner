"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parsePositiveInt, readText } from "@/lib/form-data";
import { CUSTOM_MEAL, MAX_SERVINGS } from "@/lib/planner";
import { parseDayKey, startOfWeek } from "@/lib/week";

/**
 * Assign, change or clear the dinner for one day.
 *
 * Called from a plain `<form action={...}>` so the week view keeps working
 * without JavaScript; the day is passed as a `YYYY-MM-DD` key.
 */
export async function setPlannedMeal(formData: FormData) {
  const day = parseDayKey(readText(formData, "day"));
  if (!day) throw new Error("setPlannedMeal: missing or malformed `day`");

  // The select submits the sentinel when the user is typing their own title;
  // storing it as a recipe id would dangle against a row that does not exist.
  const choice = readText(formData, "recipeId");
  const recipeId = choice === CUSTOM_MEAL ? null : choice || null;
  const customTitle = readText(formData, "customTitle") || null;
  // The day saves by itself and has nowhere to show an error, so an amount
  // beyond the input's `max` is capped rather than rejected.
  const servings = Math.min(parsePositiveInt(readText(formData, "servings")) ?? 2, MAX_SERVINGS);
  const notes = readText(formData, "notes") || null;

  // An empty choice means "clear this day" rather than "save a blank meal".
  if (!recipeId && !customTitle) {
    await prisma.plannedMeal.deleteMany({ where: { date: day } });
    revalidateMealViews();
    return;
  }

  const data = {
    recipeId: recipeId ?? null,
    customTitle: recipeId ? null : customTitle,
    servings,
    notes: notes ?? null,
  };

  await prisma.plannedMeal.upsert({
    where: { date: day },
    update: data,
    create: { date: day, ...data },
  });

  revalidateMealViews();
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

/** The plan drives the grocery list, so both views have to be refreshed. */
function revalidateMealViews() {
  revalidatePath("/");
  revalidatePath("/groceries");
}
