import { t } from "@lingui/core/macro";
import Link from "next/link";
import { CategoryManager } from "@/components/category-manager";
import { prisma } from "@/lib/db";
import { CATEGORY_ERRORS } from "@/lib/grocery-category";
import { getServerI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { i18n } = await getServerI18n();
  return { title: t(i18n)`Grocery categories` };
}

export default async function GroceryCategoriesPage({ searchParams }: PageProps<"/groceries/categories">) {
  const { i18n } = await getServerI18n();
  const { error, id, name, n } = await searchParams;
  const text = (value: string | string[] | undefined) => (typeof value === "string" ? value.slice(0, 100) : undefined);
  const rows = await prisma.groceryCategory.findMany({
    orderBy: [{ position: "asc" }, { id: "asc" }],
    include: { _count: { select: { ingredients: true, entries: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/groceries" className="text-sm text-muted hover:text-foreground">
          <span aria-hidden>←</span> {t(i18n)`Grocery list`}
        </Link>
        <h1 className="page-title mt-2">{t(i18n)`Grocery categories`}</h1>
        <p className="mt-1 text-sm text-muted">{t(i18n)`The sections of your grocery list, in the order of your shop.`}</p>
      </header>
      <CategoryManager
        categories={rows.map(({ _count, ...row }) => ({ ...row, ingredients: _count.ingredients, entries: _count.entries }))}
        error={CATEGORY_ERRORS.find((code) => code === error) ?? null}
        refusal={{ id: text(id), name: text(name), nonce: text(n) }}
      />
    </div>
  );
}
