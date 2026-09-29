/**
 * The compiled message catalogs, built from `locales/*\/messages.po` by
 * `npm run i18n:compile`. Server-side only: the browser receives just the
 * active one, through the root layout.
 */
import type { Messages } from "@lingui/core";
import { messages as de } from "@/locales/de/messages";
import { messages as en } from "@/locales/en/messages";
import type { Locale } from "./config";

export const CATALOGS: Record<Locale, Messages> = { en, de };
