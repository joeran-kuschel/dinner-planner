import { describe, expect, it } from "vitest";
import { MAX_SUGGESTIONS, MIN_SUGGESTION_LENGTH, searchSuggestions, type SearchTerm } from "@/lib/recipe-search-terms";

const term = (text: string, kind: SearchTerm["kind"] = "recipe"): SearchTerm => ({ text, kind });
const texts = (terms: SearchTerm[]) => terms.map((t) => t.text);

const TERMS = [
  term("Red Lentil Dal"),
  term("Shakshuka"),
  term("lentils", "ingredient"),
  term("vegan", "tag"),
  term("Chickpea curry"),
];

describe("searchSuggestions", () => {
  it("suggests nothing before the third letter", () => {
    expect(MIN_SUGGESTION_LENGTH).toBe(3);
    expect(searchSuggestions(TERMS, "")).toEqual([]);
    expect(searchSuggestions(TERMS, "le")).toEqual([]);
    expect(searchSuggestions(TERMS, "  l ")).toEqual([]);
  });

  it("starts at three letters", () => {
    expect(texts(searchSuggestions(TERMS, "len"))).toEqual(["lentils", "Red Lentil Dal"]);
  });

  it("matches a part of a name, ignoring case and surrounding spaces", () => {
    expect(texts(searchSuggestions(TERMS, "  CURRY "))).toEqual(["Chickpea curry"]);
  });

  it("lists what starts with the text before what only contains it", () => {
    expect(texts(searchSuggestions([term("Tomato soup"), term("Roasted tomatoes", "ingredient"), term("tomatoes", "ingredient")], "tom"))).toEqual([
      "Tomato soup",
      "tomatoes",
      "Roasted tomatoes",
    ]);
  });

  it("keeps the kind of each suggestion", () => {
    expect(searchSuggestions(TERMS, "veg")).toEqual([term("vegan", "tag")]);
  });

  it("suggests nothing when nothing matches", () => {
    expect(searchSuggestions(TERMS, "sushi")).toEqual([]);
  });

  it(`lists at most ${MAX_SUGGESTIONS}`, () => {
    const many = Array.from({ length: 20 }, (_, i) => term(`pasta ${i}`));
    expect(searchSuggestions(many, "pasta")).toHaveLength(MAX_SUGGESTIONS);
  });

  it("treats pattern characters as text", () => {
    expect(searchSuggestions([term("100% oats"), term("plain")], "0% o")).toEqual([term("100% oats")]);
    expect(searchSuggestions(TERMS, ".*.")).toEqual([]);
  });
});
