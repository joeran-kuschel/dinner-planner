"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseQuantity, readText } from "@/lib/form-data";
import { parseGroceryCategory } from "@/lib/grocery-category";
import { MAX_SHELF_ITEMS, MAX_SHELF_NAME, MAX_SHELF_UNIT, normalizeShelfName } from "@/lib/shelf";
import { parseDayKey, today } from "@/lib/week";
import { requireAccess } from "@/lib/access-guard";

/** What a form says about an entry; `null` for one that cannot be saved (no name, a name too long, an invalid day). */
function readEntry(formData: FormData, { dayRequired }: { dayRequired: boolean }) {
  const label = readText(formData, "label");
  const name = normalizeShelfName(label);
  if (!name || name.length > MAX_SHELF_NAME || label.length > MAX_SHELF_NAME) return null;

  const rawDay = readText(formData, "boughtOn");
  // A day left out means today (an entry made without a date); one that is there but invalid is refused.
  const boughtOn = rawDay === "" && !dayRequired ? today() : parseDayKey(rawDay);
  if (!boughtOn) return null;

  return {
    name,
    label,
    quantity: parseQuantity(readText(formData, "quantity")),
    unit: readText(formData, "unit").slice(0, MAX_SHELF_UNIT) || null,
    category: parseGroceryCategory(formData.get("category")),
    boughtOn,
  };
}

function refresh() {
  revalidatePath("/shelf");
  revalidatePath("/groceries");
}

/**
 * Put a purchase on the shelf. The same name can be added again and again, each time with its own day and amount.
 * A blank or too long name, an invalid day and (past the limit) further entries are ignored, like a hand-added grocery line.
 */
export async function addShelfItem(formData: FormData) {
  await requireAccess();
  const entry = readEntry(formData, { dayRequired: false });
  if (!entry || (await prisma.shelfItem.count()) >= MAX_SHELF_ITEMS) return;

  await prisma.shelfItem.create({ data: entry });
  refresh();
}

/** Change an entry, including one made by ticking a staple. An entry removed in another tab is not an error. */
export async function updateShelfItem(formData: FormData) {
  await requireAccess();
  const id = readText(formData, "id");
  if (!id) throw new Error("updateShelfItem: missing `id`");
  const entry = readEntry(formData, { dayRequired: true });
  if (!entry) return;

  await prisma.shelfItem.updateMany({ where: { id }, data: entry });
  refresh();
}

/** Take an entry off the shelf. One removed in another tab is gone already, which is what was asked for. */
export async function removeShelfItem(formData: FormData) {
  await requireAccess();
  const id = readText(formData, "id");
  if (!id) throw new Error("removeShelfItem: missing `id`");

  await prisma.shelfItem.deleteMany({ where: { id } });
  refresh();
}
