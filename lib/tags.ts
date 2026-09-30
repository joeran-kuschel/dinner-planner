/**
 * Recipe tags. Safe for client code: the chip input in the recipe form and the
 * server actions share these rules.
 *
 * A tag is stored normalised (trimmed, inner whitespace collapsed, lowercase), so
 * "Quick", "quick " and "QUICK" are one tag and the unique index on `Tag.name`
 * needs no case handling.
 */

/** The most tags one recipe can have. */
export const MAX_TAGS = 10;
/** The longest tag, in characters; matches the input's `maxLength`. */
export const MAX_TAG_LENGTH = 30;

/** A tag as it is stored. `toLowerCase`, not `toLocaleLowerCase`, so browser and server agree. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").toLowerCase();
}

/** The tags typed into one field: split on commas, normalised, blanks dropped. */
export function splitTags(raw: string): string[] {
  return raw.split(",").map(normalizeTag).filter(Boolean);
}

/**
 * The tags a form posted: the chips (`tag`, one per chip) followed by whatever is
 * still typed in the text field, which is where a browser without JavaScript puts
 * them all. Normalised, without duplicates, in order. The limits are not applied
 * here; the action refuses the form so nothing is silently dropped.
 */
export function parseTags(chips: string[], draft: string): string[] {
  return [...new Set([...chips.map(normalizeTag).filter(Boolean), ...splitTags(draft)])];
}

/** Whether a list of tags is within the limits. */
export function tagsWithinLimits(tags: string[]): boolean {
  return tags.length <= MAX_TAGS && tags.every((tag) => tag.length <= MAX_TAG_LENGTH);
}
