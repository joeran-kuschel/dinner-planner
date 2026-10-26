import { describe, expect, it } from "vitest";
import { safeSitePath } from "@/lib/safe-path";

describe("safeSitePath", () => {
  it.each([
    ["/recipes", "/recipes"],
    ["/", "/"],
    ["/recipes/abc/edit", "/recipes/abc/edit"],
    ["/recipes?tag=soup&q=a%20b", "/recipes?tag=soup&q=a%20b"],
    ["/groceries?week=2027-01-04#top", "/groceries?week=2027-01-04#top"],
  ])("accepts the path %s", (raw, expected) => {
    expect(safeSitePath(raw)).toBe(expected);
  });

  it.each([
    ["another host", "//evil.example/x"],
    ["another host with a backslash", "/\\evil.example"],
    ["a backslash anywhere", "/recipes\\x"],
    ["a scheme", "https://evil.example/"],
    ["javascript:", "javascript:alert(1)"],
    ["a data address", "data:text/html,x"],
    ["no leading slash", "recipes"],
    ["a protocol-relative start after tabs", "/\t/evil.example"],
    ["dot segments that collapse to another host", "/.//evil.example"],
    ["dot segments after a segment", "/a/..//evil.example"],
    ["an encoded dot segment", "/%2e//evil.example"],
    ["an encoded dot and a double dot", "/%2e%2e//evil.example"],
    ["a newline", "/recipes\n/x"],
    ["a NUL", "/recipes\u0000"],
    ["an empty value", ""],
    ["a value that is too long", `/${"a".repeat(2048)}`],
  ])("refuses %s", (_what, raw) => {
    expect(safeSitePath(raw)).toBeNull();
  });

  it("returns the resolved path: dot segments are collapsed", () => {
    expect(safeSitePath("/a/../recipes")).toBe("/recipes");
    expect(safeSitePath("/./recipes?x=1#y")).toBe("/recipes?x=1#y");
  });

  it("keeps an encoded slash as it is: it does not make another host", () => {
    expect(safeSitePath("/%2F/evil.example")).toBe("/%2F/evil.example");
  });

  it.each([null, undefined])("refuses %s", (raw) => {
    expect(safeSitePath(raw)).toBeNull();
  });

  it("refuses a file field", () => {
    expect(safeSitePath(new File(["x"], "x.txt"))).toBeNull();
  });
});
