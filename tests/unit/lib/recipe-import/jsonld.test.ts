import { describe, expect, it } from "vitest";
import {
  cleanText,
  durationMinutes,
  extractJsonLd,
  findRecipe,
  instructionLines,
  recipeFormValues,
  recipeFromHtml,
  servingsFrom,
} from "@/lib/recipe-import/jsonld";

const page = (...blocks: unknown[]) =>
  `<html><head><title>x</title>${blocks
    .map((block) => `<script type="application/ld+json">${typeof block === "string" ? block : JSON.stringify(block)}</script>`)
    .join("")}</head><body></body></html>`;

const URL_ = new URL("https://example.com/recipes/pie");

const PIE = {
  "@context": "https://schema.org",
  "@type": "Recipe",
  name: "Apple pie",
  description: "A <b>classic</b> pie &amp; custard.",
  recipeYield: "8 servings",
  prepTime: "PT30M",
  totalTime: "PT2H",
  keywords: "dessert, baking, Apple",
  recipeCategory: "Dessert",
  recipeCuisine: "British",
  recipeIngredient: ["500 g apples", "200 g flour", "1 pinch salt"],
  recipeInstructions: [
    { "@type": "HowToStep", text: "Peel the apples." },
    { "@type": "HowToStep", text: "Bake for 45 minutes." },
  ],
};

describe("cleanText", () => {
  it("drops tags, decodes entities and tidies the spaces", () => {
    expect(cleanText("  Mix <b>well</b> &amp;  rest&nbsp;a bit &#39;ok&#39; &#x41; &unknown; ")).toBe("Mix well & rest a bit 'ok' A &unknown;");
  });

  it("keeps paragraph and line breaks as new lines", () => {
    expect(cleanText("<p>One</p><p>Two<br/>Three</p>")).toBe("One\nTwo\nThree");
  });

  it("is empty for anything but a string", () => {
    expect(cleanText(undefined)).toBe("");
    expect(cleanText(42)).toBe("");
    expect(cleanText({ text: "x" })).toBe("");
  });

  it("does not turn an escaped entity back into markup that survives", () => {
    expect(cleanText("&lt;script&gt;alert(1)&lt;/script&gt;")).toBe("<script>alert(1)</script>");
  });
});

describe("extractJsonLd", () => {
  it("reads every JSON-LD block and nothing else", () => {
    const html = `<script>var a = {"@type":"Recipe"}</script>${page({ a: 1 }, { b: 2 })}<script type="application/json">{"c":3}</script>`;
    expect(extractJsonLd(html)).toEqual([{ a: 1 }, { b: 2 }]);
  });

  it("copes with quoting, case and comment or CDATA wrappers", () => {
    const html = `<SCRIPT TYPE='application/ld+json'>{"a":1}</SCRIPT><script type=application/ld+json><!-- {"b":2} --></script><script type="application/ld+json"><![CDATA[{"c":3}]]></script>`;
    expect(extractJsonLd(html)).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }]);
  });

  it("repairs raw line breaks inside a string and skips what stays broken", () => {
    const html = `<script type="application/ld+json">{"a":"x\ny"}</script><script type="application/ld+json">{ broken </script>`;
    expect(extractJsonLd(html)).toEqual([{ a: "x y" }]);
  });

  it("is empty for a page without any", () => {
    expect(extractJsonLd("<html><body>No data</body></html>")).toEqual([]);
  });
});

describe("findRecipe", () => {
  it("finds a recipe at the top level, in a list, in @graph and nested", () => {
    expect(findRecipe([PIE])).toBe(PIE);
    expect(findRecipe([[{ "@type": "WebSite" }, PIE]])).toBe(PIE);
    expect(findRecipe([{ "@graph": [{ "@type": "Organization" }, PIE] }])).toBe(PIE);
    expect(findRecipe([{ "@type": "WebPage", mainEntity: PIE }])).toBe(PIE);
  });

  it("knows the type as a list or as an address", () => {
    const multi = { ...PIE, "@type": ["Thing", "Recipe"] };
    const url = { ...PIE, "@type": "http://schema.org/Recipe" };
    expect(findRecipe([multi])).toBe(multi);
    expect(findRecipe([url])).toBe(url);
  });

  it("prefers a recipe with a name and content over an empty one", () => {
    const empty = { "@type": "Recipe" };
    expect(findRecipe([empty, PIE])).toBe(PIE);
    expect(findRecipe([empty])).toBe(empty);
  });

  it("finds none on a page about something else", () => {
    expect(findRecipe([{ "@type": "Article", name: "Pie news" }])).toBeNull();
    expect(findRecipe([])).toBeNull();
  });

  it("stops looking in very deep data", () => {
    let deep: unknown = PIE;
    for (let i = 0; i < 20; i++) deep = { child: deep };
    expect(findRecipe([deep])).toBeNull();
  });
});

