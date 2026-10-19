/**
 * The rules behind "Merge with…": checks shared by the server action and the page. Safe for client code.
 */

import { followRules, isGroupId, type MergeRule, normalizeName } from "@/lib/ingredients/canonical";

/** The most rules there can be, so the list stays one a person can look through. */
export const MAX_MERGE_RULES = 300;
/** The longest label a rule keeps, in characters. */
export const MAX_RULE_LABEL = 80;
/** The longest name id a rule takes. A longer name is not an ingredient; refusing it beats cutting it, which would never match. */
export const MAX_RULE_NAME = 200;

/**
 * A name id from a form: a dictionary group (`~tomato`) is kept if it exists, anything else is a typed
 * name, normalised. "" if nothing is left.
 */
export function readNameId(raw: string): string {
  const text = raw.trim();
  return isGroupId(text) ? text : normalizeName(text);
}

/**
 * Whether merging `from` into `to` is nonsense: the same name, or one that would send `to` back to `from`
 * through the merges there already are, so that two names chase each other.
 */
export function wouldLoop(rules: readonly MergeRule[], from: string, to: string): boolean {
  if (from === to) return true;
  const without = new Map(rules.filter((rule) => rule.from !== from).map((rule) => [rule.from, rule]));
  return followRules(to, without) === from;
}
