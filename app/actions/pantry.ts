"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { readText } from "@/lib/form-data";
import { MAX_STAPLE_LENGTH, MAX_STAPLES, normalizeStaple } from "@/lib/pantry";

/**
 * Add an ingredient to the pantry staples. Adding one that is there already changes nothing,
 * and blank, too long and (past the limit) further names are ignored, like a hand-added grocery line.
 */
export async function addPantryStaple(formData: FormData) {
  const name = normalizeStaple(readText(formData, "name"));
  if (!name || name.length > MAX_STAPLE_LENGTH) return;

  const existing = await prisma.pantryStaple.findUnique({ where: { name } });
  if (!existing && (await prisma.pantryStaple.count()) >= MAX_STAPLES) return;

  await prisma.pantryStaple.upsert({ where: { name }, update: {}, create: { name } });
  revalidatePath("/groceries");
}

export async function removePantryStaple(formData: FormData) {
  const id = readText(formData, "id");
  if (!id) throw new Error("removePantryStaple: missing `id`");

  // A staple removed in another tab is gone already, which is what was asked for.
  await prisma.pantryStaple.deleteMany({ where: { id } });
  revalidatePath("/groceries");
}
