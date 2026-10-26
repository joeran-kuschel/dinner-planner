"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { parseQuantity, readText } from "@/lib/form-data";
import { parseGroceryCategory } from "@/lib/grocery-category";
import { createCanonicaliser, normalizeName } from "@/lib/ingredients/canonical";
import { MAX_MERGE_RULES, MAX_RULE_LABEL, MAX_RULE_NAME, readNameId, wouldLoop } from "@/lib/ingredients/merge-rules";
import { loadKeepSeparate, loadMergeRules, loadPageNames } from "@/lib/ingredients/server";
import { DEFAULT_LOCALE } from "@/lib/i18n/config";
import { parseDayKey, startOfWeek } from "@/lib/week";
import { requireAccess } from "@/lib/access-guard";

/**
 * Tick or untick a line.
 *
 * Derived lines have no row until they are first ticked, so this upserts by
 * (weekStart, key) and stores the label to keep the row readable on its own. A hand-added entry carried over
 * from an earlier week (`carried=1`) has no row in this week either: ticking it writes one for this week with
 * the entry's amount, unit and section, so it stays here, ticked, and is not carried on.
 */
export async function toggleGroceryLine(formData: FormData) {
  await requireAccess();
  const weekStart = requireWeekStart(formData);
  const key = readText(formData, "key");
  const label = readText(formData, "label");
  if (!key) throw new Error("toggleGroceryLine: missing `key`");

  const checked = readText(formData, "checked") === "true";
  // The entry's own details travel with the form, since an earlier week's row is the only other place they are.
  const carried =
    readText(formData, "carried") === "1"
      ? {
          label: label || key,
          manual: true,
          dismissed: false,
          quantity: parseQuantity(readText(formData, "quantity")),
          unit: readText(formData, "unit") || null,
          category: parseGroceryCategory(formData.get("category")),
        }
      : {};

  await prisma.groceryEntry.upsert({
    where: { weekStart_key: { weekStart, key } },
    update: { checked, ...carried },
    create: { weekStart, key, label: label || key, checked, ...carried },
  });

  revalidatePath("/groceries");
}

/** Add something the recipes do not cover — dish soap, wine, bin bags. */
export async function addGroceryExtra(formData: FormData) {
  await requireAccess();
  const weekStart = requireWeekStart(formData);
  const label = readText(formData, "label");
  if (!label) return;

  const unit = readText(formData, "unit") || null;
  const quantity = parseQuantity(readText(formData, "quantity"));

  const category = parseGroceryCategory(formData.get("category"));
  // The same key a derived line gets, so an extra named like an ingredient of the plan is that line.
  const [rules, separate, names] = await Promise.all([loadMergeRules(), loadKeepSeparate(), loadPageNames(weekStart)]);
  const canon = createCanonicaliser({
    locale: DEFAULT_LOCALE,
    rules,
    names: [...names, label],
    keepSeparate: separate.map((entry) => entry.name),
  });
  // A row of this week that the page already reads as this line (written under another spelling, such as the plural
  // before the singular was on the list) is the one that is updated, so a line never has two rows of its own.
  const key = canon.identify(label, unit).key;
  const existing = (await prisma.groceryEntry.findMany({ where: { weekStart, manual: true }, select: { key: true } })).find(
    (row) => canon.keyOfStored(row.key) === key,
  );

  // Adding the same extra twice updates the amount instead of erroring on the
  // (weekStart, key) unique constraint.
  await prisma.groceryEntry.upsert({
    where: { weekStart_key: { weekStart, key: existing?.key ?? key } },
    // Adding an item that was deleted from this week (and from the weeks after it) brings it back.
    update: { label, quantity, unit, category, manual: true, dismissed: false },
    create: { weekStart, key, label, quantity, unit, category, manual: true },
  });

  revalidatePath("/groceries");
}

/**
 * Delete a hand-added entry. One added in this week is deleted. One carried over from an earlier week
 * (`carried=1`) is deleted from this week on: the earlier weeks keep it, so a row marks it "dismissed"
 * here, which hides it and ends the carrying.
 */
