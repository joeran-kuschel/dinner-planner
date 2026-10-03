/** Why an import failed. Safe for client code: the dialog maps each code to a message (see `messages.ts`). */
export type ImportErrorCode =
  | "invalid-url"
  | "blocked"
  | "timeout"
  | "too-large"
  | "not-html"
  | "unreachable"
  | "no-recipe"
  | "cancelled";

export const IMPORT_ERROR_CODES: readonly ImportErrorCode[] = [
  "invalid-url",
  "blocked",
  "timeout",
  "too-large",
  "not-html",
  "unreachable",
  "no-recipe",
  "cancelled",
];

export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
    this.name = "ImportError";
  }
}