describe("durationMinutes", () => {
  it.each([
    ["PT30M", "30"],
    ["PT1H30M", "90"],
    ["PT2H", "120"],
    ["P1D", "1440"],
    ["P1DT2H", ""],
    ["PT90S", "2"],
    ["pt45m", "45"],
    ["PT0M", ""],
    ["P2D", ""],
    ["30 minutes", ""],
    ["", ""],
  ])("turns %j into %j", (value, expected) => expect(durationMinutes(value)).toBe(expected));

  it("is empty for anything but a string", () => {
    expect(durationMinutes(30)).toBe("");
    expect(durationMinutes(undefined)).toBe("");
  });
});

describe("servingsFrom", () => {
  it.each([
    ["8 servings", "8"],
    ["Serves 4-6", "4"],
    [6, "6"],
    [["12", "12 muffins"], "12"],
    [["", "4 portions"], "4"],
    ["many", "2"],
    ["0", "2"],
    ["500", "2"],
    [undefined, "2"],
  ])("reads %j as %j", (value, expected) => expect(servingsFrom(value)).toBe(expected));
});

describe("instructionLines", () => {
  it("reads a string, split on new lines", () => {
    expect(instructionLines("Peel.\nBake.<br>Serve.")).toEqual(["Peel.", "Bake.", "Serve."]);
  });

  it("reads steps, a plain list and steps in sections", () => {
    expect(instructionLines([{ "@type": "HowToStep", text: "One" }, { "@type": "HowToStep", name: "Two" }, "Three"])).toEqual(["One", "Two", "Three"]);
    expect(
      instructionLines([
        { "@type": "HowToSection", name: "Dough", itemListElement: [{ "@type": "HowToStep", text: "Mix" }] },
        { "@type": "HowToSection", name: "Filling", itemListElement: [{ "@type": "HowToStep", text: "Slice" }, { "@type": "HowToStep", text: "Fry" }] },
      ]),
    ).toEqual(["Mix", "Slice", "Fry"]);
  });

  it("is empty for nothing usable", () => {
    expect(instructionLines(undefined)).toEqual([]);
    expect(instructionLines([{ "@type": "HowToStep" }, 5])).toEqual([]);
  });
});

describe("recipeFormValues", () => {
  it("maps a recipe to the form's values", () => {
    expect(recipeFormValues(PIE, URL_)).toEqual({
      name: "Apple pie",
      description: "A classic pie & custard.",
      servings: "8",
      prepMinutes: "30",
      sourceUrl: "https://example.com/recipes/pie",
      instructions: "Peel the apples.\nBake for 45 minutes.",
      photoAlt: "",
      tags: ["dessert", "british", "baking", "apple"],
      ingredients: [
        { name: "apples", quantity: "500", unit: "g", category: "OTHER" },
        { name: "flour", quantity: "200", unit: "g", category: "OTHER" },
        { name: "salt", quantity: "1", unit: "pinch", category: "OTHER" },
      ],
    });
  });

  it("uses the total time when there is no prep time", () => {
    expect(recipeFormValues({ ...PIE, prepTime: undefined }, URL_).prepMinutes).toBe("120");
  });

  it("copes with a bare recipe", () => {
    const values = recipeFormValues({ "@type": "Recipe", name: "Toast" }, URL_);
    expect(values).toMatchObject({ name: "Toast", servings: "2", prepMinutes: "", instructions: "", tags: [], ingredients: [] });
  });

  it("reads the old `ingredients` property and one ingredient given as a string", () => {
    expect(recipeFormValues({ name: "A", ingredients: ["2 eggs"] }, URL_).ingredients).toHaveLength(1);
    expect(recipeFormValues({ name: "A", recipeIngredient: "2 eggs" }, URL_).ingredients[0].name).toBe("eggs");
  });

  it("limits what the form could not take", () => {
    const values = recipeFormValues(
      {
        name: "N".repeat(500),
        description: "D".repeat(900),
        recipeIngredient: Array.from({ length: 100 }, (_, i) => `${i + 1} g thing ${i}`),
        recipeInstructions: "S".repeat(30_000),
        keywords: Array.from({ length: 30 }, (_, i) => `tag${i}`).join(","),
      },
      URL_,
    );
    expect(values.name).toHaveLength(200);
    expect(values.description).toHaveLength(500);
    expect(values.ingredients).toHaveLength(60);
    expect(values.instructions).toHaveLength(20_000);
    expect(values.tags).toHaveLength(6);
  });

  it("drops tags that are too long for the app and repeats", () => {
    const values = recipeFormValues({ name: "A", keywords: ["x".repeat(31), "Quick", "quick", " QUICK "] }, URL_);
    expect(values.tags).toEqual(["quick"]);
  });

  it("drops ingredient rows that come out empty", () => {
    expect(recipeFormValues({ name: "A", recipeIngredient: ["", "   ", "2 eggs", "<br>"] }, URL_).ingredients).toHaveLength(1);
  });

  it("never holds markup: tags and entities in every text are gone", () => {
    const values = recipeFormValues(
      { name: "<i>Tarte</i> &amp; Co", recipeIngredient: ["1 <b>cup</b> milk"], recipeInstructions: ["<p>Stir &quot;well&quot;</p>"] },
      URL_,
    );
    expect(values.name).toBe("Tarte & Co");
    expect(values.ingredients[0]).toMatchObject({ unit: "cup", name: "milk" });
    expect(values.instructions).toBe('Stir "well"');
  });
});

