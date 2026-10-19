"use client";

import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useRef, useState } from "react";
import { unmergeGroceryLines } from "@/app/actions/groceries";

export type MergedLinesSectionProps = {
  /** The merges the user made, named as the page shows them. */
  rules: { id: string; from: string; to: string }[];
};

/**
 * The merges the user made with "Merge" on a line, with an undo for each. A disclosure at the bottom of the
 * grocery page, closed until wanted. Plain forms, so it works without JavaScript. The names the dictionary
 * knows (Kümmel and caraway) are merged by the app and are not listed here: only what the user did.
 */
export function MergedLinesSection({ rules }: MergedLinesSectionProps) {
  const { i18n } = useLingui();
  const [announcement, setAnnouncement] = useState("");
  const summary = useRef<HTMLElement>(null);

  // The button that was pressed goes with its row, so the focus moves to the summary first.
  const onUndo = (from: string, to: string) => {
    summary.current?.focus();
    setAnnouncement(t(i18n)`Undid merging ${from} into ${to}`);
  };

  return (
    <details className="card p-4">
      <summary ref={summary} className="disclosure-summary">
        {t(i18n)`Merged lines`}
        {rules.length > 0 && (
          <>
            {" "}
            <span className="ml-1 font-normal text-muted">
              {t(i18n)`${plural(rules.length, { one: "# merge", other: "# merges" })}`}
            </span>
          </>
        )}
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">
          {t(i18n)`Lines you merged with “Merge”. They are listed as one line in every week.`}
        </p>

        {rules.length === 0 ? (
          <p className="text-sm text-muted">{t(i18n)`Nothing merged yet.`}</p>
        ) : (
          <ul aria-label={t(i18n)`Merged lines`} className="flex flex-col gap-2">
            {rules.map(({ id, from, to }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{t(i18n)`${from} is listed as ${to}`}</span>
                <form action={unmergeGroceryLines} onSubmit={() => onUndo(from, to)}>
                  <input type="hidden" name="id" value={id} />
                  <button
                    type="submit"
                    className="btn-secondary px-3 text-sm"
                    aria-label={t(i18n)`Undo merging ${from} into ${to}`}
                  >
                    {t(i18n)`Undo`}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}

        <p role="status" className="sr-only">
          {announcement}
        </p>
      </div>
    </details>
  );
}