export async function removeGroceryExtra(formData: FormData) {
  await requireAccess();
  if (readText(formData, "carried") === "1") {
    const weekStart = requireWeekStart(formData);
    const key = readText(formData, "key");
    const label = readText(formData, "label");
    if (!key) throw new Error("removeGroceryExtra: missing `key`");
    await prisma.groceryEntry.upsert({
      where: { weekStart_key: { weekStart, key } },
      update: { dismissed: true, manual: true, checked: false },
      create: { weekStart, key, label: label || key, manual: true, dismissed: true },
    });
  } else {
    const id = readText(formData, "id");
    if (!id) throw new Error("removeGroceryExtra: missing `id`");
    await prisma.groceryEntry.delete({ where: { id } });
  }
  revalidatePath("/groceries");
}

/**
 * Merge a line into another one: from now on, in every week, lines named `from` are listed as `to`. Both are
 * name ids (a dictionary group like `~tomato`, or a typed name, normalised) that the page sent with the line.
 * The merge is a rule, not a change to any line, because the list is derived. Answers "merged", or why not:
 * "invalid" (nothing to merge, or two names that would send each other round in a circle) or "limit" (too many
 * rules). Merging a name again moves it to the new target.
 */
export async function mergeGroceryLines(formData: FormData): Promise<"merged" | "invalid" | "limit"> {
  await requireAccess();
  const from = readNameId(readText(formData, "from"));
  const to = readNameId(readText(formData, "to"));
  if (!from || !to || from.length > MAX_RULE_NAME || to.length > MAX_RULE_NAME) return "invalid";

  // Reading the rules and writing one are separate statements: two merges at the same moment (a->b and b->a) could
  // both pass the loop check. For one household that is a race of its own making, and a loop in the data is cut
  // short when it is read (`followRules`), so it is not made atomic.
  const rules = await loadMergeRules();
  if (wouldLoop(rules, from, to)) return "invalid";
  if (rules.length >= MAX_MERGE_RULES && !rules.some((rule) => rule.from === from)) return "limit";

  const fromLabel = readText(formData, "fromLabel").slice(0, MAX_RULE_LABEL) || from;
  const toLabel = readText(formData, "toLabel").slice(0, MAX_RULE_LABEL) || to;
  await prisma.groceryMergeRule.upsert({
    where: { fromName: from },
    update: { toName: to, fromLabel, toLabel },
    create: { fromName: from, toName: to, fromLabel, toLabel },
  });

  revalidatePath("/groceries");
  return "merged";
}

/** Undo a merge: the lines it joined are listed apart again. One undone in another tab is gone already. */
export async function unmergeGroceryLines(formData: FormData) {
  await requireAccess();
  const id = readText(formData, "id");
  if (!id) throw new Error("unmergeGroceryLines: missing `id`");

  await prisma.groceryMergeRule.deleteMany({ where: { id } });
  revalidatePath("/groceries");
}

/**
 * Keep a spelling on a line of its own: the dictionary and the plural rule leave "Tomaten" alone from now on, in every
 * week, so it is listed apart from "tomatoes". Answers "kept", "invalid" (nothing, or a name that is too long) or
 * "limit" (too many). Keeping a name again changes nothing. Undone with `unkeepGroceryName`.
 */
export async function keepGroceryNameSeparate(formData: FormData): Promise<"kept" | "invalid" | "limit"> {
  await requireAccess();
  const label = readText(formData, "label").slice(0, MAX_RULE_LABEL);
  const name = normalizeName(label);
  if (!name || name.length > MAX_RULE_NAME) return "invalid";

  if (!(await prisma.groceryKeepSeparate.findUnique({ where: { name } })) && (await prisma.groceryKeepSeparate.count()) >= MAX_MERGE_RULES) {
    return "limit";
  }
  await prisma.groceryKeepSeparate.upsert({ where: { name }, update: {}, create: { name, label } });

  revalidatePath("/groceries");
  return "kept";
}

/** Let a name be merged by the dictionary and the plural rule again. One undone in another tab is gone already. */
export async function unkeepGroceryName(formData: FormData) {
  await requireAccess();
  const id = readText(formData, "id");
  if (!id) throw new Error("unkeepGroceryName: missing `id`");

  await prisma.groceryKeepSeparate.deleteMany({ where: { id } });
  revalidatePath("/groceries");
}

/** The grocery page reads rows by their Monday, so any other weekday is moved to it. */
function requireWeekStart(formData: FormData): Date {
  const day = parseDayKey(readText(formData, "weekStart"));
  if (!day) throw new Error("Missing or malformed `weekStart`");
  return startOfWeek(day);
}
