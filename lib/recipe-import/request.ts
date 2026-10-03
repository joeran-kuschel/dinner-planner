import type { ImportErrorCode } from "@/lib/recipe-import/errors";

/** An address is at most 2048 characters; JSON around it needs a little more. */
const MAX_BODY_BYTES = 4096;

const failure = (error: ImportErrorCode, status: number) => Response.json({ ok: false, error }, { status });

/**
 * The address in an import request, `{ "url": "…" }` as JSON, or the answer to send back when the request is wrong.
 * Server only.
 */
export async function readRequestedUrl(request: Request): Promise<{ url: string } | { refusal: Response }> {
  // A JSON body makes a request from another website a cross-origin one the browser has to ask about first.
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return { refusal: failure("invalid-url", 415) };
  }
  // The body is one address: read it only when it is small, instead of whatever is sent.
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return { refusal: failure("invalid-url", 413) };
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return { refusal: failure("invalid-url", 413) };
    const { url } = JSON.parse(text);
    if (typeof url === "string") return { url };
  } catch {
    // Not JSON.
  }
  return { refusal: failure("invalid-url", 400) };
}
