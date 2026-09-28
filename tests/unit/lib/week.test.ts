import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addDays,
  dayKey,
  formatDayMonth,
  formatWeekday,
  formatWeekRange,
  isSameDay,
  parseDayKey,
  resolveWeekStart,
  startOfWeek,
  today,
  weekDays,
} from "@/lib/week";

/** A planner day: UTC midnight of the given calendar date. */
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

/** Every planner day must sit exactly on UTC midnight. */
function expectUtcMidnight(d: Date) {
  expect(d.getUTCHours()).toBe(0);
  expect(d.getUTCMinutes()).toBe(0);
  expect(d.getUTCSeconds()).toBe(0);
  expect(d.getUTCMilliseconds()).toBe(0);
}

afterEach(() => {
  vi.useRealTimers();
});

describe("test environment", () => {
  it("runs in Europe/Berlin, so local-time mistakes show up", () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe("Europe/Berlin");
  });
});

describe("today", () => {
  it.each([
    // [instant (UTC), local calendar day in Berlin]
    ["2026-09-28T10:00:00.000Z", "2026-09-28", "midday"],
    ["2026-09-27T22:00:00.000Z", "2026-09-28", "local midnight in summer (UTC is still the day before)"],
    ["2026-09-27T21:59:59.999Z", "2026-09-27", "one millisecond before local midnight in summer"],
    ["2026-09-28T21:30:00.000Z", "2026-09-28", "late evening, UTC same day"],
    ["2026-01-14T23:00:00.000Z", "2026-01-15", "local midnight in winter"],
    ["2026-01-14T22:59:59.999Z", "2026-01-14", "one millisecond before local midnight in winter"],
    ["2025-12-31T23:30:00.000Z", "2026-01-01", "new year's night: already the new year locally"],
    ["2026-02-28T23:30:00.000Z", "2026-03-01", "month edge, non-leap year"],
    ["2028-02-28T23:30:00.000Z", "2028-02-29", "leap day"],
    ["2026-03-28T23:30:00.000Z", "2026-03-29", "00:30 on the spring-forward day"],
    ["2026-03-29T01:30:00.000Z", "2026-03-29", "03:30 CEST, just after the clocks jumped"],
    ["2026-03-29T21:59:00.000Z", "2026-03-29", "23:59 CEST on the spring-forward day"],
    ["2026-10-24T22:30:00.000Z", "2026-10-25", "00:30 CEST on the fall-back day"],
    ["2026-10-25T00:30:00.000Z", "2026-10-25", "02:30 CEST, first pass of the repeated hour"],
    ["2026-10-25T01:30:00.000Z", "2026-10-25", "02:30 CET, second pass of the repeated hour"],
    ["2026-10-25T22:59:00.000Z", "2026-10-25", "23:59 CET on the fall-back day"],
  ])("at %s returns %s (%s)", (instant, expected) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(instant));

    const result = today();

    expect(dayKey(result)).toBe(expected);
    expectUtcMidnight(result);
  });

  it("equals the day parsed from its own key, so it matches stored rows", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-27T22:15:00.000Z"));
    expect(isSameDay(today(), parseDayKey("2026-09-28")!)).toBe(true);
  });
});

describe("addDays", () => {
  it.each([
    ["2026-09-28", 1, "2026-09-29"],
    ["2026-09-28", 0, "2026-09-28"],
    ["2026-09-28", -1, "2026-09-27"],
    ["2026-09-30", 1, "2026-10-01"],
    ["2026-12-31", 1, "2027-01-01"],
    ["2027-01-01", -1, "2026-12-31"],
    ["2026-02-28", 1, "2026-03-01"],
    ["2028-02-28", 1, "2028-02-29"],
    ["2026-03-28", 1, "2026-03-29"],
    ["2026-03-29", 1, "2026-03-30"],
    ["2026-10-24", 1, "2026-10-25"],
    ["2026-10-25", 1, "2026-10-26"],
    ["2026-03-23", 7, "2026-03-30"],
    ["2026-10-19", 7, "2026-10-26"],
    ["2026-01-01", 365, "2027-01-01"],
  ])("%s + %i days is %s, still at UTC midnight (DST has no effect)", (start, amount, expected) => {
    const result = addDays(day(start), amount);
    expect(dayKey(result)).toBe(expected);
    expectUtcMidnight(result);
  });

  it("does not mutate its argument", () => {
    const start = day("2026-09-28");
    addDays(start, 3);
    expect(dayKey(start)).toBe("2026-09-28");
  });
});

