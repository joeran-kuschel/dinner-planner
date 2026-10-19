import { describe, expect, it } from "vitest";
import type { MergeRule } from "@/lib/ingredients/canonical";
import { MAX_MERGE_RULES, MAX_RULE_LABEL, MAX_RULE_NAME, readNameId, wouldLoop } from "@/lib/ingredients/merge-rules";

const rule = (from: string, to: string): MergeRule => ({ from, to, fromLabel: from, toLabel: to });

describe("readNameId", () => {
  it.each([
    ["keeps an existing group", "~tomato", "~tomato"],
    ["keeps a group when padded", "  ~tomato ", "~tomato"],
    ["normalises a typed name", "  Red   Wine ", "red wine"],
    ["treats an unknown group as a typed name", "~nonsense", "~nonsense"],
    ["is empty for blank input", "   ", ""],
    ["is empty for nothing", "", ""],
  ])("%s", (_label, raw, expected) => {
    expect(readNameId(raw)).toBe(expected);
  });

  it("does not cut a long name", () => {
    expect(readNameId("a".repeat(500))).toHaveLength(500);
  });

  it("turns a bar into a space", () => {
    expect(readNameId("a|b")).toBe("a b");
  });

  it("has the documented limits", () => {
    expect(MAX_MERGE_RULES).toBe(300);
    expect(MAX_RULE_LABEL).toBe(80);
    expect(MAX_RULE_NAME).toBe(200);
  });
});

describe("wouldLoop", () => {
  it("rejects merging a name into itself", () => {
    expect(wouldLoop([], "a", "a")).toBe(true);
  });

  it("allows a plain merge", () => {
    expect(wouldLoop([], "a", "b")).toBe(false);
  });

  it("rejects the reverse of an existing merge", () => {
    expect(wouldLoop([rule("a", "b")], "b", "a")).toBe(true);
  });

  it("rejects closing a longer chain", () => {
    expect(wouldLoop([rule("a", "b"), rule("b", "c")], "c", "a")).toBe(true);
  });

  it("allows extending a chain", () => {
    expect(wouldLoop([rule("a", "b")], "b", "c")).toBe(false);
  });

  it("ignores the rule that merging again would replace", () => {
    expect(wouldLoop([rule("a", "b")], "a", "c")).toBe(false);
    expect(wouldLoop([rule("a", "b"), rule("b", "c")], "b", "d")).toBe(false);
  });
});
