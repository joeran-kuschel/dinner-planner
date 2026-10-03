import { MAX_SERVINGS } from "@/lib/planner";
import { MAX_PREP_MINUTES, type RecipeFormValues } from "@/lib/recipe-form";
import { MAX_TAGS, MAX_TAG_LENGTH, normalizeTag } from "@/lib/tags";
import { parseIngredientLine } from "@/lib/recipe-import/ingredient";

/**
 * Reading a recipe out of a web page: most recipe sites publish it for search engines as schema.org `Recipe`
 * data in a `<script type="application/ld+json">` block. That data becomes the recipe form's values, which the
 * visitor reviews before anything is saved. Pages without it have no recipe to import.
 */

type Node = Record<string, unknown>;

const MAX_NAME = 200;
const MAX_DESCRIPTION = 500;
const MAX_INSTRUCTIONS = 20_000;
const MAX_INGREDIENTS = 60;
const MAX_DEPTH = 6;

const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && !Array.isArray(value);

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", deg: "°", frac12: "½", frac14: "¼", frac34: "¾" };

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,8}|#\d{1,8}|[a-z0-9]{1,32});/gi, (whole, entity: string) => {
    if (entity[0] === "#") {
      const code = entity[1].toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[entity.toLowerCase()] ?? whole;
  });
}

/**
 * Everything read from a page is hostile input, and a regular expression that backtracks can freeze the one thread
 * the whole app runs on. So text is cut to a length first, and what looks for tags is a scanner that never goes back.
 */
const MAX_TEXT_INPUT = 100_000;

/** Tags dropped; a line break, paragraph end or list end becomes a new line. A `<` that opens no tag stays. */
function stripTags(text: string): string {
  let out = "";
  let at = 0;
  while (at < text.length) {
    const open = text.indexOf("<", at);
    if (open === -1) return out + text.slice(at);
    out += text.slice(at, open);
    const first = text[open + 1] ?? "";
    const close = /[A-Za-z/!]/.test(first) ? text.indexOf(">", open + 2) : -1;
    if (close === -1) {
      // No `>` anywhere after a tag-like `<` means there is no tag left to find at all.
      if (/[A-Za-z/!]/.test(first)) return out + text.slice(open);
      out += "<";
      at = open + 1;
      continue;
    }
    if (/^(?:br|\/p|\/li|\/div|\/h[1-6])(?![a-z0-9])/i.test(text.slice(open + 1, open + 8))) out += "\n";
    at = close + 1;
  }
  return out;
}

