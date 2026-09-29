import type { I18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { i18n } = await getServerI18n();
  return { title: t(i18n)`Recipes` };
}

// The list reflects a database that changes outside the request cycle too (a
// `db:seed` run, Prisma Studio), so it is never safe to serve a build-time copy.
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const { i18n } = await getServerI18n();
  const recipes = await prisma.recipe.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { ingredients: true, plannedFor: true } } },
  });
  const recipeCount = recipes.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t(i18n)`Recipes`}</h1>
          <p className="mt-1 text-sm text-muted">
            {t(i18n)`${plural(recipeCount, { one: "# recipe", other: "# recipes" })} to plan from`}
          </p>
        </div>
        <Link href="/recipes/new" className="btn-primary">
          {t(i18n)`New recipe`}
        </Link>
      </header>

      {recipes.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          {t(i18n)`Nothing here yet. A recipe needs a name and its ingredients — the method is optional.`}
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Link
                href={`/recipes/${recipe.id}`}
                className="card flex h-full flex-col gap-2 p-4 transition-colors hover:bg-surface-muted"
              >
                <h2 className="font-medium">{recipe.name}</h2>
                {recipe.description && (
                  <p className="line-clamp-2 text-sm text-muted">{recipe.description}</p>
                )}
                <p className="mt-auto text-xs text-muted">
                  {recipeFacts(i18n, recipe)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** e.g. "Serves 4 · 3 ingredients · 30 min · planned 2×" */
function recipeFacts(
  i18n: I18n,
  recipe: { servings: number; prepMinutes: number | null; _count: { ingredients: number; plannedFor: number } },
): string {
  const { servings, prepMinutes } = recipe;
  const { ingredients, plannedFor } = recipe._count;
  return [
    t(i18n)`Serves ${servings}`,
    t(i18n)`${plural(ingredients, { one: "# ingredient", other: "# ingredients" })}`,
    prepMinutes ? t(i18n)`${prepMinutes} min` : null,
    plannedFor > 0 ? t(i18n)`planned ${plannedFor}×` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}
