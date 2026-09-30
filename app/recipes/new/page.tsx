import { t } from "@lingui/core/macro";
import Link from "next/link";
import { createRecipe } from "@/app/actions/recipes";
import { RecipeForm } from "@/components/recipe-form";
import { tagNames } from "@/lib/recipe-search";
import { getServerI18n } from "@/lib/i18n/server";

export async function generateMetadata() {
  const { i18n } = await getServerI18n();
  return { title: t(i18n)`New recipe` };
}

export default async function NewRecipePage() {
  const { i18n } = await getServerI18n();
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/recipes" className="text-sm text-muted hover:text-foreground">
          ← {t(i18n)`Recipes`}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t(i18n)`New recipe`}</h1>
      </header>
      <RecipeForm action={createRecipe} tagSuggestions={await tagNames()} />
    </div>
  );
}
