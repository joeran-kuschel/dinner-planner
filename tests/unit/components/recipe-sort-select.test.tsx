import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecipeSortSelect } from "@/components/recipe-sort-select";
import type { RecipeSearch } from "@/lib/recipe-search";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const router = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SEARCH: RecipeSearch = { text: "", tags: [], favorites: false, sort: "name" };

function renderSelect(search: Partial<RecipeSearch> = {}, locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  const result = renderWithI18n(<RecipeSortSelect search={{ ...SEARCH, ...search }} />, { locale });
  return { user, ...result };
}

describe("RecipeSortSelect", () => {
  it("is a select named Sort by with the four orders, the current one chosen", () => {
    renderSelect({ sort: "planned" });
    const select = screen.getByRole("combobox", { name: "Sort by" });
    expect([...(select as HTMLSelectElement).options].map((option) => option.text)).toEqual([
      "Name (A–Z)",
      "Newest first",
      "Planned longest ago",
      "Planned most recently",
    ]);
    expect(select).toHaveValue("planned");
    // Without JavaScript the search form sends it.
    expect(select).toHaveAttribute("name", "sort");
  });

  it("applies a choice at once: the address moves to the new order, and a status says so", async () => {
    router.replace.mockClear();
    const { user } = renderSelect();
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Newest first");

    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/recipes?sort=newest");
    expect(screen.getByRole("status")).toHaveTextContent("Sorted by: Newest first");
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("newest");
  });

  it("keeps the text, the tags and the favorites filter the page shows", async () => {
    router.replace.mockClear();
    const { user } = renderSelect({ text: "gin", tags: ["quick", "vegan"], favorites: true });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Planned longest ago");

    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/recipes?q=gin&tag=quick&tag=vegan&fav=1&sort=planned");
  });

  it("leaves the order out of the address when it is the name order", async () => {
    router.replace.mockClear();
    const { user } = renderSelect({ sort: "recent", favorites: true });
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Name (A–Z)");

    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/recipes?fav=1");
  });

  it("keeps the focus on the select", async () => {
    const { user } = renderSelect();
    const select = screen.getByRole("combobox", { name: "Sort by" });
    await user.selectOptions(select, "Planned most recently");
    expect(select).toHaveFocus();
  });

  it("follows the address when it changes by itself, as the back button does", () => {
    const { rerender } = renderSelect({ sort: "newest" });
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("newest");

    rerender(<RecipeSortSelect search={{ ...SEARCH, sort: "recent" }} />);
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("recent");
  });

  it("clears the status when the address changes by itself, so it never names an order that is not shown", async () => {
    const { user, rerender } = renderSelect();
    await user.selectOptions(screen.getByRole("combobox", { name: "Sort by" }), "Newest first");
    expect(screen.getByRole("status")).toHaveTextContent("Sorted by: Newest first");

    // The page now shows the newest order (the choice landed); then the Clear link leads to the plain list.
    rerender(<RecipeSortSelect search={{ ...SEARCH, sort: "newest" }} />);
    expect(screen.getByRole("status")).toHaveTextContent("Sorted by: Newest first");
    rerender(<RecipeSortSelect search={{ ...SEARCH, sort: "name" }} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("combobox", { name: "Sort by" })).toHaveValue("name");
  });

  it("is in German too, with a German status", async () => {
    router.replace.mockClear();
    const { user } = renderSelect({}, "de");
    const select = screen.getByRole("combobox", { name: "Sortieren nach" });
    await user.selectOptions(select, "Zuletzt geplant");

    expect(router.replace).toHaveBeenCalledExactlyOnceWith("/recipes?sort=recent");
    expect(screen.getByRole("status")).toHaveTextContent("Sortiert nach: Zuletzt geplant");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderSelect();
    await expectNoAxeViolations(container);
  });
});
