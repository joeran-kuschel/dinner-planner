import { ImportError, type ImportErrorCode } from "@/lib/recipe-import/errors";
import { importRecipe } from "@/lib/recipe-import";

/** An address is at most 2048 characters; JSON around it needs a little more. */
const MAX_BODY_BYTES = 4096;

/**
 * The import dialog's request: `{ "url": "…" }` in, the recipe form's values (or an error code) out. It reads
 * `request.signal`, so the visitor's Cancel stops the fetch on the server too. Nothing is saved here.
 */
export async function POST(request: Request) {
  // A JSON body makes a request from another website a cross-origin one the browser has to ask about first.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ ok: false, error: "invalid-url" satisfies ImportErrorCode }, { status: 415 });
  }
  // The body is one address: read it only when it is small, instead of whatever is sent.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: "invalid-url" satisfies ImportErrorCode }, { status: 413 });
  }
  let url: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: "invalid-url" satisfies ImportErrorCode }, { status: 413 });
    }
    ({ url } = JSON.parse(text));
  } catch {
    return Response.json({ ok: false, error: "invalid-url" satisfies ImportErrorCode }, { status: 400 });
  }
  if (typeof url !== "string") {
    return Response.json({ ok: false, error: "invalid-url" satisfies ImportErrorCode }, { status: 400 });
  }

  try {
    const values = await importRecipe(url, { signal: request.signal });
    return Response.json({ ok: true, values });
  } catch (error) {
    const code: ImportErrorCode = error instanceof ImportError ? error.code : "unreachable";
    return Response.json({ ok: false, error: code }, { status: code === "invalid-url" ? 400 : 200 });
  }
}
