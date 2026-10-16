import { t } from "@lingui/core/macro";
import { ShelfForm } from "@/components/shelf-form";
import { ShelfList } from "@/components/shelf-list";
import { addShelfItem } from "@/app/actions/shelf";
import { prisma } from "@/lib/db";
import { DEFAULT_GROCERY_CATEGORY } from "@/lib/grocery-category";
import { getServerI18n } from "@/lib/i18n/server";
import { groupShelf } from "@/lib/shelf";
import { dayKey, today } from "@/lib/week";

export async function generateMetadata() {
  const { i18n } = await getServerI18n();
  return { title: t(i18n)`On the shelf` };
}

export default async function ShelfPage() {
  const { i18n, locale } = await getServerI18n();
  const [items, staples] = await Promise.all([
    prisma.shelfItem.findMany(),
    prisma.pantryStaple.findMany({ orderBy: { name: "asc" } }),
  ]);
  const sections = groupShelf(
    items.map((item) => ({
      id: item.id,
      name: item.name,
      label: item.label,
      quantity: item.quantity,
      unit: item.unit,
      category: item.category,
      boughtOn: dayKey(item.boughtOn),
      fromList: item.sourceKey !== null,
    })),
    staples,
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 id="shelf-title" tabIndex={-1} className="page-title">{t(i18n)`On the shelf`}</h1>
        <p className="mt-1 text-sm text-muted">
          {t(i18n)`What you have at home. Grocery lines for things that are here say so.`}
        </p>
      </header>

      <section aria-labelledby="add-to-shelf" className="card p-4">
        <h2 id="add-to-shelf" className="section-title">
          {t(i18n)`Add to the shelf`}
        </h2>
        <div className="mt-3">
          <ShelfForm
            action={addShelfItem}
            submitLabel={t(i18n)`Add`}
            values={{ label: "", quantity: null, unit: null, category: DEFAULT_GROCERY_CATEGORY, boughtOn: dayKey(today()) }}
          />
        </div>
      </section>

      <ShelfList sections={sections} locale={locale} />
    </div>
  );
}
