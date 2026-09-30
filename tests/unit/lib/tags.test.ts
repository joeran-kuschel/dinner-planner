import { describe, expect, it } from "vitest";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTag, parseTags, splitTags, tagsWithinLimits } from "@/lib/tags";

describe("normalizeTag", () => {
  it.each([
    ["vegetarian", "vegetarian"],
    ["  Quick ", "quick"],
    ["ONE   pan", "one pan"],
    ["Freezer\tfriendly", "freezer friendly"],
    ["   ", ""],
    ["Gemüse", "gemüse"],
  ])("normalizeTag(%j) is %j", (raw, expected) => {
    expect(normalizeTag(raw)).toBe(expected);
  });
});

describe("splitTags", () => {
  it("splits on commas, normalises and drops blanks", () => {
    expect(splitTags(" Quick, ,Vegetarian ,, one  pan")).toEqual(["quick", "vegetarian", "one pan"]);
  });

  it("returns nothing for an empty field", () => {
    expect(splitTags("")).toEqual([]);
    expect(splitTags(" , ")).toEqual([]);
  });
});

describe("parseTags", () => {
  it("puts the chips first and the typed text after them", () => {
    expect(parseTags(["quick", "vegan"], "pasta, spicy")).toEqual(["quick", "vegan", "pasta", "spicy"]);
  });

  it("removes duplicates, ignoring case and spacing, keeping the first", () => {
    expect(parseTags(["Quick", "quick "], "QUICK, vegan, vegan")).toEqual(["quick", "vegan"]);
  });

  it("ignores blank chips", () => {
    expect(parseTags(["", "  "], "")).toEqual([]);
  });

  it("does not apply the limits", () => {
    const many = Array.from({ length: MAX_TAGS + 2 }, (_, i) => `tag${i}`);
    expect(parseTags(many, "")).toHaveLength(MAX_TAGS + 2);
  });
});

describe("tagsWithinLimits", () => {
  it("accepts the largest allowed tag list and tag", () => {
    const tags = Array.from({ length: MAX_TAGS }, (_, i) => `${i}`.padEnd(MAX_TAG_LENGTH, "x"));
    expect(tagsWithinLimits(tags)).toBe(true);
  });

  it("refuses one tag too many", () => {
    expect(tagsWithinLimits(Array.from({ length: MAX_TAGS + 1 }, (_, i) => `t${i}`))).toBe(false);
  });

  it("refuses a tag that is too long", () => {
    expect(tagsWithinLimits(["x".repeat(MAX_TAG_LENGTH + 1)])).toBe(false);
  });
});
