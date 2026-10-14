/**
 * The access gate. Every request needs the `dp_access` cookie (see lib/access.ts) except `/healthz`, which the
 * Kubernetes probes call, and `/access`, which hands the cookie out. A browser without it gets a small page saying
 * the planner needs its access link (401); anything else gets a plain 401. Without a key the app is open outside
 * production and refuses everything in production. Documented in documentation/backend/access-key.md.
 */
import { NextResponse, type NextRequest } from "next/server";
import { ACCESS_COOKIE, accessMode, nowSeconds, sessionCookieOptions, signSession, verifySession } from "@/lib/access";
import { accessRequiredResponse, accessUnconfiguredResponse } from "@/lib/access-guard";
import { accessRequiredPage, gateI18n, requestLocale } from "@/lib/access-pages";
import { LOCALE_COOKIE } from "@/lib/i18n/config";

const OPEN_PATHS = new Set(["/healthz", "/access"]);

/** A browser asking for a page, as opposed to a script's fetch, a form action or an image. */
function isPageRequest(request: NextRequest): boolean {
  return ["GET", "HEAD"].includes(request.method) && (request.headers.get("accept") ?? "").includes("text/html");
}

export function proxy(request: NextRequest) {
  if (OPEN_PATHS.has(request.nextUrl.pathname)) return NextResponse.next();

  const mode = accessMode();
  if (mode.mode === "off") return NextResponse.next();
  if (mode.mode === "unconfigured") return accessUnconfiguredResponse();

  const session = verifySession(request.cookies.get(ACCESS_COOKIE)?.value, mode.key, nowSeconds());
  if (!session.valid) {
    if (!isPageRequest(request)) return accessRequiredResponse();
    const locale = requestLocale(request.headers, request.cookies.get(LOCALE_COOKIE)?.value);
    return new NextResponse(accessRequiredPage(gateI18n(locale), locale), {
      status: 401,
      headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
    });
  }

  const response = NextResponse.next();
  // A cookie in use does not run out: it is renewed once it is a month old.
  if (session.renew) response.cookies.set(ACCESS_COOKIE, signSession(mode.key, nowSeconds()), sessionCookieOptions(request.headers));
  return response;
}
