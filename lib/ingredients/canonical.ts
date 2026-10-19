/**
 * What a grocery line is, whatever it was called: the same ingredient in another spelling, another language or a
 * synonym unit is one line. Safe for client code (no Prisma client).
 *
 * A line's key is `<name id>|<unit id>`:
 * - The name id is `~<group>` for a name in the dictionary (`names.ts`, so "Tomaten" and "tomatoes" are `~tomato`),
 *   else the typed name trimmed and lowercased. The user's merge rules (`MergeRule`, stored in the database) are
 *   applied on top, so a merged name ends up as the name it was merged into.
 * - The unit id is the unit's base (`measures.ts`): "kg" counts in "g", "l" in "ml", "EL" and "tbsp" are both
 *   "tbsp". A unit that is not in the table stays as typed. Units are never converted, except a metric unit and
 *   its own multiple.
 *
 * Rows stored before this existed keep their old keys (`name|unit`); `keyOfStored()` maps them to the same
 * canonical key, so nothing has to be migrated.
 */

import type { Locale } from "@/lib/i18n/config";
import { type Measure, MEASURES } from "@/lib/ingredients/measures";
import { type NameGroup, NAME_GROUPS } from "@/lib/ingredients/names";

/** A merge the user made: lines named `from` are listed as `to`. Both are name ids. */
export type MergeRule = { from: string; to: string; fromLabel: string; toLabel: string };

export type Identity = {
  key: string;
  nameId: string;
  /** The unit the key counts in (the base unit for a multiple like "kg"); "" for no unit. */
  unitId: string;
  /** The unit as the table knows it ("kg"), or the typed unit; "" for no unit. */
  ownUnitId: string;
  /** How many of `unitId` one of `ownUnitId` is: 1000 for "kg". */
  factor: number;
};

export type Canonicaliser = {
  identify(name: string, unit: string | null | undefined): Identity;
  /** The canonical key for a key stored by an earlier version (`name|unit`), or already canonical. */
  keyOfStored(key: string): string;
  /** The name to show for a name id, in the page's language, or null to show the name as typed. */
  nameLabel(nameId: string): string | null;
  /** Every spelling of the name in the dictionary (the name alone when it is not there). */
  aliases(name: string): string[];
  /** The amount to show for a line summed in its base unit. */
  amount(line: { unitId: string; ownUnitIds: ReadonlySet<string>; quantity: number | null; typedUnit: string | null }): {
    quantity: number | null;
    unit: string | null;
  };
  /** A unit as the page's language names it for this amount, or null for a unit that is not in the table. */
  unitLabel(unit: string | null | undefined, quantity?: number | null): string | null;
};

export const GROUP_PREFIX = "~";

/**
 * Trimmed, inner whitespace collapsed, lowercase: the form names and units are compared in. A bar becomes a space,
 * since it separates the name from the unit in a key.
 */
export const normalizeName = (name: string) => name.replace(/\|/g, " ").trim().replace(/\s+/g, " ").toLowerCase();

const groupById = new Map<string, NameGroup>(NAME_GROUPS.map((group) => [group.id, group]));
const groupByName = new Map<string, NameGroup>(
  NAME_GROUPS.flatMap((group) => [...group.en, ...group.de].map((name) => [normalizeName(name), group] as const)),
);
const measureById = new Map<string, Measure>(MEASURES.map((measure) => [measure.id, measure]));
const measureByName = new Map<string, Measure>(
  MEASURES.flatMap((measure) => [...measure.en, ...measure.de].map((name) => [normalizeName(name), measure] as const)),
);

/** A rule chain is followed this far at most, so a loop in the data can never hang a page. */
const MAX_CHAIN = 20;
/** Past this many units, a base unit's multiples ("kg" for "g") are read as one amount from 1000 on. */
const UPGRADE_FROM = 1000;

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** The name of a group or unit in a language; English when the language has none. */
const firstName = (names: { en: readonly string[]; de: readonly string[] }, locale: Locale) =>
  names[locale][0] ?? names.en[0] ?? "";

/** The name id of a key (`<name id>|<unit id>`): everything before the last bar. */
export function nameIdOfKey(key: string): string {
  const cut = key.lastIndexOf("|");
  return cut < 0 ? key : key.slice(0, cut);
}

