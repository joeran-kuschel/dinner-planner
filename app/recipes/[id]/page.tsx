import Link from "next/link";
import { notFound } from "next/navigation";
import { deleteRecipe } from "@/app/actions/recipes";
import { prisma } from "@/lib/db";
import { formatQuantity } from "@/lib/grocery";
import { isWebUrl } from "@/lib/recipe-form";
import { dayKey, formatWeekday, formatDayMonth, startOfWeek, today } from "@/lib/week";

export default async function RecipePage({ params }: PageProps<"/recipes/[id]">) {
  const { id } = await params;

  const recipe = await prisma.recipe.findUnique({
    where: { id },
    include: {
      ingredients: { orderBy: { position: "asc" } },
      // Only upcoming appearances are worth showing; past ones are history.
      plannedFor: { where: { date: { gte: startOfWeek(today()) } }, orderBy: { date: "asc" } },
    },
  });

  if (!recipe) notFound();

  const steps = (recipe.instructions ?? "")
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <Link href="/recipes" className="text-sm text-muted hover:text-foreground">
          ← Recipes
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{recipe.name}</h1>
            <p className="mt-1 text-sm text-muted">
              Serves {recipe.servings}
              {recipe.prepMinutes ? ` · ${recipe.prepMinutes} min` : ""}
              {/* Only http(s): an older row could still hold another scheme. */}
              {recipe.sourceUrl && isWebUrl(recipe.sourceUrl) && (
                <>
                  {" · "}
                  <a
                    href={recipe.sourceUrl}
                    className="underline hover:text-foreground"
                    target="_blank"
                    rel="noreferrer"
                  >
                    source
                  </a>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/recipes/${recipe.id}/edit`} className="btn-secondary">
              Edit
            </Link>
            <form action={deleteRecipe}>
              <input type="hidden" name="id" value={recipe.id} />
              <button type="submit" className="btn-ghost">
                Delete
              </button>
            </form>
          </div>
        </div>
        {recipe.description && <p className="text-sm text-muted">{recipe.description}</p>}
      </header>

      {recipe.plannedFor.length > 0 && (
        <p className="text-sm text-muted">
          Planned for{" "}
          {recipe.plannedFor
            .map((meal) => `${formatWeekday(meal.date, "short")} ${formatDayMonth(meal.date)}`)
            .join(", ")}
          .
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-[minmax(0,18rem)_1fr]">
        <section className="card p-4">
          <h2 className="text-sm font-semibold">Ingredients</h2>
          {recipe.ingredients.length === 0 ? (
            <p className="mt-2 text-sm text-muted">None listed.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-1.5 text-sm">
              {recipe.ingredients.map((ingredient) => (
                <li key={ingredient.id} className="flex justify-between gap-3">
                  <span>{ingredient.name}</span>
                  <span className="shrink-0 text-muted">
                    {formatQuantity(ingredient.quantity, ingredient.unit)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-4">
          <h2 className="text-sm font-semibold">Method</h2>
          {steps.length === 0 ? (
            <p className="mt-2 text-sm text-muted">No steps written down yet.</p>
          ) : (
            <ol className="mt-3 flex list-inside list-decimal flex-col gap-2 text-sm leading-relaxed">
              {steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          )}
        </section>
      </div>

      <footer className="border-t border-border pt-4">
        <Link href={`/?week=${dayKey(startOfWeek(today()))}`} className="btn-secondary">
          Back to the plan
        </Link>
      </footer>
    </div>
  );
}
