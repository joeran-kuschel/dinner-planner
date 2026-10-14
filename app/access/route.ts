import { ACCESS_COOKIE, accessMode, keyMatches, nowSeconds, sessionCookieOptions, signSession } from "@/lib/access";
import { accessPage, gateI18n, requestLocale } from "@/lib/access-pages";
import { LOCALE_COOKIE } from "@/lib/i18n/config";
import { isCrossSite } from "@/lib/recipe-import/request";

export const dynamic = "force-dynamic";

/** Failed attempts wait this long, so guessing is not a matter of speed (the key has 256 bits anyway). */
const FAILURE_DELAY_MS = 400;
const MAX_BODY_BYTES = 512;

const cookieOf = (request: Request, name: string) =>
  request.headers.get("cookie")?.split(/;\s*/).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);

/** The page behind the private link, `/access#<key>`: it posts the key from the address to this route. */
export async function GET(request: Request) {
  const locale = requestLocale(request.headers, cookieOf(request, LOCALE_COOKIE));
  return new Response(accessPage(gateI18n(locale), locale), {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "referrer-policy": "no-referrer" },
  });
}

/**
 * `{ "key": "…" }` in, the access cookie out. The key is compared in constant time; a wrong one is answered with
 * 403 after a short delay. Where there is no gate (dev, tests) there is nothing to hand out and it just says yes.
 */
export async function POST(request: Request) {
  if (isCrossSite(request) || !request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return Response.json({ ok: false }, { status: 403 });
  }
  const mode = accessMode();
  if (mode.mode === "unconfigured") return Response.json({ ok: false }, { status: 503 });

  // The body is one key: read it only when it is declared small, instead of whatever is sent (no key is needed to get here).
  const declared = Number(request.headers.get("content-length"));
  if (!Number.isFinite(declared) || declared > MAX_BODY_BYTES) return Response.json({ ok: false }, { status: 413 });

  let candidate: unknown;
  try {
    const text = await request.text();
    if (text.length > MAX_BODY_BYTES) return Response.json({ ok: false }, { status: 413 });
    candidate = JSON.parse(text)?.key;
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (mode.mode === "on" && !(typeof candidate === "string" && keyMatches(candidate, mode.key))) {
    await new Promise((resolve) => setTimeout(resolve, FAILURE_DELAY_MS));
    return Response.json({ ok: false }, { status: 403 });
  }

  const response = Response.json({ ok: true });
  if (mode.mode === "on") {
    const { httpOnly, sameSite, secure, path, maxAge } = sessionCookieOptions(request.headers);
    const attributes = [`Path=${path}`, `Max-Age=${maxAge}`, httpOnly && "HttpOnly", secure && "Secure", `SameSite=${sameSite[0].toUpperCase()}${sameSite.slice(1)}`];
    response.headers.append("set-cookie", `${ACCESS_COOKIE}=${signSession(mode.key, nowSeconds())}; ${attributes.filter(Boolean).join("; ")}`);
  }
  return response;
}
