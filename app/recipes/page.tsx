import { plural, t } from "@lingui/core/macro";
import Link from "next/link";
import { RecipePhoto } from "@/components/recipe-photo";
import { prisma } from "@/lib/db";
import { PHOTO_THUMB_HEIGHT, PHOTO_THUMB_WIDTH } from "@/lib/recipe-photo-shared";
import { recipeFacts } from "@/lib/recipe-facts";
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
    include: {
      _count: { select: { ingredients: true, plannedFor: true } },
      // Not the image bytes: the card shows the thumbnail through its address.
      photo: { select: { alt: true, updatedAt: true } },
    },
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
                className="card flex h-full flex-col overflow-hidden transition-colors hover:bg-surface-muted"
              >
                {recipe.photo && (
                  <RecipePhoto
                    recipeId={recipe.id}
                    version={recipe.photo.updatedAt.getTime()}
                    alt={recipe.photo.alt}
                    size="thumb"
                    width={PHOTO_THUMB_WIDTH}
                    height={PHOTO_THUMB_HEIGHT}
                    className="aspect-[3/2] w-full border-b border-border object-cover"
                    lazy
                  />
                )}
                <div className="flex flex-1 flex-col gap-2 p-4">
                  <h2 className="font-medium">{recipe.name}</h2>
                  {recipe.description && (
                    <p className="line-clamp-2 text-sm text-muted">{recipe.description}</p>
                  )}
                  <p className="mt-auto text-xs text-muted">
                    {recipeFacts(i18n, {
                      servings: recipe.servings,
                      prepMinutes: recipe.prepMinutes,
                      ingredients: recipe._count.ingredients,
                      plannedFor: recipe._count.plannedFor,
                    }).join(" · ")}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
