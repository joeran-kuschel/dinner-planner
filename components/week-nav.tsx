import type { I18n } from "@lingui/core";
import { t } from "@lingui/core/macro";
import Link from "next/link";
import { addDays, dayKey } from "@/lib/week";

export type WeekNavProps = {
  /** The page the links stay on: the week plan or the grocery list. */
  basePath: "/" | "/groceries";
  weekStart: Date;
  i18n: I18n;
  /** For a page where "This week" would read like the menu's link to the plan. */
  thisWeekLabel?: string;
};

/** Previous week, this week and next week, for the page shown at `basePath`. */
export function WeekNav({ basePath, weekStart, i18n, thisWeekLabel }: WeekNavProps) {
  const weekHref = (offset: number) => `${basePath}?week=${dayKey(addDays(weekStart, offset))}`;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link href={weekHref(-7)} className="btn-secondary" aria-label={t(i18n)`Previous week`}>
        ←
      </Link>
      <Link href={basePath} className="btn-secondary">
        {thisWeekLabel ?? t(i18n)`This week`}
      </Link>
      <Link href={weekHref(7)} className="btn-secondary" aria-label={t(i18n)`Next week`}>
        →
      </Link>
    </div>
  );
}
