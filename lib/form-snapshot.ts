/**
 * What a form holds, as one string to compare. Safe for client code.
 *
 * Two snapshots of the same form are equal when every field has the value it had: typing something and then undoing it is
 * no change. A chosen file counts by its name, size and date (its bytes are not read), and the `next` field that "Save and
 * leave" fills in is not part of what the visitor entered.
 */
export function snapshotForm(form: HTMLFormElement): string {
  const entries: [string, string][] = [];
  for (const [name, value] of new FormData(form)) {
    if (name === "next") continue;
    // A file field with nothing chosen gives an empty file whose date is "now": it must not make every look different.
    const empty = typeof value !== "string" && value.name === "" && value.size === 0;
    entries.push([name, typeof value === "string" ? value : empty ? "file:" : `file:${value.name}:${value.size}:${value.lastModified}`]);
  }
  return JSON.stringify(entries);
}
