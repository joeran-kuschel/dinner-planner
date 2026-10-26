/**
 * A path on this site from a form field, or `null`. Safe for client code.
 *
 * "Save and leave" sends the address the visitor was about to open, and the action redirects there once the recipe is
 * saved. A field can be set by anyone who can send a request, so only a path of this site is accepted: it starts with a
 * single `/`, and is no address on another host in disguise (`//host`, `/\host`, a scheme, a control character, and dot
 * segments that collapse into one: `/.//host` is `//host` once resolved). What comes back is the resolved path.
 */

const MAX_PATH_LENGTH = 2048;

export function safeSitePath(raw: FormDataEntryValue | string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > MAX_PATH_LENGTH) return null;
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.startsWith("/\\")) return null;
  if (/[\u0000-\u001f\u007f\\]/.test(raw)) return null;
  try {
    // Resolved against a made-up origin: anything that ends up elsewhere was not a path of this site.
    const url = new URL(raw, "https://site.invalid");
    // `/.//host` and `/a/..//host` resolve to `//host`, which a browser reads as another site: the result is judged, not the input.
    if (url.origin !== "https://site.invalid" || url.pathname.startsWith("//")) return null;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return null;
  }
}
