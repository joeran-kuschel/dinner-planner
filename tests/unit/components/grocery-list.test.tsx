import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";
import { GroceryList, type GroceryListProps } from "@/components/grocery-list";

const actions = vi.hoisted(() => ({
  toggleGroceryLine: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  removeGroceryExtra: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/groceries", () => actions);

type Line = GroceryListProps["lines"][number];

function line(overrides: Partial<Line> & Pick<Line, "label">): Line {
  return {
    key: `${overrides.label.toLowerCase()}|${overrides.unit ?? ""}`,
    quantity: null,
    unit: null,
    category: "OTHER",
    sources: [],
    manual: false,
    checked: false,
    entryId: null,
    ...overrides,
  };
}

const RICE = line({ label: "Arborio rice", quantity: 300, unit: "g", sources: ["Mushroom risotto"] });
const ONION = line({ label: "Onion", quantity: 1.5, sources: ["Mushroom risotto", "Chickpea curry"] });
const SALT = line({ label: "Salt", sources: ["Chickpea curry"], checked: true, entryId: "e-salt" });
const NAPKINS = line({ label: "Napkins", manual: true, entryId: "e-napkins" });
const WINE = line({ label: "Wine", manual: true, checked: true, entryId: "e-wine" });

function renderList(lines: Line[]) {
  const user = userEvent.setup();
  const result = renderWithI18n(<GroceryList weekStart="2026-09-28" lines={lines} />);
  return { user, ...result };
}

const row = (label: string) => screen.getByRole("checkbox", { name: `Tick off ${label}` }).closest("div")!;
const lastFormData = (fn: typeof actions.toggleGroceryLine) => fn.mock.calls.at(-1)![0];

describe("GroceryList", () => {
  describe("empty", () => {
    it("explains where the list comes from", () => {
      renderList([]);
      expect(screen.getByText("Nothing to buy yet. Plan some dinners and their ingredients land here.")).toBeInTheDocument();
      expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    });

    it("has no axe violations", async () => {
      const { container } = renderList([]);
      await expectNoAxeViolations(container);
    });
  });

  describe("lines", () => {
    it("shows each line with its amount and the recipes it comes from", () => {
      renderList([RICE, ONION]);
      const rice = row("Arborio rice");
      expect(within(rice).getByText("Arborio rice")).toBeInTheDocument();
      expect(within(rice).getByText("Mushroom risotto")).toBeInTheDocument();
      expect(within(rice).getByText("300 g")).toBeInTheDocument();

      const onion = row("Onion");
      expect(within(onion).getByText("Mushroom risotto, Chickpea curry")).toBeInTheDocument();
      expect(within(onion).getByText("1.5")).toBeInTheDocument();
    });

    it("reads 'to taste' for a line without an amount", () => {
      renderList([line({ label: "Pepper", sources: ["Chickpea curry"] })]);
      expect(within(row("Pepper")).getByText("to taste")).toBeInTheDocument();
    });

    it("keeps outstanding lines unticked and moves ticked ones into the basket", () => {
      renderList([RICE, SALT, ONION]);
      expect(screen.getByRole("checkbox", { name: "Tick off Arborio rice" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Tick off Onion" })).not.toBeChecked();
      expect(screen.getByRole("checkbox", { name: "Tick off Salt" })).toBeChecked();

      const basket = screen.getByRole("heading", { name: "In the basket (1)" });
      const basketSection = basket.closest("section")!;
      expect(within(basketSection).getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
        "Tick off Salt",
      ]);
    });

    it("has no basket heading while nothing is ticked", () => {
      renderList([RICE, ONION]);
      expect(screen.queryByRole("heading", { name: /In the basket/ })).not.toBeInTheDocument();
    });

    it("celebrates when everything is ticked off", () => {
      renderList([SALT, WINE]);
      expect(screen.getByText("Everything ticked off. 🎉")).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "In the basket (2)" })).toBeInTheDocument();
    });
  });

  describe("categories", () => {
    const MILK = line({ label: "Milk", category: "DAIRY_EGGS" });
    const APPLE = line({ label: "Apple", category: "PRODUCE" });
    const BASIL = line({ label: "Basil", category: "PRODUCE" });
    const headings = () => screen.getAllByRole("heading").map((heading) => heading.textContent);

    it("groups open lines under a heading per category, in shopping order", () => {
      renderList([RICE, MILK, APPLE, BASIL]);
      expect(headings()).toEqual(["Fruit and vegetables (2)", "Dairy and eggs (1)", "Other (1)"]);

      const produce = screen.getByRole("region", { name: "Fruit and vegetables (2)" });
      expect(within(produce).getAllByRole("checkbox").map((box) => box.getAttribute("aria-label"))).toEqual([
        "Tick off Apple",
        "Tick off Basil",
      ]);
    });

    it("leaves out categories without an open line", () => {
      renderList([MILK]);
      expect(headings()).toEqual(["Dairy and eggs (1)"]);
    });

    it("names the category of a ticked line in the basket", () => {
      renderList([{ ...MILK, checked: true }]);
      expect(headings()).toEqual(["In the basket (1)"]);
      expect(within(row("Milk")).getByText("Dairy and eggs")).toBeInTheDocument();
    });

    it("uses the German names", () => {
      renderWithI18n(<GroceryList weekStart="2026-09-28" lines={[APPLE, MILK]} />, { locale: "de" });
      expect(headings()).toEqual(["Obst und Gemüse (1)", "Milchprodukte und Eier (1)"]);
    });

    it("has no axe violations", async () => {
      const { container } = renderList([RICE, MILK, APPLE, { ...SALT, category: "PANTRY" }]);
      await expectNoAxeViolations(container);
    });
  });

  describe("tick-off", () => {
    it("ticks a line off with the week, key, label and the new state", async () => {
      const { user } = renderList([RICE]);
      await user.click(screen.getByRole("checkbox", { name: "Tick off Arborio rice" }));

      await waitFor(() => expect(actions.toggleGroceryLine).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.toggleGroceryLine);
      expect(Object.fromEntries(data)).toEqual({
        weekStart: "2026-09-28",
        key: RICE.key,
        label: "Arborio rice",
        checked: "true",
      });
    });

    it("puts a ticked line back on the list", async () => {
      const { user } = renderList([SALT]);
      await user.click(screen.getByRole("checkbox", { name: "Tick off Salt" }));

      await waitFor(() => expect(actions.toggleGroceryLine).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.toggleGroceryLine).get("checked")).toBe("false");
      expect(lastFormData(actions.toggleGroceryLine).get("key")).toBe(SALT.key);
    });

    it("ticks off with the keyboard", async () => {
      const { user } = renderList([RICE]);
      await user.tab();
      expect(screen.getByRole("checkbox", { name: "Tick off Arborio rice" })).toHaveFocus();
      await user.keyboard(" ");

      await waitFor(() => expect(actions.toggleGroceryLine).toHaveBeenCalledTimes(1));
    });

    it("sends only the line that was ticked", async () => {
      const { user } = renderList([RICE, ONION]);
      await user.click(screen.getByRole("checkbox", { name: "Tick off Onion" }));

      await waitFor(() => expect(actions.toggleGroceryLine).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.toggleGroceryLine).get("label")).toBe("Onion");
    });
  });

  describe("manual items", () => {
    it("marks a hand-added line and offers to remove it", () => {
      renderList([NAPKINS]);
      expect(within(row("Napkins")).getByText("added by hand")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Remove Napkins" })).toBeEnabled();
    });

    it("shows the recipes instead of 'added by hand' when a manual line also comes from the plan", () => {
      renderList([line({ label: "Garlic", manual: true, entryId: "e-garlic", sources: ["Chickpea curry"] })]);
      expect(screen.queryByText("added by hand")).not.toBeInTheDocument();
      expect(screen.getByText("Chickpea curry")).toBeInTheDocument();
    });

    it("offers no remove button for lines derived from the plan", () => {
      renderList([RICE, SALT]);
      expect(screen.queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
    });

    it("offers no remove button for a manual line without a stored entry", () => {
      renderList([line({ label: "Napkins", manual: true })]);
      expect(screen.queryByRole("button", { name: "Remove Napkins" })).not.toBeInTheDocument();
    });

    it("lets a ticked hand-added line be removed from the basket", () => {
      renderList([WINE]);
      expect(screen.getByRole("button", { name: "Remove Wine" })).toBeInTheDocument();
    });

    it("removes a hand-added line by its entry id", async () => {
      const { user } = renderList([RICE, NAPKINS]);
      await user.click(screen.getByRole("button", { name: "Remove Napkins" }));

      await waitFor(() => expect(actions.removeGroceryExtra).toHaveBeenCalledTimes(1));
      expect(Object.fromEntries(lastFormData(actions.removeGroceryExtra))).toEqual({ id: "e-napkins" });
      expect(actions.toggleGroceryLine).not.toHaveBeenCalled();
    });

    it("disables the remove button while the removal is pending", async () => {
      let finish!: () => void;
      actions.removeGroceryExtra.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
      const { user } = renderList([NAPKINS]);
      const remove = screen.getByRole("button", { name: "Remove Napkins" });
      await user.click(remove);

      await waitFor(() => expect(remove).toBeDisabled());
      finish();
      await waitFor(() => expect(remove).toBeEnabled());
    });
  });

  describe("accessibility", () => {
    it("has no axe violations with outstanding, ticked and manual lines", async () => {
      const { container } = renderList([RICE, ONION, NAPKINS, SALT, WINE]);
      await expectNoAxeViolations(container);
    });

    it("has no axe violations with everything ticked off", async () => {
      const { container } = renderList([SALT, WINE]);
      await expectNoAxeViolations(container);
    });
  });

  describe("in German", () => {
    function renderGerman(lines: Line[]) {
      return renderWithI18n(<GroceryList weekStart="2026-09-28" lines={lines} />, { locale: "de" });
    }

    it("labels the rows in German and writes amounts with a decimal comma", () => {
      renderGerman([ONION, SALT, NAPKINS]);
      expect(screen.getByRole("checkbox", { name: "Onion abhaken" })).toBeInTheDocument();
      expect(screen.getByText("1,5")).toBeInTheDocument();
      const salt = screen.getByRole("checkbox", { name: "Salt abhaken" }).closest("div")!;
      expect(within(salt).getByText("nach Geschmack")).toBeInTheDocument();
      expect(screen.getByText("von Hand hinzugefügt")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Napkins entfernen" })).toBeInTheDocument();
      expect(screen.getByRole("heading", { name: "Im Korb (1)" })).toBeInTheDocument();
    });

    it("says in German that there is nothing to buy", () => {
      renderGerman([]);
      expect(screen.getByText(/^Noch nichts zu kaufen\./)).toBeInTheDocument();
    });

    it("has no axe violations", async () => {
      const { container } = renderGerman([RICE, ONION, SALT, NAPKINS, WINE]);
      await expectNoAxeViolations(container);
    });
  });
});
