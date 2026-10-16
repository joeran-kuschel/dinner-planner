import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShelfList } from "@/components/shelf-list";
import { groupShelf, type ShelfEntry } from "@/lib/shelf";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  updateShelfItem: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  removeShelfItem: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  removePantryStaple: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/shelf", () => actions);
vi.mock("@/app/actions/pantry", () => actions);

function entry(overrides: Partial<ShelfEntry> & Pick<ShelfEntry, "id" | "label">): ShelfEntry {
  return {
    name: overrides.label.toLowerCase(),
    quantity: null,
    unit: null,
    category: "OTHER",
    boughtOn: "2026-10-01",
    fromList: false,
    ...overrides,
  };
}

const ENTRIES = [
  entry({ id: "m1", label: "Milk", category: "DAIRY_EGGS", quantity: 1.5, unit: "l", boughtOn: "2026-10-12" }),
  entry({ id: "m2", label: "Milk", category: "DAIRY_EGGS", quantity: 1, unit: "l", boughtOn: "2026-10-01" }),
  entry({ id: "s1", label: "Salt", category: "HERBS_SPICES", boughtOn: "2026-10-05", fromList: true }),
];
const STAPLES = [
  { id: "st-salt", name: "salt" },
  { id: "st-oil", name: "olive oil" },
];

function renderShelf(locale: "en" | "de" = "en", entries = ENTRIES, staples = STAPLES) {
  const user = userEvent.setup();
  const result = renderWithI18n(<ShelfList sections={groupShelf(entries, staples)} locale={locale} />, { locale });
  return { user, ...result };
}

describe("ShelfList", () => {
  it("has a heading per shop section, in the grocery list's order, and one per name beneath it", () => {
    renderShelf();
    const sections = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(sections).toEqual(["Dairy and eggs (1)", "Herbs & spices (1)", "Other (1)"]);
    const dairy = screen.getByRole("region", { name: /^Dairy and eggs/ });
    expect(within(dairy).getByRole("heading", { level: 3, name: "Milk" })).toBeInTheDocument();
  });

  it("lists every purchase of a name, newest first, with its amount and day", () => {
    renderShelf();
    const dairy = screen.getByRole("region", { name: /^Dairy and eggs/ });
    const [newest, oldest] = within(dairy).getAllByRole("listitem");
    expect(newest).toHaveTextContent("1.5 l · bought 12 Oct 2026");
    expect(oldest).toHaveTextContent("1 l · bought 1 Oct 2026");
  });

  it("shows a purchase without an amount as just its day", () => {
    renderShelf();
    const spices = screen.getByRole("region", { name: /^Herbs/ });
    expect(within(spices).getByText("bought 5 Oct 2026")).toBeInTheDocument();
    expect(within(spices).queryByText(/to taste/)).not.toBeInTheDocument();
  });

  it("marks the staples, and says so for one with no purchase noted", () => {
    renderShelf();
    expect(screen.getAllByText("Staple")).toHaveLength(2);
    const other = screen.getByRole("region", { name: /^Other/ });
    expect(within(other).getByText("No purchase noted. Ticking it off on the grocery list adds one.")).toBeInTheDocument();
  });

  it("says what to do when the shelf is empty", () => {
    renderShelf("en", [], []);
    expect(
      screen.getByText("Nothing on the shelf yet. Add what you have at home, or tick off a pantry staple on the grocery list."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("heading")).not.toBeInTheDocument();
  });

  it("names every Edit and Remove button by its entry, so a screen reader can tell them apart", () => {
    renderShelf();
    expect(screen.getAllByText("Edit", { selector: "summary" }).map((el) => el.getAttribute("aria-label"))).toEqual([
      "Edit Milk, 12 Oct 2026",
      "Edit Milk, 1 Oct 2026",
      "Edit Salt, 5 Oct 2026",
    ]);
    expect(screen.getByLabelText("Remove Milk, 1 Oct 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Remove Salt from the staples")).toBeInTheDocument();
  });

  it("changes an entry through its form, filled with what it has", async () => {
    const { user } = renderShelf();
    await user.click(screen.getByLabelText("Edit Milk, 12 Oct 2026"));
    const form = screen.getByLabelText("Edit Milk, 12 Oct 2026").closest("details")!.querySelector("form")!;
    const fields = within(form);
    expect(fields.getByRole("textbox", { name: /^Item/ })).toHaveValue("Milk");
    expect(fields.getByRole("textbox", { name: "Amount" })).toHaveValue("1.5");
    expect(fields.getByRole("textbox", { name: "Unit" })).toHaveValue("l");
    expect(fields.getByLabelText(/^Bought on/)).toHaveValue("2026-10-12");
    expect(fields.getByRole("combobox", { name: "Category" })).toHaveValue("DAIRY_EGGS");

    await user.clear(fields.getByRole("textbox", { name: "Amount" }));
    await user.type(fields.getByRole("textbox", { name: "Amount" }), "2");
    await user.click(fields.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(actions.updateShelfItem).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(actions.updateShelfItem.mock.calls[0][0] as FormData)).toMatchObject({
      id: "m1",
      label: "Milk",
      quantity: "2",
      unit: "l",
      boughtOn: "2026-10-12",
      category: "DAIRY_EGGS",
    });
    expect(screen.getByLabelText("Edit Milk, 12 Oct 2026")).toHaveFocus();
  });

  it("asks before it removes an entry, and sends its id", async () => {
    const { user } = renderShelf();
    await user.click(screen.getByLabelText("Remove Milk, 1 Oct 2026"));
    const question = screen.getByRole("group", { name: "Remove Milk, bought 1 Oct 2026, from the shelf?" });
    expect(actions.removeShelfItem).not.toHaveBeenCalled();
    await user.click(within(question).getByRole("button", { name: "Remove" }));

    await waitFor(() => expect(actions.removeShelfItem).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(actions.removeShelfItem.mock.calls[0][0] as FormData)).toEqual({ id: "m2" });
  });

  it("asks before it stops a staple being one, and says what stays", async () => {
    const { user } = renderShelf();
    await user.click(screen.getByLabelText("Remove olive oil from the staples"));
    const question = screen.getByRole("group", {
      name: "Stop treating olive oil as a staple? Its grocery lines show on the list again. Purchases stay on the shelf.",
    });
    await user.click(within(question).getByRole("button", { name: "Remove staple" }));

    await waitFor(() => expect(actions.removePantryStaple).toHaveBeenCalledTimes(1));
    expect(Object.fromEntries(actions.removePantryStaple.mock.calls[0][0] as FormData)).toEqual({ id: "st-oil" });
  });

  it("has no axe violations, with the edit form open too", async () => {
    const { container, user } = renderShelf();
    await expectNoAxeViolations(container);
    await user.click(screen.getByLabelText("Edit Milk, 12 Oct 2026"));
    await expectNoAxeViolations(container);
  });

  it("says it in German, with the day in German", () => {
    renderShelf("de");
    expect(screen.getByRole("heading", { level: 2, name: "Milchprodukte und Eier (1)" })).toBeInTheDocument();
    expect(screen.getAllByText("Vorratsartikel").length).toBeGreaterThan(0);
    expect(screen.getByText("gekauft am 12. Okt. 2026")).toBeInTheDocument();
    expect(screen.getByLabelText("Milk bearbeiten, 12. Okt. 2026")).toBeInTheDocument();
  });
});
