"use client";

import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useRef, useState } from "react";
import { unkeepGroceryName, unmergeGroceryLines } from "@/app/actions/groceries";

export type MergedLinesSectionProps = {
  /** The merges the user made, named as the page shows them. */
  rules: { id: string; from: string; to: string }[];
  /** The spellings the user keeps on a line of their own, named as they typed them. */
  separate: { id: string; label: string }[];
};

/**
 * The merges the user made with "Merge" on a line, with an undo for each. A disclosure at the bottom of the
 * grocery page, closed until wanted. Plain forms, so it works without JavaScript. The names the dictionary
 * knows (Kümmel and caraway) are merged by the app and are not listed here: only what the user did.
 */
export function MergedLinesSection({ rules, separate }: MergedLinesSectionProps) {
  const { i18n } = useLingui();
  const [announcement, setAnnouncement] = useState("");
  const summary = useRef<HTMLElement>(null);

  // The button that was pressed goes with its row, so the focus moves to the summary first.
  const onUndo = (from: string, to: string) => {
    summary.current?.focus();
    setAnnouncement(t(i18n)`Undid merging ${from} into ${to}`);
  };

  const onUnkeep = (name: string) => {
    summary.current?.focus();
    setAnnouncement(t(i18n)`${name} may be merged again`);
  };
  const count = rules.length + separate.length;

  return (
    <details className="card p-4">
      <summary ref={summary} className="disclosure-summary">
        {t(i18n)`Merged lines`}
        {count > 0 && (
          <>
            {" "}
            <span className="ml-1 font-normal text-muted">
              {t(i18n)`${plural(count, { one: "# rule", other: "# rules" })}`}
            </span>
          </>
        )}
      </summary>

      <div className="mt-3 flex flex-col gap-3">
        <p className="text-sm text-muted">
          {t(i18n)`Lines you merged with “Merge”, and spellings you keep on a line of their own. They apply in every week.`}
        </p>

        {count === 0 && <p className="text-sm text-muted">{t(i18n)`Nothing merged yet.`}</p>}

        {rules.length > 0 && (
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

        {separate.length > 0 && (
          <ul aria-label={t(i18n)`Lines kept apart`} className="flex flex-col gap-2">
            {separate.map(({ id, label }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2">
                <span>{t(i18n)`${label} is kept on its own line`}</span>
                <form action={unkeepGroceryName} onSubmit={() => onUnkeep(label)}>
                  <input type="hidden" name="id" value={id} />
                  <button
                    type="submit"
                    className="btn-secondary px-3 text-sm"
                    aria-label={t(i18n)`Undo keeping ${label} on its own line`}
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
