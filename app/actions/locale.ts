"use server";

import { cookies } from "next/headers";
import { readText } from "@/lib/form-data";
import { isLocale, LOCALE_COOKIE } from "@/lib/i18n/config";

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Switch the interface language. Setting a cookie in a server action makes
 * Next.js render the current page again and send it along with the answer, so
 * with JavaScript the page changes language without reloading; without it,
 * the form post returns the page in the new language.
 */
export async function setLocale(formData: FormData) {
  const locale = readText(formData, "locale");
  if (!isLocale(locale)) throw new Error("setLocale: unknown `locale`");

  (await cookies()).set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: ONE_YEAR,
    sameSite: "lax",
    // Only the server reads it.
    httpOnly: true,
  });
}
