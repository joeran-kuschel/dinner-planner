import { describe, expect, it } from "vitest";
import {
  activityHint,
  COOK_AGAIN_AFTER_DAYS,
  COOK_AGAIN_EXCLUDED_TAGS,
  COOK_AGAIN_LIMIT,
  cookAgainSuggestions,
  daysSince,
  plannedAgoText,
  rankForSuggestion,
  sortByLongestAgo,
} from "@/lib/cook-again";
import { testI18n } from "@/tests/support/i18n";

const en = testI18n("en");
const de = testI18n("de");
const day = (key: string) => new Date(`${key}T00:00:00.000Z`);

describe("daysSince", () => {
  it("counts whole days between two planner days", () => {
    expect(daysSince(day("2026-10-26"), day("2026-10-26"))).toBe(0);
    expect(daysSince(day("2026-10-25"), day("2026-10-26"))).toBe(1);
    expect(daysSince(day("2026-10-05"), day("2026-10-26"))).toBe(21);
  });

  it("is right across a change of clocks, where a local day is 23 or 25 hours", () => {
    expect(daysSince(day("2026-10-24"), day("2026-10-26"))).toBe(2);
    expect(daysSince(day("2026-03-28"), day("2026-03-30"))).toBe(2);
  });

  it("is never negative", () => {
    expect(daysSince(day("2026-10-30"), day("2026-10-26"))).toBe(0);
  });
});

const r = (name: string, favorite: boolean, days: number | null | undefined) => ({ id: name, name, favorite, daysSince: days, tags: [] as string[] });

describe("rankForSuggestion", () => {
  it("puts favorites first, then the longest ago, then those never planned, in each group", () => {
    const ranked = rankForSuggestion([
      r("never", false, null),
      r("fresh", false, 2),
      r("fav-fresh", true, 1),
      r("old", false, 90),
      r("fav-never", true, null),
      r("fav-old", true, 40),
    ]).map((recipe) => recipe.name);
    expect(ranked).toEqual(["fav-old", "fav-fresh", "fav-never", "old", "fresh", "never"]);
  });

  it("keeps the given order where it is equal, and treats an unknown time like never planned", () => {
    expect(rankForSuggestion([r("a", false, 7), r("b", false, 7), r("y", false, null), r("z", false, undefined)]).map((x) => x.name)).toEqual([
      "a",
      "b",
      "y",
      "z",
    ]);
    expect(rankForSuggestion([r("b", false, 7), r("a", false, 7)]).map((x) => x.name)).toEqual(["b", "a"]);
  });

  it("does not change what it is given", () => {
    const input = [r("b", false, 1), r("a", true, 1)];
    rankForSuggestion(input);
    expect(input.map((x) => x.name)).toEqual(["b", "a"]);
  });
});

describe("sortByLongestAgo", () => {
  it("is the recipes planned longest ago first, never planned last, favorites not first", () => {
    expect(sortByLongestAgo([r("fav", true, 3), r("old", false, 50), r("never", false, null), r("mid", false, 9)]).map((x) => x.name)).toEqual([
      "old",
      "mid",
      "fav",
      "never",
    ]);
  });
});

describe("cookAgainSuggestions", () => {
  const none = new Set<string>();

  it("offers only what is due: planned long enough ago, or never", () => {
    const due = cookAgainSuggestions(
      [r("yesterday", true, 1), r("thirteen", false, COOK_AGAIN_AFTER_DAYS - 1), r("fourteen", false, COOK_AGAIN_AFTER_DAYS), r("never", false, null)],
      none,
    );
    expect(due.map((x) => x.name)).toEqual(["fourteen", "never"]);
  });

  it("leaves out what the week shown already has", () => {
    expect(cookAgainSuggestions([r("a", false, 30), r("b", false, 40)], new Set(["b"])).map((x) => x.name)).toEqual(["a"]);
  });

  it.each([...COOK_AGAIN_EXCLUDED_TAGS, "Cocktail", " BASE RECIPE "])("leaves out a recipe tagged %j, a favorite too", (tag) => {
    const recipes = [{ ...r("drink", true, 90), tags: [tag, "party"] }, r("dinner", false, 30)];
    expect(cookAgainSuggestions(recipes, none).map((x) => x.name)).toEqual(["dinner"]);
  });

  it("keeps a recipe whose tag only contains an excluded word", () => {
    expect(cookAgainSuggestions([{ ...r("a", false, 30), tags: ["cocktail party"] }], none)).toHaveLength(1);
  });

  it("ranks favorites first and offers at most five", () => {
    const many = Array.from({ length: 9 }, (_, i) => r(`r${i}`, i === 8, 20 + i));
    const result = cookAgainSuggestions(many, none);
    expect(result).toHaveLength(COOK_AGAIN_LIMIT);
    expect(result[0].name).toBe("r8");
  });

  it("is empty with no recipe, and does not require tags", () => {
    expect(cookAgainSuggestions([], none)).toEqual([]);
    expect(cookAgainSuggestions([{ id: "x", name: "x", daysSince: 20 }], none)).toHaveLength(1);
  });
});

describe("plannedAgoText", () => {
  it.each([
    [null, "never planned"],
    [0, "last planned today"],
    [1, "last planned yesterday"],
    [2, "last planned 2 days ago"],
    [13, "last planned 13 days ago"],
    [14, "last planned 2 weeks ago"],
    [20, "last planned 2 weeks ago"],
    [21, "last planned 3 weeks ago"],
    [59, "last planned 8 weeks ago"],
    [60, "last planned 2 months ago"],
    [95, "last planned 3 months ago"],
    [729, "last planned 24 months ago"],
    [730, "last planned 2 years ago"],
    [800, "last planned 2 years ago"],
  ])("says %s as %j", (days, expected) => {
    expect(plannedAgoText(days, en)).toBe(expected);
  });

  it("never needs a singular: yesterday, then at least 2 days, 2 weeks, 2 months and 2 years", () => {
    for (const days of [2, 14, 60, 730]) expect(plannedAgoText(days, en)).toMatch(/ [2-9]\d* /);
  });

  it("says it in German", () => {
    expect(plannedAgoText(null, de)).toBe("noch nie geplant");
    expect(plannedAgoText(0, de)).toBe("zuletzt heute geplant");
    expect(plannedAgoText(1, de)).toBe("zuletzt gestern geplant");
    expect(plannedAgoText(3, de)).toBe("zuletzt geplant vor 3 Tagen");
    expect(plannedAgoText(21, de)).toBe("zuletzt geplant vor 3 Wochen");
    expect(plannedAgoText(65, de)).toBe("zuletzt geplant vor 2 Monaten");
    expect(plannedAgoText(400, de)).toBe("zuletzt geplant vor 13 Monaten");
    expect(plannedAgoText(800, de)).toBe("zuletzt geplant vor 2 Jahren");
  });
});

describe("activityHint", () => {
  it("joins the favorite mark and when it was planned", () => {
    expect(activityHint({ favorite: true, daysSince: 21 }, en)).toBe("Favorite · last planned 3 weeks ago");
    expect(activityHint({ favorite: false, daysSince: 21 }, en)).toBe("last planned 3 weeks ago");
    expect(activityHint({ favorite: true, daysSince: null }, en)).toBe("Favorite · never planned");
    expect(activityHint({ favorite: true, daysSince: 21 }, de)).toBe("Favorit · zuletzt geplant vor 3 Wochen");
  });

  it("is empty when nothing is known about the recipe", () => {
    expect(activityHint({}, en)).toBe("");
    expect(activityHint({ favorite: false }, en)).toBe("");
  });
});
