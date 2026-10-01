import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PantrySection, type PantrySectionProps } from "@/components/pantry-section";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  addPantryStaple: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  removePantryStaple: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/pantry", () => actions);

const STAPLES = [
  { id: "s-oil", name: "olive oil" },
  { id: "s-salt", name: "salt" },
];

function renderSection(overrides: Partial<PantrySectionProps> = {}, locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  const result = renderWithI18n(
    <PantrySection
      staples={STAPLES}
      hiddenCount={0}
      showHidden={false}
      toggleHref="/groceries?week=2026-09-28&pantry=show"
      suggestions={["pasta", "salt", "tomatoes"]}
      {...overrides}
    />,
    { locale },
  );
  return { user, details: result.container.querySelector("details")!, ...result };
}

describe("PantrySection", () => {
  it("is closed until wanted, and open while the hidden lines are shown", () => {
    expect(renderSection().details.open).toBe(false);
    expect(renderSection({ hiddenCount: 2, showHidden: true }).details.open).toBe(true);
  });

  it("says in the summary how many lines it hides", () => {
    renderSection({ hiddenCount: 3 });
    expect(screen.getByText("Pantry staples", { selector: "summary" })).toHaveTextContent("3 items hidden");
  });

  it("uses the singular for one hidden line and says nothing when none are hidden", () => {
    const one = renderSection({ hiddenCount: 1 });
    expect(screen.getByText("Pantry staples", { selector: "summary" })).toHaveTextContent("1 item hidden");
    one.unmount();
    renderSection();
    expect(screen.getByText("Pantry staples", { selector: "summary" })).not.toHaveTextContent("hidden");
  });

  it("lists the staples as chips, each with a button that names it", () => {
    renderSection();
    const list = screen.getByRole("list", { name: "Pantry staples" });
    expect(within(list).getAllByRole("listitem").map((item) => item.textContent?.replace("✕", ""))).toEqual([
      "olive oil",
      "salt",
    ]);
    expect(screen.getByRole("button", { name: "Remove salt from the pantry staples" })).toBeInTheDocument();
  });

  it("says so when there are no staples", () => {
    renderSection({ staples: [] });
    expect(screen.getByText("No staples yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Pantry staples" })).not.toBeInTheDocument();
  });

  it("moves the focus to the next chip after a removal, then to the add field", async () => {
    const { user, rerender } = renderSection();
    await user.click(screen.getByRole("button", { name: "Remove olive oil from the pantry staples" }));
    // The server has removed it: the section is rendered again with the remaining staple.
    rerender(
      <PantrySection
        staples={[STAPLES[1]]}
        hiddenCount={0}
        showHidden={false}
        toggleHref="/groceries?week=2026-09-28&pantry=show"
        suggestions={[]}
      />,
    );
    expect(screen.getByRole("button", { name: "Remove salt from the pantry staples" })).toHaveFocus();

    await user.click(screen.getByRole("button", { name: "Remove salt from the pantry staples" }));
    rerender(
      <PantrySection staples={[]} hiddenCount={0} showHidden={false} toggleHref="/groceries" suggestions={[]} />,
    );
    expect(screen.getByRole("combobox", { name: "Add a staple" })).toHaveFocus();
  });

  it("says the list is full and switches adding off at the limit, instead of ignoring the name silently", () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ id: `s${i}`, name: `staple ${i}` }));
    renderSection({ staples: many });
    expect(screen.getByText("The list is full: 200 staples. Remove one to add another.")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Add a staple" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();
  });

  it("allows adding while there is room, and says nothing about a limit", () => {
    renderSection();
    expect(screen.queryByText(/The list is full/)).not.toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Add a staple" })).toBeEnabled();
  });

  it("removes a staple by its id", async () => {
    const { user } = renderSection();
    await user.click(screen.getByRole("button", { name: "Remove salt from the pantry staples" }));
    expect(actions.removePantryStaple).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(actions.removePantryStaple.mock.calls[0][0])).toEqual({ id: "s-salt" });
  });

  it("adds the typed name", async () => {
    const { user } = renderSection();
    await user.type(screen.getByRole("combobox", { name: "Add a staple" }), "Flour");
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(actions.addPantryStaple).toHaveBeenCalledTimes(1);
    expect(actions.addPantryStaple.mock.calls[0][0].get("name")).toBe("Flour");
  });

  it("suggests the ingredients in recipes that are not staples yet, and limits the length", () => {
    const { container } = renderSection();
    expect([...container.querySelectorAll("datalist option")].map((o) => (o as HTMLOptionElement).value)).toEqual([
      "pasta",
      "tomatoes",
    ]);
    expect(screen.getByRole("combobox", { name: "Add a staple" })).toHaveAttribute("maxLength", "60");
  });

  describe("the link that shows the hidden lines", () => {
    it("offers to show them, to the address given", () => {
      renderSection({ hiddenCount: 2 });
      expect(screen.getByRole("link", { name: "Show the 2 hidden items" })).toHaveAttribute(
        "href",
        "/groceries?week=2026-09-28&pantry=show",
      );
    });

    it("uses the singular for one line", () => {
      renderSection({ hiddenCount: 1 });
      expect(screen.getByRole("link", { name: "Show the 1 hidden item" })).toBeInTheDocument();
    });

    it("offers to hide them again while they are shown", () => {
      renderSection({ hiddenCount: 2, showHidden: true, toggleHref: "/groceries?week=2026-09-28" });
      expect(screen.getByRole("link", { name: "Hide the pantry items again" })).toHaveAttribute(
        "href",
        "/groceries?week=2026-09-28",
      );
    });

    it("is not there when nothing is hidden", () => {
      renderSection();
      expect(screen.queryByRole("link")).not.toBeInTheDocument();
    });
  });

  it("has no axe violations, with staples, without and open", async () => {
    const withStaples = renderSection({ hiddenCount: 2, showHidden: true });
    await expectNoAxeViolations(withStaples.container);
    withStaples.unmount();
    const empty = renderSection({ staples: [] });
    await expectNoAxeViolations(empty.container);
  });

  it("speaks German", () => {
    renderSection({ hiddenCount: 2 }, "de");
    expect(screen.getByText("Vorratsartikel", { selector: "summary" })).toHaveTextContent("2 Artikel ausgeblendet");
    expect(screen.getByRole("combobox", { name: "Vorratsartikel hinzufügen" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "salt aus den Vorratsartikeln entfernen" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Die 2 ausgeblendeten Artikel anzeigen" })).toBeInTheDocument();
  });
});
