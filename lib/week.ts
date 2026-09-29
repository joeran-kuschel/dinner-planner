/**
 * Day and week helpers.
 *
 * Planner days are *calendar* days, not instants. Every day is represented as a
 * `Date` pinned to UTC midnight so that database comparisons, `@id` lookups and
 * URL keys all agree regardless of the server's timezone. Never build a planner
 * day with a bare `new Date()` — go through `today()` or `parseDayKey()`.
 */

import { INTL_LOCALES, type Locale } from "@/lib/i18n/config";

/** Weeks start on Monday. */
const MONDAY = 1;

const MS_PER_DAY = 86_400_000;

/** The earliest year a day key may name. */
const MIN_YEAR = 1900;

/** UTC midnight of the calendar day the machine is currently in. */
export function today(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export function addDays(day: Date, amount: number): Date {
  return new Date(day.getTime() + amount * MS_PER_DAY);
}

/** UTC midnight of the Monday on or before `day`. */
export function startOfWeek(day: Date): Date {
  const offset = (day.getUTCDay() - MONDAY + 7) % 7;
  return addDays(day, -offset);
}

/** The seven days of the week beginning at `weekStart`. */
export function weekDays(weekStart: Date): Date[] {
  return Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
}

/** Stable `YYYY-MM-DD` key used in URLs and React keys. */
export function dayKey(day: Date): string {
  return day.toISOString().slice(0, 10);
}

/**
 * Parse a `YYYY-MM-DD` key back into a UTC-midnight day.
 * Returns `null` for anything malformed, so callers can fall back to today
 * instead of trusting a query string.
 */
export function parseDayKey(key: string | null | undefined): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const parsed = new Date(`${key}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  // Rejects overflow like 2026-02-31, which Date would silently roll forward.
  if (dayKey(parsed) !== key) return null;
  // Years like 0000 parse in JavaScript but not in Postgres; no plan is that old.
  if (parsed.getUTCFullYear() < MIN_YEAR) return null;
  return parsed;
}

/** Resolve a `?week=` query value to the Monday of that week. */
export function resolveWeekStart(key: string | null | undefined): Date {
  return startOfWeek(parseDayKey(key) ?? today());
}

// All formatting is pinned to UTC, matching how the days are stored. Formatters
// are built once per language and reused.
type Formatters = {
  weekdayLong: Intl.DateTimeFormat;
  weekdayShort: Intl.DateTimeFormat;
  dayMonth: Intl.DateTimeFormat;
  dayMonthYear: Intl.DateTimeFormat;
};
const formatterCache = new Map<Locale, Formatters>();

function formatters(locale: Locale): Formatters {
  let cached = formatterCache.get(locale);
  if (!cached) {
    const tag = INTL_LOCALES[locale];
    cached = {
      weekdayLong: new Intl.DateTimeFormat(tag, { weekday: "long", timeZone: "UTC" }),
      weekdayShort: new Intl.DateTimeFormat(tag, { weekday: "short", timeZone: "UTC" }),
      dayMonth: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", timeZone: "UTC" }),
      dayMonthYear: new Intl.DateTimeFormat(tag, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }),
    };
    formatterCache.set(locale, cached);
  }
  return cached;
}

/** e.g. "Monday" / "Montag", or "Mon" / "Mo." when short. */
export function formatWeekday(day: Date, locale: Locale, style: "long" | "short" = "long"): string {
  const { weekdayLong, weekdayShort } = formatters(locale);
  return (style === "long" ? weekdayLong : weekdayShort).format(day);
}

/** e.g. "12 Oct" / "12. Okt." */
export function formatDayMonth(day: Date, locale: Locale): string {
  return formatters(locale).dayMonth.format(day);
}

/** e.g. "12 Oct – 18 Oct 2026" / "12. Okt. – 18. Okt. 2026" */
export function formatWeekRange(weekStart: Date, locale: Locale): string {
  const { dayMonth, dayMonthYear } = formatters(locale);
  return `${dayMonth.format(weekStart)} – ${dayMonthYear.format(addDays(weekStart, 6))}`;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getTime() === b.getTime();
}