/** Text from a page: tags dropped (paragraph and line breaks kept as new lines), entities decoded, spaces tidied. */
export function cleanText(value: unknown): string {
  if (typeof value !== "string") return "";
  return decodeEntities(stripTags(value.slice(0, MAX_TEXT_INPUT)))
    .replace(/[ \t\u00a0]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

const MAX_JSONLD_BLOCK = 1_000_000;
const MAX_SCRIPT_TAG = 1_000;

/** Every JSON document in the page's `application/ld+json` blocks. */
export function extractJsonLd(html: string): unknown[] {
  const documents: unknown[] = [];
  // Literal searches only: no pattern here can backtrack, however the page is built.
  const opening = /<script/gi;
  const closing = /<\/script\s*>/gi;
  for (let match = opening.exec(html); match; match = opening.exec(html)) {
    const tagEnd = html.indexOf(">", match.index);
    if (tagEnd === -1) break;
    const bodyStart = tagEnd + 1;
    opening.lastIndex = bodyStart;
    if (tagEnd - match.index > MAX_SCRIPT_TAG) continue;
    if (!/\btype\s*=\s*["']?application\/ld\+json/i.test(html.slice(match.index, bodyStart))) continue;
    closing.lastIndex = bodyStart;
    const end = closing.exec(html);
    if (!end) break;
    opening.lastIndex = end.index + end[0].length;
    if (end.index - bodyStart > MAX_JSONLD_BLOCK) continue;
    const text = html
      .slice(bodyStart, end.index)
      .trim()
      .replace(/^(?:<!--|<!\[CDATA\[)/, "")
      .replace(/(?:-->|\]\]>)$/, "")
      .trim();
    for (const attempt of [text, text.replace(/[\u0000-\u001f]+/g, " ")]) {
      try {
        documents.push(JSON.parse(attempt));
        break;
      } catch {
        // Sites sometimes publish broken JSON: try once with the control characters gone, then give up on it.
      }
    }
  }
  return documents;
}

const isRecipe = (node: Node): boolean =>
  [node["@type"]].flat().some((type) => typeof type === "string" && /(^|[/#])recipe$/i.test(type));

/** The first schema.org `Recipe` in the documents, wherever it sits (top level, `@graph`, nested). */
export function findRecipe(documents: unknown[]): Node | null {
  const found: Node[] = [];
  const visit = (value: unknown, depth: number) => {
    if (depth > MAX_DEPTH) return;
    if (Array.isArray(value)) return value.forEach((item) => visit(item, depth + 1));
    if (!isNode(value)) return;
    if (isRecipe(value)) found.push(value);
    for (const child of Object.values(value)) if (typeof child === "object" && child !== null) visit(child, depth + 1);
  };
  visit(documents, 0);
  const usable = (node: Node) => cleanText(node.name) && (node.recipeIngredient || node.recipeInstructions);
  return found.find(usable) ?? found[0] ?? null;
}

/** "PT1H30M" → "90". Empty when it is no duration, zero, or longer than a recipe can take. */
export function durationMinutes(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = value.trim().match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i);
  if (!match) return "";
  const [weeks, days, hours, minutes, seconds] = match.slice(1).map((part) => Number(part ?? 0));
  const total = weeks * 10080 + days * 1440 + hours * 60 + minutes + Math.ceil(seconds / 60);
  return total >= 1 && total <= MAX_PREP_MINUTES ? String(total) : "";
}

/** How many people it serves: the first whole number of `recipeYield` ("4 servings", ["6", "6 portions"]). */
export function servingsFrom(value: unknown): string {
  for (const candidate of [value].flat()) {
    const match = String(candidate ?? "").match(/\d+/);
    if (match && Number(match[0]) >= 1 && Number(match[0]) <= MAX_SERVINGS) return match[0];
  }
  return "2";
}

/** The method as one step per line, from a string, a list of steps, or steps grouped in sections. */
export function instructionLines(value: unknown, depth = 0): string[] {
  if (depth > MAX_DEPTH) return [];
  if (typeof value === "string") return cleanText(value).split("\n").filter(Boolean);
  if (Array.isArray(value)) return value.flatMap((item) => instructionLines(item, depth + 1));
  if (isNode(value)) {
    if (value.itemListElement) return instructionLines(value.itemListElement, depth + 1);
    return instructionLines(value.text ?? value.name, depth + 1);
  }
  return [];
}

/** A few tags: the category and cuisine first, then the site's keywords (which are often a long list). */
const MAX_IMPORTED_TAGS = Math.min(MAX_TAGS, 6);

function tagsFrom(node: Node): string[] {
  const raw = [node.recipeCategory, node.recipeCuisine, node.keywords].flatMap((value) =>
    [value].flat().flatMap((item) => (typeof item === "string" ? item.split(/[,;]/) : [])),
  );
  const tags = raw.map((tag) => normalizeTag(cleanText(tag))).filter((tag) => tag && tag.length <= MAX_TAG_LENGTH);
  return [...new Set(tags)].slice(0, MAX_IMPORTED_TAGS);
}

/** The recipe form's values for a schema.org Recipe found at `pageUrl`. */
export function recipeFormValues(node: Node, pageUrl: URL): RecipeFormValues {
  const ingredients = [node.recipeIngredient ?? node.ingredients]
    .flat()
    .map(cleanText)
    .filter(Boolean)
    .map(parseIngredientLine)
    .filter((row) => row.name)
    .slice(0, MAX_INGREDIENTS);
  return {
    name: cleanText(node.name).slice(0, MAX_NAME),
    description: cleanText(node.description).replace(/\n+/g, " ").slice(0, MAX_DESCRIPTION),
    servings: servingsFrom(node.recipeYield),
    prepMinutes: durationMinutes(node.prepTime) || durationMinutes(node.totalTime),
    sourceUrl: pageUrl.href,
    instructions: instructionLines(node.recipeInstructions).join("\n").slice(0, MAX_INSTRUCTIONS),
    photoAlt: "",
    tags: tagsFrom(node),
    ingredients,
  };
}

/** The picture of a recipe: the first usable address in `image` (a string, an object with a `url`, or a list of them). */
export function imageUrlFrom(value: unknown, pageUrl: URL): string | null {
  for (const candidate of [value].flat(2)) {
    const raw = isNode(candidate)
      ? [candidate.url, candidate.contentUrl].flat().find((item) => typeof item === "string" && item.trim())
      : candidate;
    if (typeof raw !== "string" || !raw.trim()) continue;
    try {
      const url = new URL(raw.trim(), pageUrl);
      if ((url.protocol === "http:" || url.protocol === "https:") && url.href.length <= 2048) return url.href;
    } catch {
      // Not an address: try the next one.
    }
  }
  return null;
}

/** The recipe on a page and the address of its picture, or `null` when the page publishes no recipe. */
export function recipeFromHtml(html: string, pageUrl: URL): { values: RecipeFormValues; imageUrl: string | null } | null {
  const node = findRecipe(extractJsonLd(html));
  if (!node) return null;
  const values = recipeFormValues(node, pageUrl);
  return values.name ? { values, imageUrl: imageUrlFrom(node.image, pageUrl) } : null;
}