describe("recipeFromHtml", () => {
  it("reads the recipe of a page", () => {
    expect(recipeFromHtml(page({ "@graph": [{ "@type": "WebSite" }, PIE] }), URL_)?.name).toBe("Apple pie");
  });

  it("is null for a page without a recipe, or a recipe without a name", () => {
    expect(recipeFromHtml(page({ "@type": "Article" }), URL_)).toBeNull();
    expect(recipeFromHtml("<html></html>", URL_)).toBeNull();
    expect(recipeFromHtml(page({ "@type": "Recipe", recipeIngredient: ["2 eggs"] }), URL_)).toBeNull();
  });
});

// A page is hostile input. These shapes make a backtracking regular expression take minutes on the one thread
// the whole app runs on, so each must be answered in a moment, however it is built.
describe("hostile pages", () => {
  const FAST_MS = 1000;
  const timed = <T,>(work: () => T): [T, number] => {
    const started = performance.now();
    const result = work();
    return [result, performance.now() - started];
  };

  it("reads a page of 200 KB of unclosed <script tags in a moment", () => {
    const [documents, ms] = timed(() => extractJsonLd("<script ".repeat(25_000)));
    expect(documents).toEqual([]);
    expect(ms).toBeLessThan(FAST_MS);
  });

  it("reads a page of many script tags without an end, a huge tag and a long run of quotes", () => {
    for (const html of [
      `<script type="application/ld+json">`.repeat(5_000),
      `<script ${"a=b ".repeat(50_000)}>{}</script>`,
      `<script type="${"'".repeat(200_000)}`,
      `<script type="application/ld+json">{"a":1}</script `.repeat(5_000),
    ]) {
      const [, ms] = timed(() => extractJsonLd(html));
      expect(ms).toBeLessThan(FAST_MS);
    }
  });

  it("still finds the block between tags that never end", () => {
    const html = `<script ${"x".repeat(5_000)}><script type="application/ld+json">{"ok":true}</script>`;
    expect(extractJsonLd(html)).toEqual([{ ok: true }]);
  });

  it("cleans 200 KB of < in any text in a moment", () => {
    for (const payload of ["<".repeat(200_000), "<a".repeat(100_000), "<a ".repeat(70_000), "&".repeat(200_000), "&a".repeat(100_000), "<!".repeat(100_000)]) {
      const [, ms] = timed(() => cleanText(payload));
      expect(ms, payload.slice(0, 6)).toBeLessThan(FAST_MS);
      const [values, valuesMs] = timed(() =>
        recipeFormValues({ name: "N", description: payload, recipeIngredient: [payload], recipeInstructions: [payload, payload] }, URL_),
      );
      expect(values.name).toBe("N");
      expect(valuesMs, payload.slice(0, 6)).toBeLessThan(FAST_MS);
    }
  });

  it("reads 200 KB of ( in an ingredient line in a moment", () => {
    const [values, ms] = timed(() => recipeFormValues({ name: "N", recipeIngredient: ["2 g " + "(".repeat(200_000)] }, URL_));
    expect(ms).toBeLessThan(FAST_MS);
    expect(values.ingredients.length).toBeLessThanOrEqual(1);
  });

  it("stops in deeply nested method steps instead of overflowing the stack", () => {
    let nested: unknown = "Deep step";
    for (let i = 0; i < 5_000; i++) nested = [nested];
    expect(instructionLines(nested)).toEqual([]);
    expect(recipeFormValues({ name: "N", recipeInstructions: nested }, URL_).instructions).toBe("");
  });

  it("keeps tags that are written like markup but are not", () => {
    expect(cleanText("3 < 5 and 7 > 2, a<b, x <3")).toBe("3 < 5 and 7 > 2, a<b, x <3");
    expect(cleanText("1 <2 and <b>bold</b>")).toBe("1 <2 and bold");
  });

  it("drops a tag however it is spelled", () => {
    // A tag ends at its first `>`, even inside a quoted attribute, as in a browser's own simple tokenisers.
    expect(cleanText('<a href="x>y">link</a><BR/>next<P>para</P>')).toBe('y">link\nnextpara');
    expect(cleanText("<!-- note -->kept")).toBe("kept");
  });
});