/** The unit id of a key: what follows the last bar ("" for a line without a unit). */
export function unitIdOfKey(key: string): string {
  const cut = key.lastIndexOf("|");
  return cut < 0 ? "" : key.slice(cut + 1);
}

export function isGroupId(nameId: string): boolean {
  return nameId.startsWith(GROUP_PREFIX) && groupById.has(nameId.slice(GROUP_PREFIX.length));
}

/** The name id of a name as typed, before any merge rule. */
export function baseNameId(name: string): string {
  const group = groupByName.get(normalizeName(name));
  return group ? GROUP_PREFIX + (group.impliesGroup ?? group.id) : normalizeName(name);
}

/** The name id after the rules: where a chain of merges ends. */
export function followRules(nameId: string, rules: ReadonlyMap<string, MergeRule>): string {
  let id = nameId;
  for (let step = 0; step < MAX_CHAIN; step++) {
    const rule = rules.get(id);
    if (!rule) return id;
    id = rule.to;
  }
  return id;
}

export function createCanonicaliser({ locale, rules = [] }: { locale: Locale; rules?: readonly MergeRule[] }): Canonicaliser {
  const ruleByFrom = new Map(rules.map((rule) => [rule.from, rule]));
  const labelByTarget = new Map<string, string>();
  for (const rule of rules) if (!labelByTarget.has(rule.to)) labelByTarget.set(rule.to, rule.toLabel);

  /** The unit's name for this amount: "clove" for one, "cloves" for any other amount, where the language has both. */
  const unitName = (measure: Measure, quantity: number | null = null) =>
    (quantity !== null && quantity !== 1 && measure.plural?.[locale]) || firstName(measure, locale);

  const identify: Canonicaliser["identify"] = (name, unit) => {
    const group = groupByName.get(normalizeName(name));
    const nameId = followRules(baseNameId(name), ruleByFrom);
    const unitSource = normalizeName(unit ?? "") || group?.impliesUnit || "";
    const measure = measureByName.get(unitSource);
    const ownUnitId = measure?.id ?? unitSource;
    const unitId = measure?.base?.id ?? ownUnitId;
    return { key: `${nameId}|${unitId}`, nameId, unitId, ownUnitId, factor: measure?.base?.factor ?? 1 };
  };

  return {
    identify,

    keyOfStored(key) {
      const cut = key.lastIndexOf("|");
      return cut < 0 ? key : identify(key.slice(0, cut), key.slice(cut + 1)).key;
    },

    nameLabel(nameId) {
      if (isGroupId(nameId)) return capitalise(firstName(groupById.get(nameId.slice(GROUP_PREFIX.length))!, locale));
      return labelByTarget.get(nameId) ?? null;
    },

    aliases(name) {
      const group = groupByName.get(normalizeName(name));
      return group ? [...group.en, ...group.de].map(normalizeName) : [normalizeName(name)];
    },

    amount({ unitId, ownUnitIds, quantity, typedUnit }) {
      if (ownUnitIds.size === 1) {
        // One spelling or unit throughout: show it as it is, in the language of the page.
        const own = measureById.get([...ownUnitIds][0]);
        if (!own) return { quantity, unit: typedUnit };
        // Summed in the base unit, so a multiple ("kg") is divided back; rounded to hide float noise.
        const back = quantity === null ? null : Math.round((quantity / (own.base?.factor ?? 1)) * 1e6) / 1e6;
        return { quantity: back, unit: unitName(own, back) };
      }
      // Several units of one family (g and kg): the base unit, or its multiple once the amount reaches it.
      const base = measureById.get(unitId);
      if (!base) return { quantity, unit: typedUnit };
      const multiple = MEASURES.find((measure) => measure.base?.id === base.id);
      if (multiple && quantity !== null && quantity >= UPGRADE_FROM) {
        const factor = multiple.base?.factor ?? 1;
        const shown = Math.round((quantity / factor) * 1e6) / 1e6;
        return { quantity: shown, unit: unitName(multiple, shown) };
      }
      return { quantity, unit: unitName(base, quantity) };
    },

    unitLabel(unit, quantity = null) {
      const measure = measureByName.get(normalizeName(unit ?? ""));
      return measure ? unitName(measure, quantity) : null;
    },
  };
}
