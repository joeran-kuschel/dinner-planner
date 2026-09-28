/**
 * Reading values from a server action's `FormData`.
 *
 * Server actions are public endpoints, so every field is untrusted: it may be
 * missing, a file, or contain characters the database refuses.
 */

/** Postgres rejects NUL characters in text columns, so they are dropped on input. */
const NUL = /\u0000/g;

/** A field's text exactly as typed (untrimmed), minus NUL characters. "" if missing or not text. */
export function rawText(value: FormDataEntryValue | null): string {
  return typeof value === "string" ? value.replace(NUL, "") : "";
}

/** A field's text, trimmed. "" if missing or blank. */
export function readText(formData: FormData, name: string): string {
  return rawText(formData.get(name)).trim();
}

/** A whole number above zero, rounded down; `null` for anything else. */
export function parsePositiveInt(raw: string): number | null {
  const parsed = Number.parseInt(raw.trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * An amount such as "1.5" or "1,5". Unparseable or non-positive amounts are
 * `null`, which the app shows as "to taste" rather than 0.
 */
export function parseQuantity(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const parsed = Number.parseFloat(trimmed.replace(",", "."));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
