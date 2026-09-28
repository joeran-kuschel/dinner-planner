import Link from "next/link";
import { prisma } from "@/lib/db";

export const metadata = { title: "Recipes · Dinner Planner" };

// The list reflects a database that changes outside the request cycle too (a
// `db:seed` run, Prisma Studio), so it is never safe to serve a build-time copy.
export const dynamic = "force-dynamic";

export default async function RecipesPage() {
  const recipes = await prisma.recipe.findMany({
    orderBy: { name: "asc" },
    include: { _count: { select: { ingredients: true, plannedFor: true } } },
  });

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Recipes</h1>
          <p className="mt-1 text-sm text-muted">
            {recipes.length === 1 ? "1 recipe" : `${recipes.length} recipes`} to plan from
          </p>
        </div>
        <Link href="/recipes/new" className="btn-primary">
          New recipe
        </Link>
      </header>

      {recipes.length === 0 ? (
        <p className="card p-6 text-sm text-muted">
          Nothing here yet. A recipe needs a name and its ingredients — the method is optional.
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
                  Serves {recipe.servings} · {recipe._count.ingredients} ingredients
                  {recipe.prepMinutes ? ` · ${recipe.prepMinutes} min` : ""}
                  {recipe._count.plannedFor > 0 ? ` · planned ${recipe._count.plannedFor}×` : ""}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
