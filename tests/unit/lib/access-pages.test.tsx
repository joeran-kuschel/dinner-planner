import { describe, expect, it } from "vitest";
import { accessPage, accessRequiredPage, gateI18n, requestLocale } from "@/lib/access-pages";
import { expectNoAxeViolations } from "@/tests/support/axe";

/** Loads the page into the document the way a browser would, without running its script. */
function show(html: string) {
  document.open();
  document.write(html);
  document.close();
}

describe("accessRequiredPage", () => {
  it("says the planner needs its access link, and how to get it again, in English", () => {
    const html = accessRequiredPage(gateI18n("en"), "en");
    show(html);

    expect(document.documentElement.lang).toBe("en");
    expect(document.title).toBe("This planner needs its access link");
    expect(document.querySelector("h1")?.textContent).toBe("This planner needs its access link");
    expect(document.querySelector("code")?.textContent).toBe("npm run k8s:access-link");
  });

  it("is in German for German", () => {
    show(accessRequiredPage(gateI18n("de"), "de"));

    expect(document.documentElement.lang).toBe("de");
    expect(document.querySelector("h1")?.textContent).toBe("Dieser Planer braucht seinen Zugangslink");
  });

  it("is self-contained: no script, no stylesheet or image to fetch, no link to the app", () => {
    const html = accessRequiredPage(gateI18n("en"), "en");

    expect(html).not.toMatch(/<script|<link|<img|src=|href=/i);
  });

  it.each(["en", "de"] as const)("has no accessibility violations in %s", async (locale) => {
    show(accessRequiredPage(gateI18n(locale), locale));

    await expectNoAxeViolations(document.documentElement);
  });
});

describe("accessPage", () => {
  it("shows what it is doing, with a status for the wait and an alert (hidden) for a refusal", () => {
    show(accessPage(gateI18n("en"), "en"));

    expect(document.querySelector("h1")?.textContent).toBe("Opening the planner");
    expect(document.querySelector('[role="status"]')?.textContent).toBe("Checking the access link…");
    const alert = document.querySelector<HTMLElement>('[role="alert"]')!;
    expect(alert.hidden).toBe(true);
    expect(alert.textContent).toContain("That link is not valid");
    expect(alert.textContent).toContain("npm run k8s:access-link");
    expect(document.querySelector("noscript")?.textContent).toContain("needs JavaScript");
  });

  it("takes the key from the address after #, removes it from the bar, and posts it as JSON to /access", () => {
    const html = accessPage(gateI18n("en"), "en");

    expect(html).toContain("location.hash.slice(1)");
    expect(html.indexOf("history.replaceState")).toBeGreaterThan(-1);
    // The address is cleaned before the request is made, so the key is not in the history while it is sent.
    expect(html.indexOf("history.replaceState")).toBeLessThan(html.indexOf('fetch("/access"'));
    expect(html).toContain('method: "POST"');
    expect(html).toContain('"content-type": "application/json"');
    expect(html).toContain('location.replace("/")');
  });

  it("does not stop on a mangled link: decoding sits in a try, after the address is cleaned", () => {
    const html = accessPage(gateI18n("en"), "en");

    expect(html).toMatch(/try \{ key = decodeURIComponent\(key\); \} catch/);
    expect(html.indexOf("history.replaceState")).toBeLessThan(html.indexOf("decodeURIComponent"));
  });

  it("is in German for German", () => {
    show(accessPage(gateI18n("de"), "de"));

    expect(document.querySelector("h1")?.textContent).toBe("Der Planer wird geöffnet");
    expect(document.querySelector('[role="alert"]')?.textContent).toContain("Dieser Link ist nicht gültig");
  });

  it.each(["en", "de"] as const)("has no accessibility violations in %s", async (locale) => {
    show(accessPage(gateI18n(locale), locale));

    await expectNoAxeViolations(document.documentElement);
  });
});

describe("requestLocale", () => {
  it("takes the picked language, else the browser's, else English", () => {
    const de = new Headers({ "accept-language": "de-AT,de;q=0.9,en;q=0.5" });

    expect(requestLocale(de, undefined)).toBe("de");
    expect(requestLocale(de, "en")).toBe("en");
    expect(requestLocale(de, "fr")).toBe("de");
    expect(requestLocale(new Headers(), undefined)).toBe("en");
    expect(requestLocale(new Headers({ "accept-language": "fr-FR" }), undefined)).toBe("en");
  });
});
