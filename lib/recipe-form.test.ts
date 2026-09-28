import { describe, expect, it } from "vitest";
import { EMPTY_RECIPE_FORM_STATE, isWebUrl } from "./recipe-form";

describe("EMPTY_RECIPE_FORM_STATE", () => {
  it("starts without an error, without echoed values and at attempt 0", () => {
    expect(EMPTY_RECIPE_FORM_STATE).toEqual({ error: null, values: null, attempt: 0 });
  });
});

describe("isWebUrl", () => {
  it.each(["https://example.com/soup", "http://example.com", "HTTPS://EXAMPLE.COM/a?b=c#d"])(
    "accepts %s",
    (url) => {
      expect(isWebUrl(url)).toBe(true);
    },
  );

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,hi",
    "ftp://example.com",
    "mailto:cook@example.com",
    "example.com/soup",
    "/recipes/1",
    "",
  ])("rejects %j", (url) => {
    expect(isWebUrl(url)).toBe(false);
  });
});
