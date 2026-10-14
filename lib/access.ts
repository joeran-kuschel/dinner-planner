/**
 * The shared access key and the cookie it hands out. Server only (`node:crypto`).
 *
 * One secret, `ACCESS_KEY`, guards the whole app: a browser that holds a valid `dp_access` cookie is let in. The
 * cookie is `v1.<expires>.<signature>`, signed with a secret derived from the key (never the key itself), so it
 * cannot be forged without the key and changing the key invalidates every cookie at once. Documented in
 * `documentation/backend/access-key.md`.
 */
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const ACCESS_COOKIE = "dp_access";

/** How long a cookie is valid, and when a cookie in use is renewed (once it is older than this). */
export const SESSION_SECONDS = 365 * 24 * 60 * 60;
export const RENEW_AFTER_SECONDS = 30 * 24 * 60 * 60;

/** A shorter key is refused: the one `deploy.sh` makes has 43 characters. */
export const MIN_KEY_LENGTH = 16;

/**
 * What the environment says about the gate: `on` (a key is set), `off` (no key, outside production: `npm run dev`,
 * Vitest), or `unconfigured` (production without a usable key: everything is refused, so a forgotten Secret never
 * leaves the app open).
 */
export type AccessMode = { mode: "on"; key: string } | { mode: "off" } | { mode: "unconfigured" };

export function accessMode(env: Record<string, string | undefined> = process.env): AccessMode {
  const key = env.ACCESS_KEY?.trim();
  if (key) return key.length >= MIN_KEY_LENGTH ? { mode: "on", key } : { mode: "unconfigured" };
  return env.NODE_ENV === "production" ? { mode: "unconfigured" } : { mode: "off" };
}

const sign = (key: string, payload: string) =>
  createHmac("sha256", createHmac("sha256", key).update("dinner-planner session v1").digest())
    .update(payload)
    .digest("base64url");

/** A fresh cookie value, valid for `SESSION_SECONDS` from `nowSeconds`. */
export function signSession(key: string, nowSeconds: number): string {
  const payload = `v1.${nowSeconds + SESSION_SECONDS}`;
  return `${payload}.${sign(key, payload)}`;
}

/** Whether a cookie value is genuine and unexpired, and whether it is old enough to be renewed. */
export function verifySession(
  value: string | undefined,
  key: string,
  nowSeconds: number,
): { valid: boolean; renew: boolean } {
  const refused = { valid: false, renew: false };
  const [version, expires, signature, ...rest] = (value ?? "").split(".");
  if (version !== "v1" || !signature || rest.length > 0 || !/^\d{1,12}$/.test(expires)) return refused;
  if (!safeEqual(signature, sign(key, `v1.${expires}`))) return refused;
  const remaining = Number(expires) - nowSeconds;
  if (remaining <= 0) return refused;
  return { valid: true, renew: remaining < SESSION_SECONDS - RENEW_AFTER_SECONDS };
}

/** Whether a key sent by a visitor is the access key. Compared as digests, in constant time. */
export function keyMatches(candidate: string, key: string): boolean {
  const digest = (text: string) => createHash("sha256").update(text).digest();
  return timingSafeEqual(digest(candidate), digest(key));
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** The cookie's attributes. `Secure` only when the request came in over HTTPS (the ingress says so). */
export function sessionCookieOptions(headers: Headers) {
  const proto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  return { httpOnly: true, sameSite: "lax" as const, secure: proto === "https", path: "/", maxAge: SESSION_SECONDS };
}

export const nowSeconds = () => Math.floor(Date.now() / 1000);
