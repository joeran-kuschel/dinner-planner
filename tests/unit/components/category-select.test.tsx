import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { CategorySelect } from "@/components/category-select";
import { type CategoryRow, SEEDED_CATEGORIES } from "@/lib/grocery-category";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const CATEGORIES: CategoryRow[] = [...SEEDED_CATEGORIES];
const options = () => within(screen.getByRole("combobox")).getAllByRole("option").map((option) => option.textContent);

describe("CategorySelect", () => {
  it("lists the sections in the order given, with the ids as values", () => {
    renderWithI18n(<CategorySelect categories={CATEGORIES} aria-label="Category" />);
    expect(options()).toEqual([
      "Fruit and vegetables",
      "Bakery",
      "Meat and fish",
      "Dairy and eggs",
      "Pasta, rice, etc.",
      "Pantry",
      "Herbs & spices",
      "Frozen",
      "Drinks",
      "Other",
    ]);
    expect(screen.getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(CATEGORIES.map((category) => category.id));
  });

  it("starts on Other, wherever Other is in the list", () => {
    const { unmount } = renderWithI18n(<CategorySelect categories={CATEGORIES} aria-label="Category" />);
    expect(screen.getByRole("combobox")).toHaveValue("cat_other");
    unmount();
    renderWithI18n(<CategorySelect categories={[SEEDED_CATEGORIES[9], SEEDED_CATEGORIES[0]]} aria-label="Category" />);
    expect(screen.getByRole("combobox")).toHaveValue("cat_other");
  });

  it("starts on the given default value", () => {
    renderWithI18n(<CategorySelect categories={CATEGORIES} defaultValue="cat_drinks" aria-label="Category" />);
    expect(screen.getByRole("combobox")).toHaveValue("cat_drinks");
  });

  it("names the sections in German", () => {
    renderWithI18n(<CategorySelect categories={CATEGORIES} aria-label="Kategorie" />, { locale: "de" });
    expect(options()[0]).toBe("Obst und Gemüse");
    expect(options()[3]).toBe("Milchprodukte und Eier");
  });

  it("shows the user's own name for a section, and for one the user added", () => {
    const market: CategoryRow = { id: "c-market", key: null, name: "Market", position: 1 };
    const bakery: CategoryRow = { ...SEEDED_CATEGORIES[1], name: "Baker Ben" };
    renderWithI18n(<CategorySelect categories={[SEEDED_CATEGORIES[0], bakery, market]} aria-label="Category" />, { locale: "de" });
    expect(options()).toEqual(["Obst und Gemüse", "Baker Ben", "Market"]);
  });

  it("lets the user pick a section and keeps the name for the form", async () => {
    const user = userEvent.setup();
    renderWithI18n(
      <form>
        <CategorySelect categories={CATEGORIES} name="category" aria-label="Category" />
      </form>,
    );
    await user.selectOptions(screen.getByRole("combobox"), "Bakery");
    expect(new FormData(document.querySelector("form")!).get("category")).toBe("cat_bakery");
  });

  it("has no axe violations", async () => {
    const { container } = renderWithI18n(<CategorySelect categories={CATEGORIES} aria-label="Category" />);
    await expectNoAxeViolations(container);
  });
});