describe("startOfWeek", () => {
  it.each([
    ["2026-09-28", "2026-09-28", "Monday is its own week start"],
    ["2026-09-29", "2026-09-28", "Tuesday"],
    ["2026-10-01", "2026-09-28", "Thursday, across a month edge"],
    ["2026-10-03", "2026-09-28", "Saturday"],
    ["2026-10-04", "2026-09-28", "Sunday belongs to the week before, not the next"],
    ["2026-10-05", "2026-10-05", "the next Monday starts a new week"],
    ["2027-01-01", "2026-12-28", "Friday across a year edge"],
    ["2027-01-03", "2026-12-28", "Sunday across a year edge"],
    ["2026-03-01", "2026-02-23", "Sunday 1 March, week starts in February"],
    ["2026-03-29", "2026-03-23", "Sunday of the spring-forward switch"],
    ["2026-03-30", "2026-03-30", "Monday after spring-forward"],
    ["2026-10-25", "2026-10-19", "Sunday of the fall-back switch"],
    ["2026-10-26", "2026-10-26", "Monday after fall-back"],
  ])("%s → %s (%s)", (input, expected) => {
    const result = startOfWeek(day(input));
    expect(dayKey(result)).toBe(expected);
    expectUtcMidnight(result);
    expect(result.getUTCDay()).toBe(1);
  });
});

