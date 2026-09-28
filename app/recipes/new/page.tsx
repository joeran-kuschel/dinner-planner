import Link from "next/link";
import { createRecipe } from "@/app/actions/recipes";
import { RecipeForm } from "@/components/recipe-form";

export const metadata = { title: "New recipe · Dinner Planner" };

export default function NewRecipePage() {
  return (
    <div className="flex flex-col gap-6">
      <header>
        <Link href="/recipes" className="text-sm text-muted hover:text-foreground">
          ← Recipes
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">New recipe</h1>
      </header>
      <RecipeForm action={createRecipe} />
    </div>
  );
}
