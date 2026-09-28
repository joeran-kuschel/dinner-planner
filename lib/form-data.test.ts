import { describe, expect, it } from "vitest";
import { formData } from "@/test/db";
import { parsePositiveInt, parseQuantity, rawText, readText } from "./form-data";

describe("rawText", () => {
  it("keeps typed text as it is, including surrounding spaces", () => {
    expect(rawText("  Soup ")).toBe("  Soup ");
  });

  it("drops NUL characters, which Postgres refuses in text columns", () => {
    expect(rawText("So\u0000up\u0000")).toBe("Soup");
  });

  it("turns a missing field or a file into an empty string", () => {
    expect(rawText(null)).toBe("");
    expect(rawText(new File(["x"], "x.txt"))).toBe("");
  });
});

describe("readText", () => {
  it("reads a field trimmed and without NUL characters", () => {
    expect(readText(formData({ name: " \u0000Soup  " }), "name")).toBe("Soup");
  });

  it("gives an empty string for a missing or blank field", () => {
    expect(readText(formData({ name: "   " }), "name")).toBe("");
    expect(readText(formData({}), "name")).toBe("");
  });
});

describe("parsePositiveInt", () => {
  it.each([
    ["4", 4],
    [" 12 ", 12],
    ["3.7", 3],
    ["99999999999", 99999999999],
  ])("reads %j as %d", (raw, expected) => {
    expect(parsePositiveInt(raw)).toBe(expected);
  });

  it.each(["", "  ", "0", "-2", "abc", "Infinity"])("gives null for %j", (raw) => {
    expect(parsePositiveInt(raw)).toBeNull();
  });
});

describe("parseQuantity", () => {
  it.each([
    ["1.5", 1.5],
    ["1,5", 1.5],
    [" 200 ", 200],
    ["0.25", 0.25],
  ])("reads %j as %d", (raw, expected) => {
    expect(parseQuantity(raw)).toBe(expected);
  });

  it.each(["", " ", "0", "-1", "a pinch", "Infinity"])("gives null (to taste) for %j", (raw) => {
    expect(parseQuantity(raw)).toBeNull();
  });
});
