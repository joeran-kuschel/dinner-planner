import type { ImportErrorCode } from "@/lib/recipe-import/errors";

/** An address is at most 2048 characters; JSON around it needs a little more. */
const MAX_BODY_BYTES = 4096;

const failure = (error: ImportErrorCode, status: number) => Response.json({ ok: false, error }, { status });

/**
 * Whether a browser says the request comes from another website. `Sec-Fetch-Site` is set by the browser and cannot be
 * changed by a page's script; `Origin` is the fallback for a browser without it. A client that sends neither (curl,
 * the tests) is not a browser and is not stopped here: this keeps other websites out, not other machines.
 */
export function isCrossSite(request: Request): boolean {
  const site = request.headers.get("sec-fetch-site");
  if (site) return site !== "same-origin" && site !== "none";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  const host = request.headers.get("host") ?? new URL(request.url).host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}

/**
 * The address in an import request, `{ "url": "…" }` as JSON, or the answer to send back when the request is wrong
 * or comes from another website (403; "blocked" is a message the import dialog already has, which its own pages never
 * trigger). Server only.
 */
export async function readRequestedUrl(request: Request): Promise<{ url: string } | { refusal: Response }> {
  if (isCrossSite(request)) return { refusal: failure("blocked", 403) };
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
