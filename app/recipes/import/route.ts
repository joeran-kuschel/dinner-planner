import { ImportError, type ImportErrorCode } from "@/lib/recipe-import/errors";
import { importRecipe } from "@/lib/recipe-import";
import { readRequestedUrl } from "@/lib/recipe-import/request";

/**
 * The import dialog's request: `{ "url": "…" }` in, the recipe form's values and the address of the recipe's picture
 * (if the page names one) or an error code out. It reads `request.signal`, so the visitor's Cancel stops the fetch on
 * the server too. Nothing is saved here.
 */
export async function POST(request: Request) {
  const requested = await readRequestedUrl(request);
  if ("refusal" in requested) return requested.refusal;

  try {
    const { values, photoUrl } = await importRecipe(requested.url, { signal: request.signal });
    return Response.json({ ok: true, values, photoUrl });
  } catch (error) {
    const code: ImportErrorCode = error instanceof ImportError ? error.code : "unreachable";
    return Response.json({ ok: false, error: code }, { status: code === "invalid-url" ? 400 : 200 });
  }
}
