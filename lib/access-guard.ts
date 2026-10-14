/**
 * The access check inside the app, beside `proxy.ts`: the proxy is the first gate, but Next's own guidance is that it
 * should not be the only one, so every server action and route handler asks again. Server only.
 */
import { cookies } from "next/headers";
import { ACCESS_COOKIE, accessMode, nowSeconds, verifySession } from "@/lib/access";

export const accessRequiredResponse = () =>
  Response.json({ error: "access-required" }, { status: 401 });
export const accessUnconfiguredResponse = () =>
  Response.json({ error: "access-key-not-configured" }, { status: 503 });

/** The refusal for the current request, or null when it may go on (also when there is no gate: dev and tests). */
export async function accessRefusal(): Promise<Response | null> {
  const mode = accessMode();
  if (mode.mode === "off") return null;
  if (mode.mode === "unconfigured") return accessUnconfiguredResponse();
  const cookie = (await cookies()).get(ACCESS_COOKIE)?.value;
  return verifySession(cookie, mode.key, nowSeconds()).valid ? null : accessRequiredResponse();
}

/** For a server action: throws unless the request holds a valid access cookie. */
export async function requireAccess(): Promise<void> {
  const refusal = await accessRefusal();
  if (refusal) throw new Error(`Access refused (${refusal.status})`);
}
