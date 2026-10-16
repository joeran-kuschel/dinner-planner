"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useRef } from "react";
import { removePantryStaple } from "@/app/actions/pantry";
import { removeShelfItem, updateShelfItem } from "@/app/actions/shelf";
import { ConfirmAction } from "@/components/confirm-action";
import { ShelfForm } from "@/components/shelf-form";
import { formatQuantity } from "@/lib/grocery";
import { categoryLabel, type GroceryCategory } from "@/lib/grocery-category";
import type { ShelfEntry, ShelfGroup } from "@/lib/shelf";
import { formatDay, parseDayKey } from "@/lib/week";
import type { Locale } from "@/lib/i18n/config";

export type ShelfListProps = {
  sections: { category: GroceryCategory; groups: ShelfGroup[] }[];
  locale: Locale;
};

/** The shelf, in the grocery list's shop sections: a heading per section, a block per name, a row per purchase. */
export function ShelfList({ sections, locale }: ShelfListProps) {
  const { i18n } = useLingui();

  if (sections.length === 0) {
    return (
      <p className="card p-6 text-sm text-muted">
        {t(i18n)`Nothing on the shelf yet. Add what you have at home, or tick off a pantry staple on the grocery list.`}
      </p>
    );
  }

  return (
    <div className="md:columns-2 md:gap-6 [&>*]:mb-6 [&>*]:break-inside-avoid">
      {sections.map(({ category, groups }) => {
        const headingId = `shelf-${category}`;
        return (
          <section key={category} aria-labelledby={headingId} className="flex flex-col gap-2">
            <h2 id={headingId} className="section-title">
              {categoryLabel(category, i18n)} <span>({groups.length})</span>
            </h2>
            <div className="card divide-y divide-border">
              {groups.map((group) => (
                <ShelfGroupBlock key={group.name} group={group} locale={locale} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function ShelfGroupBlock({ group, locale }: { group: ShelfGroup; locale: Locale }) {
  const { i18n } = useLingui();
  const { label, staple, entries } = group;
  return (
    <div className="flex flex-col gap-2 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-base font-semibold">{label}</h3>
        {staple && <span className="pill">{t(i18n)`Staple`}</span>}
        {staple && (
          <span className="ml-auto">
            <ConfirmAction
              label={t(i18n)`Remove`}
              accessibleName={t(i18n)`Remove ${label} from the staples`}
              question={t(i18n)`Stop treating ${label} as a staple? Its grocery lines show on the list again. Purchases stay on the shelf.`}
              confirmLabel={t(i18n)`Remove staple`}
              action={removePantryStaple}
              fields={{ id: staple.id }}
              focusAfter="shelf-title"
            />
          </span>
        )}
      </div>
      {entries.length === 0 ? (
        <p className="text-sm text-muted">{t(i18n)`No purchase noted. Ticking it off on the grocery list adds one.`}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <ShelfRow key={entry.id} entry={entry} locale={locale} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ShelfRow({ entry, locale }: { entry: ShelfEntry; locale: Locale }) {
  const { i18n } = useLingui();
  const details = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const day = parseDayKey(entry.boughtOn);
  const bought = day ? formatDay(day, locale) : entry.boughtOn;
  const amount = entry.quantity === null && !entry.unit ? null : formatQuantity(entry.quantity, entry.unit, i18n);
  const { label } = entry;

  // The form is sent as it is; the fold-out closes at once and the focus stays on the button that opened it.
  const close = () => {
    if (details.current) details.current.open = false;
    summary.current?.focus();
  };

  return (
    <li className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex-1 text-sm">
          {amount && <span className="font-medium">{amount} · </span>}
          {t(i18n)`bought ${bought}`}
        </span>
        <details ref={details} className="contents">
          <summary
            ref={summary}
            aria-label={t(i18n)`Edit ${label}, ${bought}`}
            className="btn-secondary cursor-pointer list-none [&::-webkit-details-marker]:hidden"
          >
            {t(i18n)`Edit`}
          </summary>
          <div className="order-last basis-full">
            <ShelfForm
              action={updateShelfItem}
              id={entry.id}
              values={entry}
              submitLabel={t(i18n)`Save`}
              onSubmit={close}
            />
          </div>
        </details>
        <ConfirmAction
          label={t(i18n)`Remove`}
          accessibleName={t(i18n)`Remove ${label}, ${bought}`}
          question={t(i18n)`Remove ${label}, bought ${bought}, from the shelf?`}
          confirmLabel={t(i18n)`Remove`}
          action={removeShelfItem}
          fields={{ id: entry.id }}
          focusAfter="shelf-title"
        />
      </div>
    </li>
  );
}
