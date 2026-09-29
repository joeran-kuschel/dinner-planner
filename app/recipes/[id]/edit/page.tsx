import { t } from "@lingui/core/macro";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateRecipe } from "@/app/actions/recipes";
import { RecipeForm } from "@/components/recipe-form";
import { prisma } from "@/lib/db";
import { getServerI18n } from "@/lib/i18n/server";

export default async function EditRecipePage({ params }: PageProps<"/recipes/[id]/edit">) {
  const { id } = await params;
  const { i18n } = await getServerI18n();

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: { ingredients: { orderBy: { position: "asc" } } },
  });

  if (!recipe) notFound();

  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href={`/recipes/${recipe.id}`} className="text-sm text-muted hover:text-foreground">
          ← {recipe.name}
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t(i18n)`Edit recipe`}</h1>
      </header>
      <RecipeForm
        action={updateRecipe}
        recipe={{
          id: recipe.id,
          name: recipe.name,
          description: recipe.description,
          servings: recipe.servings,
          prepMinutes: recipe.prepMinutes,
          sourceUrl: recipe.sourceUrl,
          instructions: recipe.instructions,
          ingredients: recipe.ingredients.map(({ name, quantity, unit }) => ({
            name,
            quantity,
            unit,
          })),
        }}
      />
    </div>
  );
}
