import { plural, t } from "@lingui/core/macro";
import Link from "next/link";
import { RecipePhoto } from "@/components/recipe-photo";
import { prisma } from "@/lib/db";
import { RecipeSearchBox } from "@/components/recipe-search-box";
import type { SearchTerm } from "@/lib/recipe-search-terms";
import { readRecipeSearch, recipeSearchWhere, searchTerms, tagNames } from "@/lib/recipe-search";
import type { RecipeSearch } from "@/lib/recipe-search";
import type { I18n } from "@lingui/core";
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

export default async function RecipesPage({ searchParams }: PageProps<"/recipes">) {
  const { i18n } = await getServerI18n();
  const search = readRecipeSearch(await searchParams);
  const searching = isSearching(search);
  const [recipes, totalCount, allTags, terms] = await Promise.all([
    prisma.recipe.findMany({
      where: recipeSearchWhere(search),
      orderBy: { name: "asc" },
      include: {
        _count: { select: { ingredients: true, plannedFor: true } },
        tags: { select: { name: true }, orderBy: { name: "asc" } },
        // Not the image bytes: the card shows the thumbnail through its address.
        photo: { select: { alt: true, updatedAt: true } },
      },
    }),
    searching ? prisma.recipe.count() : Promise.resolve(0),
    tagNames(),
    searchTerms(),
  ]);
  const recipeCount = recipes.length;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="page-title">{t(i18n)`Recipes`}</h1>
          <p className="mt-1 text-sm text-muted">
            {searching
              ? t(i18n)`${recipeCount} of ${plural(totalCount, { one: "# recipe", other: "# recipes" })}`
              : t(i18n)`${plural(recipeCount, { one: "# recipe", other: "# recipes" })} to plan from`}
          </p>
        </div>
        <Link href="/recipes/new" className="btn-primary">
          {t(i18n)`New recipe`}
        </Link>
      </header>

      {(recipes.length > 0 || searching) && (
        <RecipeSearchForm search={search} tags={allTags} terms={terms} i18n={i18n} />
      )}

      {recipes.length === 0 && searching ? (
        <p role="status" className="card p-6 text-sm text-muted">
          {t(i18n)`No recipe matches. Try fewer tags or another word.`}
        </p>
      ) : recipes.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          {t(i18n)`Nothing here yet. A recipe needs a name and its ingredients — the method is optional.`}
        </p>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {recipes.map((recipe) => (
            <RecipeCard key={recipe.id} recipe={recipe} i18n={i18n} />
          ))}
        </ul>
      )}
    </div>
  );
}

const isSearching = ({ text, tags }: RecipeSearch) => Boolean(text) || tags.length > 0;

/**
 * The list's search: a plain GET form, so it works without JavaScript and the result has an
 * address of its own. The search word and the tags are sent together.
 */
function RecipeSearchForm({
  search,
  tags,
  terms,
  i18n,
}: {
  search: RecipeSearch;
  /** The tags in use. */
  tags: string[];
  terms: SearchTerm[];
  i18n: I18n;
}) {
  const searching = isSearching(search);
  // A tag in the address that no recipe has any more still filters, so it stays visible to be unticked.
  const filterTags = [...new Set([...tags, ...search.tags])].sort();
  return (
    <form role="search" action="/recipes" className="card flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <RecipeSearchBox initial={search.text} terms={terms} />
        </div>
        <button type="submit" className="btn-primary">
          {t(i18n)`Search`}
        </button>
        {searching && (
          <Link href="/recipes" className="btn-ghost">
            {t(i18n)`Clear`}
          </Link>
        )}
      </div>

      {filterTags.length > 0 && (
        <fieldset className="flex flex-wrap gap-2">
          <legend className="label mb-1">{t(i18n)`Only recipes with all of these tags`}</legend>
          {filterTags.map((tag) => (
            <label key={tag} className="pill cursor-pointer">
              <input
                type="checkbox"
                name="tag"
                value={tag}
                defaultChecked={search.tags.includes(tag)}
                className="size-4 accent-[var(--accent)]"
              />
              {tag}
            </label>
          ))}
        </fieldset>
      )}
    </form>
  );
}

type CardRecipe = {
  id: string;
  name: string;
  description: string | null;
  servings: number;
  prepMinutes: number | null;
  photo: { alt: string; updatedAt: Date } | null;
  tags: { name: string }[];
  _count: { ingredients: number; plannedFor: number };
};

const TONES = [
  "bg-accent-soft text-accent-text",
  "bg-herb-soft text-herb",
  "bg-ochre-soft text-ochre",
] as const;

/** A flat colour tile with a fork and knife, for a recipe without a photo. Decorative. */
function PhotoPlaceholder({ id }: { id: string }) {
  // From the id, so a recipe keeps its colour when a search changes the list.
  const tone = [...id].reduce((sum, char) => sum + char.charCodeAt(0), 0);
  return (
    <div aria-hidden className={`grid aspect-[3/2] w-full place-items-center ${TONES[tone % TONES.length]}`}>
      <svg
        viewBox="0 0 24 24"
        className="size-10"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M7 3v8a2 2 0 002 2v8M11 3v8M5 3v6M17 3c-2 2-3 5-3 8h3v10" />
      </svg>
    </div>
  );
}

/** One recipe in the list: the whole card is a link, so its tags are plain text. */
function RecipeCard({ recipe, i18n }: { recipe: CardRecipe; i18n: I18n }) {
  return (
    <li>
      <Link
        href={`/recipes/${recipe.id}`}
        className="card flex h-full flex-col overflow-hidden transition-colors hover:border-field"
      >
        {recipe.photo ? (
          <RecipePhoto
            recipeId={recipe.id}
            version={recipe.photo.updatedAt.getTime()}
            alt={recipe.photo.alt}
            size="thumb"
            width={PHOTO_THUMB_WIDTH}
            height={PHOTO_THUMB_HEIGHT}
            className="aspect-[3/2] w-full object-cover"
            lazy
          />
        ) : (
          <PhotoPlaceholder id={recipe.id} />
        )}
        <div className="flex flex-1 flex-col gap-2 p-4">
          <h2 className="font-display text-xl font-semibold leading-snug">{recipe.name}</h2>
          {recipe.description && (
            <p className="line-clamp-2 text-sm text-muted">{recipe.description}</p>
          )}
          {recipe.tags.length > 0 && (
            <ul aria-label={t(i18n)`Tags`} className="flex flex-wrap gap-1.5">
              {recipe.tags.map((tag) => (
                <li key={tag.name} className="pill">
                  {tag.name}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-auto text-sm text-muted">
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
  );
}