describe("weekDays", () => {
  it("returns seven consecutive days from Monday to Sunday", () => {
    const days = weekDays(day("2026-09-28"));
    expect(days.map(dayKey)).toEqual([
      "2026-09-28",
      "2026-09-29",
      "2026-09-30",
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(days.map((d) => d.getUTCDay())).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });

  it.each([
    ["2026-03-23", "2026-03-29"],
    ["2026-10-19", "2026-10-25"],
    ["2026-12-28", "2027-01-03"],
  ])("keeps every day at UTC midnight in the week of %s (DST / year edge)", (start, lastKey) => {
    const days = weekDays(day(start));
    expect(days).toHaveLength(7);
    days.forEach(expectUtcMidnight);
    expect(dayKey(days[6])).toBe(lastKey);
    expect(new Set(days.map(dayKey)).size).toBe(7);
  });
});

describe("dayKey", () => {
  it.each([
    ["2026-09-28", "2026-09-28"],
    ["2026-01-01", "2026-01-01"],
    ["2026-12-31", "2026-12-31"],
  ])("formats %s as YYYY-MM-DD", (input, expected) => {
    expect(dayKey(day(input))).toBe(expected);
  });

  it("uses the UTC date, not the local one", () => {
    // 23:30 UTC is already the next day in Berlin; the key stays on the UTC date.
    expect(dayKey(new Date("2026-09-28T23:30:00.000Z"))).toBe("2026-09-28");
  });
});

describe("parseDayKey", () => {
  it.each(["2026-09-28", "2026-01-01", "2026-12-31", "2028-02-29", "2026-03-29", "2026-10-25", "1999-12-31"])(
    "parses %s to UTC midnight and round-trips",
    (key) => {
      const parsed = parseDayKey(key);
      expect(parsed).not.toBeNull();
      expectUtcMidnight(parsed!);
      expect(dayKey(parsed!)).toBe(key);
    },
  );

  it.each([
    ["2026-02-31", "February overflow"],
    ["2026-02-29", "29 February in a non-leap year"],
    ["2026-04-31", "31 in a 30-day month"],
    ["2026-13-01", "month 13"],
    ["2026-00-10", "month 0"],
    ["2026-01-00", "day 0"],
    ["2026-01-32", "day 32"],
    ["2026-9-28", "single-digit month"],
    ["2026-09-8", "single-digit day"],
    ["26-09-28", "two-digit year"],
    ["2026/09/28", "slashes"],
    ["28.09.2026", "German date format"],
    ["2026-09-28T00:00:00Z", "a full timestamp"],
    [" 2026-09-28", "leading space"],
    ["2026-09-28 ", "trailing space"],
    ["2026-09-28\n", "trailing newline"],
    ["abcd-ef-gh", "letters"],
    ["", "empty string"],
    ["today", "a word"],
    ["0000-01-01", "year zero, which Postgres refuses"],
    ["1899-12-31", "before 1900"],
  ])("rejects %j (%s)", (key) => {
    expect(parseDayKey(key)).toBeNull();
  });

  it.each([null, undefined])("returns null for %s", (key) => {
    expect(parseDayKey(key)).toBeNull();
  });
});

describe("resolveWeekStart", () => {
  it.each([
    ["2026-09-28", "2026-09-28"],
    ["2026-10-01", "2026-09-28"],
    ["2026-10-04", "2026-09-28"],
    ["2027-01-02", "2026-12-28"],
  ])("resolves ?week=%s to the Monday %s", (key, expected) => {
    expect(dayKey(resolveWeekStart(key))).toBe(expected);
  });

  it.each([null, undefined, "", "2026-02-31", "garbage"])(
    "falls back to the current week for %j",
    (key) => {
      vi.useFakeTimers();
      // Sunday 4 Oct 2026, 23:30 local: still the week of Monday 28 Sep.
      vi.setSystemTime(new Date("2026-10-04T21:30:00.000Z"));
      expect(dayKey(resolveWeekStart(key))).toBe("2026-09-28");
    },
  );

  it("falls back to the local week just after midnight into Monday", () => {
    vi.useFakeTimers();
    // Monday 5 Oct 2026, 00:30 local, but still Sunday in UTC.
    vi.setSystemTime(new Date("2026-10-04T22:30:00.000Z"));
    expect(dayKey(resolveWeekStart(null))).toBe("2026-10-05");
  });
});

describe("formatting", () => {
  it.each([
    ["2026-09-28", "Monday", "Mon"],
    ["2026-10-04", "Sunday", "Sun"],
    ["2026-03-29", "Sunday", "Sun"],
  ])("formatWeekday(%s) is %s / %s", (key, long, short) => {
    expect(formatWeekday(day(key))).toBe(long);
    expect(formatWeekday(day(key), "long")).toBe(long);
    expect(formatWeekday(day(key), "short")).toBe(short);
  });

  it.each([
    // No September here: ICU versions differ on "Sep" vs "Sept" for en-GB.
    ["2026-10-05", "5 Oct"],
    ["2026-01-01", "1 Jan"],
    ["2026-10-25", "25 Oct"],
  ])("formatDayMonth(%s) is %s", (key, expected) => {
    expect(formatDayMonth(day(key))).toBe(expected);
  });

  it.each([
    ["2026-06-29", "29 Jun – 5 Jul 2026", "across a month edge"],
    ["2026-10-05", "5 Oct – 11 Oct 2026", "within a month"],
    ["2026-12-28", "28 Dec – 3 Jan 2027", "across a year edge"],
    ["2026-03-23", "23 Mar – 29 Mar 2026", "the spring-forward week"],
    ["2026-10-19", "19 Oct – 25 Oct 2026", "the fall-back week"],
  ])("formatWeekRange(%s) is %s (%s)", (key, expected) => {
    expect(formatWeekRange(day(key))).toBe(expected);
  });

  it("formats in UTC, not local time", () => {
    // 23:00 UTC on Sunday is already Monday in Berlin; the label must stay Sunday.
    const lateSunday = new Date("2026-10-04T23:00:00.000Z");
    expect(formatWeekday(lateSunday)).toBe("Sunday");
    expect(formatDayMonth(lateSunday)).toBe("4 Oct");
  });
});

describe("isSameDay", () => {
  it("is true for two separately built instances of the same day", () => {
    expect(isSameDay(day("2026-09-28"), parseDayKey("2026-09-28")!)).toBe(true);
  });

  it("is false for different days", () => {
    expect(isSameDay(day("2026-09-28"), day("2026-09-29"))).toBe(false);
  });

  it("is false for a local-time instant on the same calendar day (only UTC midnight matches)", () => {
    expect(isSameDay(day("2026-09-28"), new Date("2026-09-28T12:00:00.000Z"))).toBe(false);
  });
});
