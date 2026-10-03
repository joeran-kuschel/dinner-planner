import { ImportError, type ImportErrorCode } from "@/lib/recipe-import/errors";
import { importPhoto } from "@/lib/recipe-import";
import { readRequestedUrl } from "@/lib/recipe-import/request";

/**
 * The picture of an imported recipe, for the browser to put in the form's photo field: `{ "url": "…" }` in, the
 * picture's bytes (a JPEG, PNG or WebP, judged by its first bytes) or an error code out. The same rules as the recipe
 * itself apply to where it may come from. Nothing is saved here; saving the recipe re-encodes the photo like any upload.
 */
export async function POST(request: Request) {
  const requested = await readRequestedUrl(request);
  if ("refusal" in requested) return requested.refusal;

  try {
    const { bytes, type } = await importPhoto(requested.url, { signal: request.signal });
    return new Response(new Uint8Array(bytes), {
      headers: { "content-type": type, "content-length": String(bytes.length), "x-content-type-options": "nosniff", "cache-control": "no-store" },
    });
  } catch (error) {
    const code: ImportErrorCode = error instanceof ImportError ? error.code : "unreachable";
    return Response.json({ ok: false, error: code }, { status: code === "invalid-url" ? 400 : 200 });
  }
}
