import { t } from "@lingui/core/macro";
import { headers } from "next/headers";
import Link from "next/link";
import { NewRecipeScreen } from "@/components/new-recipe-screen";
import { getServerI18n } from "@/lib/i18n/server";
import { importRecipe } from "@/lib/recipe-import";
import { ImportError, type ImportErrorCode } from "@/lib/recipe-import/errors";
import { IMPORT_ERROR_MESSAGES } from "@/lib/recipe-import/messages";
import { tagNames } from "@/lib/recipe-search";
import { unitSuggestions } from "@/lib/units";

export async function generateMetadata() {
  const { i18n } = await getServerI18n();
  return { title: t(i18n)`New recipe` };
}

export default async function NewRecipePage({ searchParams }: PageProps<"/recipes/new">) {
  const { i18n } = await getServerI18n();
  const { import: importFlag, from } = await searchParams;
  // A link from another website must not make the app fetch a page: only the visitor's own navigation does.
  const crossSite = (await headers()).get("sec-fetch-site") === "cross-site";
  const link = typeof from === "string" && !crossSite ? from : undefined;

  // The page without JavaScript: the plain form below sends `?from=`, and the server does what the dialog does.
  let imported;
  let failure: ImportErrorCode | null = null;
  if (link !== undefined) {
    try {
      imported = await importRecipe(link);
    } catch (error) {
      failure = error instanceof ImportError ? error.code : "unreachable";
    }
  }

  const fallback = (
    <form action="/recipes/new" method="get" className="card flex flex-col gap-3 p-4">
      <h2 className="section-title">{t(i18n)`Add from a link`}</h2>
      <div>
        <label className="label" htmlFor="from">
          {t(i18n)`Link to the recipe`}
        </label>
        <input id="from" name="from" defaultValue={link} inputMode="url" autoComplete="off" placeholder="https://…" className="field mt-1" />
      </div>
      {failure && (
        <p role="alert" className="text-sm font-medium text-accent-text">
          {i18n._(IMPORT_ERROR_MESSAGES[failure])}
        </p>
      )}
      <button type="submit" className="btn-primary self-start">
        {t(i18n)`Import`}
      </button>
    </form>
  );

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/recipes" className="text-sm text-muted hover:text-foreground">
          ← {t(i18n)`Recipes`}
        </Link>
        <h1 className="page-title mt-2">{t(i18n)`New recipe`}</h1>
      </header>
      {/* With JavaScript the dialog does this; the plain form is for browsers without it, or after a failed `?from=`. */}
      {failure ? fallback : importFlag === "1" && link === undefined ? <noscript>{fallback}</noscript> : null}
      <NewRecipeScreen
        tagSuggestions={await tagNames()}
        unitSuggestions={await unitSuggestions(i18n)}
        openImport={importFlag === "1" && link === undefined}
        imported={imported}
      />
    </div>
  );
}
