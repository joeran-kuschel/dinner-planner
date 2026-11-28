import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CategoryManager, type ManagedCategory } from "@/components/category-manager";
import { SEEDED_CATEGORIES } from "@/lib/grocery-category";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  addGroceryCategory: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  renameGroceryCategory: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  moveGroceryCategory: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  deleteGroceryCategory: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/grocery-categories", () => actions);

const sections = (changes: Record<string, Partial<ManagedCategory>> = {}): ManagedCategory[] =>
  SEEDED_CATEGORIES.map((category) => ({ ...category, ingredients: 0, entries: 0, ...changes[category.id] }));

type Props = Parameters<typeof CategoryManager>[0];

function renderManager(overrides: Partial<Props> = {}, locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  const props: Props = { categories: sections(), error: null, refusal: {}, ...overrides };
  const result = renderWithI18n(<CategoryManager {...props} />, { locale });
  const again = (next: Partial<Props>) => result.rerender(<CategoryManager {...props} {...next} />);
  return { user, props, again, ...result };
}

/** jsdom's name computation drops the space inside the visually hidden span ("Name1"); a browser keeps it (the e2e spec checks "Name 1"). */
const nameField = (n: number) => screen.getByRole("textbox", { name: new RegExp(`^Name\\s?${n}$`) });
const save = (name: string) => screen.getByRole("button", { name: new RegExp(`^Save\\s?${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
const moveUp = (name: string) => screen.getByRole("button", { name: `Move ${name} up` });
const moveDown = (name: string) => screen.getByRole("button", { name: `Move ${name} down` });
const liveRegion = () => document.querySelector<HTMLElement>("[aria-live='polite']")!;

/** The "Delete" button of a section's row (a `<summary>`, named "Delete <section>" for a screen reader) and its details. */
const deleteButton = (name: string) => screen.getByText("Delete", { selector: `summary[aria-label="Delete ${name}"]` });
/** Open a section's question and give the confirming button inside it (the closed questions of the other rows have one too). */
async function openDelete(user: ReturnType<typeof userEvent.setup>, name: string) {
  await user.click(deleteButton(name));
  return within(deleteButton(name).closest("details")!).getByRole("button", { name: "Delete category" });
}

/** What the user's browser does to a button whose row moved in the list: it loses the focus. */
const dropFocus = () => (document.activeElement as HTMLElement | null)?.blur();

beforeEach(() => {
  for (const action of Object.values(actions)) action.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("CategoryManager", () => {
  describe("the list", () => {
    it("shows every section in order, with its name in a field", () => {
      renderManager();
      const names = screen.getAllByRole("textbox", { name: /^Name\s?\d+$/ }).map((field) => (field as HTMLInputElement).value);
      expect(names).toEqual([
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
      expect(screen.getAllByRole("listitem")).toHaveLength(10);
    });

    it("numbers the fields so that each has its own accessible name", () => {
      renderManager();
      expect(nameField(1)).toHaveValue("Fruit and vegetables");
      expect(nameField(10)).toHaveValue("Other");
    });

    it("shows a name the user gave instead of the translated one", () => {
      renderManager({ categories: sections({ cat_bakery: { name: "Bread" } }) });
      expect(nameField(2)).toHaveValue("Bread");
    });

    it("shows a section the user added, which has no key", () => {
      const categories = sections();
      categories.splice(9, 0, { id: "mine", key: null, name: "Pet food", position: 9, ingredients: 0, entries: 0 });
      renderManager({ categories });
      expect(nameField(10)).toHaveValue("Pet food");
      expect(nameField(11)).toHaveValue("Other");
    });

    it("says in German what the page's language does to an unnamed section", () => {
      renderManager({}, "de");
      expect(nameField(2)).toHaveValue("Backwaren");
      expect(screen.getByRole("button", { name: "Backwaren nach oben" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Kategorie hinzufügen" })).toBeInTheDocument();
    });

    it("hints that an unnamed starting section is shown in the page's language, and that Other is where items go", () => {
      renderManager();
      expect(nameField(2)).toHaveAccessibleDescription("Shown in the page's language until you rename it.");
      expect(nameField(10)).toHaveAccessibleDescription("Where items go when their category is deleted. Always last.");
    });

    it("gives a section with a name of its own no hint", () => {
      renderManager({ categories: sections({ cat_bakery: { name: "Bread" } }) });
      expect(nameField(2)).not.toHaveAccessibleDescription();
    });

    it("limits the name field to the longest name", () => {
      renderManager();
      expect(nameField(2)).toHaveAttribute("maxlength", "40");
      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveAttribute("maxlength", "40");
    });
  });

  describe("the buttons that cannot work", () => {
    it("disables moving the first section up, and nothing else of it", () => {
      renderManager();
      expect(moveUp("Fruit and vegetables")).toBeDisabled();
      expect(moveDown("Fruit and vegetables")).toBeEnabled();
    });

    it("disables moving the section before Other down, so nothing goes past Other", () => {
      renderManager();
      expect(moveDown("Drinks")).toBeDisabled();
      expect(moveUp("Drinks")).toBeEnabled();
    });

    it("lets a section in the middle move both ways", () => {
      renderManager();
      expect(moveUp("Pantry")).toBeEnabled();
      expect(moveDown("Pantry")).toBeEnabled();
    });

    it("moves Other nowhere", () => {
      renderManager();
      expect(moveUp("Other")).toBeDisabled();
      expect(moveDown("Other")).toBeDisabled();
    });

    it("cannot delete Other: its button is disabled and no question opens", async () => {
      const { user } = renderManager();
      const remove = screen.getByRole("button", { name: "Delete Other" });
      expect(remove).toBeDisabled();
      await user.click(remove);
      expect(remove.closest("details")).toBeNull();
      expect(screen.getAllByRole("button", { name: "Delete category" })).toHaveLength(9);
    });

    it("lets every other section be deleted", () => {
      renderManager();
      expect(screen.getAllByText("Delete", { selector: "summary" })).toHaveLength(9);
    });

    it("keeps the single section before Other from moving at all when it is the only one", () => {
      const categories = [sections()[0], { ...sections()[9], position: 1 }];
      renderManager({ categories });
      expect(moveUp("Fruit and vegetables")).toBeDisabled();
      expect(moveDown("Fruit and vegetables")).toBeDisabled();
    });
  });

  describe("naming the buttons by the section", () => {
    it("names every button of a row after the section, so a list of buttons can be told apart", () => {
      renderManager();
      expect(save("Pantry")).toBeInTheDocument();
      expect(moveUp("Pantry")).toBeInTheDocument();
      expect(moveDown("Pantry")).toBeInTheDocument();
      // The delete button reads "Delete" and is named "Delete Pantry" for a screen reader (`accessibleLabel`).
      expect(screen.getByRole("group", { hidden: true, name: /^Delete Pantry\?/ })).toBeInTheDocument();
      expect(screen.getAllByText("Delete", { selector: "summary" })[5]).toHaveAttribute("aria-label", "Delete Pantry");
    });

    it("names them after the new name once a section is renamed", () => {
      renderManager({ categories: sections({ cat_pantry: { name: "Cupboard" } }) });
      expect(save("Cupboard")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Save Pantry" })).not.toBeInTheDocument();
    });
  });

  describe("posting through the form attribute", () => {
    it("posts a rename with the section's id and the typed name, the field being outside the form", async () => {
      const { user } = renderManager();
      const field = nameField(6);
      expect(field.closest("form")).toBeNull();
      expect((field as HTMLInputElement).form).toBe(document.getElementById("rename-cat_pantry"));

      await user.clear(field);
      await user.type(field, "Cupboard");
      await user.click(save("Pantry"));

      await waitFor(() => expect(actions.renameGroceryCategory).toHaveBeenCalledTimes(1));
      const data = actions.renameGroceryCategory.mock.calls[0][0];
      expect(data.get("id")).toBe("cat_pantry");
      expect(data.get("name")).toBe("Cupboard");
    });

    it("posts Enter in the name field as a rename of that section", async () => {
      const { user } = renderManager();
      const field = nameField(2);
      await user.clear(field);
      await user.type(field, "Bread{Enter}");

      await waitFor(() => expect(actions.renameGroceryCategory).toHaveBeenCalledTimes(1));
      expect(actions.renameGroceryCategory.mock.calls[0][0].get("id")).toBe("cat_bakery");
      expect(actions.renameGroceryCategory.mock.calls[0][0].get("name")).toBe("Bread");
      expect(actions.moveGroceryCategory).not.toHaveBeenCalled();
    });

    it("posts an emptied field as it is, so the server can put the translated name back", async () => {
      const { user } = renderManager();
      await user.clear(nameField(6));
      await user.click(save("Pantry"));
      await waitFor(() => expect(actions.renameGroceryCategory).toHaveBeenCalled());
      expect(actions.renameGroceryCategory.mock.calls[0][0].get("name")).toBe("");
    });

    it.each([
      ["up", "Move Pantry up"],
      ["down", "Move Pantry down"],
    ])("posts a move %s with the section's id and the direction", async (direction, label) => {
      const { user } = renderManager();
      await user.click(screen.getByRole("button", { name: label }));

      await waitFor(() => expect(actions.moveGroceryCategory).toHaveBeenCalledTimes(1));
      const data = actions.moveGroceryCategory.mock.calls[0][0];
      expect(data.get("id")).toBe("cat_pantry");
      expect(data.get("direction")).toBe(direction);
      expect(actions.renameGroceryCategory).not.toHaveBeenCalled();
    });

    it("posts a new section with the typed name", async () => {
      const { user } = renderManager();
      await user.type(screen.getByRole("textbox", { name: "Add a category" }), "Pet food");
      await user.click(screen.getByRole("button", { name: "Add category" }));

      await waitFor(() => expect(actions.addGroceryCategory).toHaveBeenCalledTimes(1));
      expect(actions.addGroceryCategory.mock.calls[0][0].get("name")).toBe("Pet food");
    });

    it("posts Enter in the add field as an add", async () => {
      const { user } = renderManager();
      await user.type(screen.getByRole("textbox", { name: "Add a category" }), "Baby{Enter}");
      await waitFor(() => expect(actions.addGroceryCategory).toHaveBeenCalledTimes(1));
      expect(actions.renameGroceryCategory).not.toHaveBeenCalled();
    });

    it("suggests what a name could look like", () => {
      renderManager();
      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveAttribute("placeholder", "Pet food");
    });
  });

  describe("refusals", () => {
    it("shows no alert without an error", () => {
      renderManager();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it.each([
      ["empty", "Give the category a name."],
      ["long", "A name can have at most 40 characters."],
      ["duplicate", "There is already a category with that name."],
      ["limit", "You can have at most 30 categories."],
    ] as const)("says %s in an alert", (error, text) => {
      renderManager({ error });
      expect(screen.getByRole("alert")).toHaveTextContent(text);
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });

    it.each([
      ["empty", "Gib der Kategorie einen Namen."],
      ["long", "Ein Name darf höchstens 40 Zeichen lang sein."],
      ["duplicate", "Es gibt schon eine Kategorie mit diesem Namen."],
      ["limit", "Du kannst höchstens 30 Kategorien haben."],
    ] as const)("says %s in German", (error, text) => {
      renderManager({ error }, "de");
      expect(screen.getByRole("alert")).toHaveTextContent(text);
    });

    it("puts the typed name back in the add field after a refusal of an add", () => {
      renderManager({ error: "duplicate", refusal: { name: "Bakery", nonce: "1" } });
      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveValue("Bakery");
      expect(nameField(2)).toHaveValue("Bakery"); // its own, unchanged
    });

    it("puts the typed name back in the field of the section it was for, and no other", () => {
      renderManager({ error: "duplicate", refusal: { id: "cat_pantry", name: "Bakery", nonce: "1" } });
      expect(nameField(6)).toHaveValue("Bakery");
      expect(nameField(5)).toHaveValue("Pasta, rice, etc.");
      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveValue("");
    });

    it("leaves the section's field as it is for a refusal without a typed name (an emptied section the user added)", () => {
      renderManager({ error: "empty", refusal: { id: "cat_pantry", nonce: "1" } });
      expect(nameField(6)).toHaveValue("Pantry");
      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveValue("");
    });

    it("leaves every field alone when the address has a name but no error", () => {
      renderManager({ error: null, refusal: { id: "cat_pantry", name: "Stale", nonce: "1" } });
      expect(nameField(6)).toHaveValue("Pantry");
      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveValue("");
    });

    it("starts the alert and the fields over for a new refusal with the same error", () => {
      const { again } = renderManager({ error: "duplicate", refusal: { name: "Bakery", nonce: "1" } });
      const first = screen.getByRole("alert");
      again({ error: "duplicate", refusal: { name: "Pantry", nonce: "2" } });
      expect(screen.getByRole("alert")).not.toBe(first);
      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveValue("Pantry");
    });
  });

  describe("the question before a delete", () => {
    const question = (text: string | RegExp) => screen.getByRole("group", { hidden: true, name: text });

    it("says nothing is filed under an empty section", () => {
      renderManager();
      expect(question("Delete Bakery? Nothing is filed under it.")).toBeInTheDocument();
    });

    it.each([
      [1, 1, "Delete Bakery? Its 1 ingredient and 1 list entry move to Other."],
      [2, 1, "Delete Bakery? Its 2 ingredients and 1 list entry move to Other."],
      [1, 3, "Delete Bakery? Its 1 ingredient and 3 list entries move to Other."],
      [0, 2, "Delete Bakery? Its 0 ingredients and 2 list entries move to Other."],
      [5, 0, "Delete Bakery? Its 5 ingredients and 0 list entries move to Other."],
    ])("counts %i ingredients and %i list entries in English", (ingredients, entries, text) => {
      renderManager({ categories: sections({ cat_bakery: { ingredients, entries } }) });
      expect(question(text)).toBeInTheDocument();
    });

    it.each([
      [0, 0, "Backwaren löschen? Darunter ist nichts einsortiert."],
      [1, 1, "Backwaren löschen? 1 Zutat und 1 Listeneintrag wandern nach Sonstiges."],
      [2, 3, "Backwaren löschen? 2 Zutaten und 3 Listeneinträge wandern nach Sonstiges."],
    ])("counts %i ingredients and %i list entries in German", (ingredients, entries, text) => {
      renderManager({ categories: sections({ cat_bakery: { ingredients, entries } }) }, "de");
      expect(question(text)).toBeInTheDocument();
    });

    it("names the section Other goes by now as the place the items move to", () => {
      renderManager({ categories: sections({ cat_bakery: { ingredients: 1 }, cat_other: { name: "Miscellaneous" } }) });
      expect(question("Delete Bakery? Its 1 ingredient and 0 list entries move to Miscellaneous.")).toBeInTheDocument();
    });

    it("opens from a button that is named after the section and asks before it deletes", async () => {
      const { user } = renderManager();
      const confirm = await openDelete(user, "Bakery");
      expect(actions.deleteGroceryCategory).not.toHaveBeenCalled();
      await user.click(confirm);

      await waitFor(() => expect(actions.deleteGroceryCategory).toHaveBeenCalledTimes(1));
      expect(actions.deleteGroceryCategory.mock.calls[0][0].get("id")).toBe("cat_bakery");
    });
  });

  describe("after a move", () => {
    const swapped = (first: string, second: string) => {
      const list = sections();
      const a = list.findIndex((category) => category.id === first);
      const b = list.findIndex((category) => category.id === second);
      [list[a], list[b]] = [list[b], list[a]];
      return list;
    };

    it("keeps the keyboard focus on the button that moved the section, and says where the section is now", async () => {
      const { user, again } = renderManager();
      await user.click(moveUp("Pantry"));
      dropFocus();

      again({ categories: swapped("cat_pasta_rice", "cat_pantry") });

      expect(moveUp("Pantry")).toHaveFocus();
      expect(liveRegion()).toHaveTextContent("Pantry moved to position 5 of 10");
    });

    it("keeps the focus on the down button of a section moved down", async () => {
      const { user, again } = renderManager();
      await user.click(moveDown("Bakery"));
      dropFocus();

      again({ categories: swapped("cat_bakery", "cat_meat_fish") });

      expect(moveDown("Bakery")).toHaveFocus();
      expect(liveRegion()).toHaveTextContent("Bakery moved to position 3 of 10");
    });

    it("moves the focus to the other button when the section reached an end of the list and its button is off", async () => {
      const { user, again } = renderManager();
      await user.click(moveUp("Bakery"));
      dropFocus();

      again({ categories: swapped("cat_produce", "cat_bakery") });

      expect(moveUp("Bakery")).toBeDisabled();
      expect(moveDown("Bakery")).toHaveFocus();
      expect(liveRegion()).toHaveTextContent("Bakery moved to position 1 of 10");
    });

    it("does the same at the other end, before Other", async () => {
      const { user, again } = renderManager();
      await user.click(moveDown("Frozen"));
      dropFocus();

      again({ categories: swapped("cat_frozen", "cat_drinks") });

      expect(moveDown("Frozen")).toBeDisabled();
      expect(moveUp("Frozen")).toHaveFocus();
    });

    it("says the position in German", async () => {
      const { user, again } = renderManager({}, "de");
      await user.click(screen.getByRole("button", { name: "Vorräte nach oben" }));
      dropFocus();

      again({ categories: swapped("cat_pasta_rice", "cat_pantry") });

      expect(liveRegion()).toHaveTextContent("Vorräte steht jetzt an Position 5 von 10");
    });

    it("says nothing and takes no focus when the order changes with no move of this page's (another tab, a refresh)", () => {
      const { again } = renderManager();
      again({ categories: swapped("cat_pasta_rice", "cat_pantry") });
      expect(liveRegion()).toBeEmptyDOMElement();
      expect(document.body).toHaveFocus();
    });

    it("ignores a move that is older than five seconds: a move that changed nothing must not steal the focus later", async () => {
      const { user, again } = renderManager();
      const now = Date.now();
      await user.click(moveUp("Pantry")); // the page was stale: nothing moved, the mark stays behind
      vi.spyOn(Date, "now").mockReturnValue(now + 6000);
      screen.getByRole("textbox", { name: "Add a category" }).focus();

      again({ categories: swapped("cat_herbs_spices", "cat_frozen") });

      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveFocus();
      expect(liveRegion()).toBeEmptyDOMElement();
    });

    it("still counts a move that is just under five seconds old", async () => {
      const { user, again } = renderManager();
      const now = Date.now();
      await user.click(moveUp("Pantry"));
      dropFocus();
      vi.spyOn(Date, "now").mockReturnValue(now + 4900);

      again({ categories: swapped("cat_pasta_rice", "cat_pantry") });

      expect(moveUp("Pantry")).toHaveFocus();
    });

    it("uses a mark only once: a second reorder without a click takes no focus", async () => {
      const { user, again } = renderManager();
      await user.click(moveUp("Pantry"));
      dropFocus();
      again({ categories: swapped("cat_pasta_rice", "cat_pantry") });
      expect(moveUp("Pantry")).toHaveFocus();

      screen.getByRole("textbox", { name: "Add a category" }).focus();
      again({ categories: sections() });

      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveFocus();
    });

    it("does not touch the focus when the section it was for is gone", async () => {
      const { user, again } = renderManager();
      await user.click(moveUp("Pantry"));
      dropFocus();
      again({ categories: sections().filter((category) => category.id !== "cat_pantry") });
      expect(document.body).toHaveFocus();
    });
  });

  describe("after a delete", () => {
    it("says which section was deleted", () => {
      const { again } = renderManager();
      again({ categories: sections().filter((category) => category.id !== "cat_bakery") });
      expect(liveRegion()).toHaveTextContent("Bakery deleted");
    });

    it("says it in German, by the name the section had", () => {
      const { again } = renderManager({}, "de");
      again({ categories: sections().filter((category) => category.id !== "cat_bakery") });
      expect(liveRegion()).toHaveTextContent("Backwaren gelöscht");
    });

    it("says the name the user had given it", () => {
      const { again } = renderManager({ categories: sections({ cat_bakery: { name: "Bread" } }) });
      again({ categories: sections().filter((category) => category.id !== "cat_bakery") });
      expect(liveRegion()).toHaveTextContent("Bread deleted");
    });

    it("says nothing when a section is added", () => {
      const { again } = renderManager();
      const categories = sections();
      categories.splice(9, 0, { id: "mine", key: null, name: "Pet food", position: 9, ingredients: 0, entries: 0 });
      again({ categories });
      expect(liveRegion()).toBeEmptyDOMElement();
    });

    it("hands the focus to the add field once the confirmed delete takes the row away", async () => {
      const { user, again } = renderManager();
      await user.click(await openDelete(user, "Bakery"));
      await waitFor(() => expect(actions.deleteGroceryCategory).toHaveBeenCalled());

      again({ categories: sections().filter((category) => category.id !== "cat_bakery") });

      expect(screen.getByRole("textbox", { name: "Add a category" })).toHaveFocus();
      expect(liveRegion()).toHaveTextContent("Bakery deleted");
    });

    it("leaves the focus alone when the question was cancelled", async () => {
      const { user, again } = renderManager();
      await openDelete(user, "Bakery");
      await user.click(within(deleteButton("Bakery").closest("details")!).getByRole("button", { name: "Cancel" }));
      again({ categories: sections().filter((category) => category.id !== "cat_bakery") });
      expect(screen.getByRole("textbox", { name: "Add a category" })).not.toHaveFocus();
    });
  });

  it("has no accessibility violations, plain or with a refusal and an open question", async () => {
    const { container, user, again } = renderManager({ categories: sections({ cat_bakery: { ingredients: 2, entries: 1 } }) });
    await expectNoAxeViolations(container);

    again({ error: "duplicate", refusal: { id: "cat_pantry", name: "Bakery", nonce: "1" } });
    await openDelete(user, "Bakery");
    await expectNoAxeViolations(container);
  });

  it("has no accessibility violations in German", async () => {
    const { container } = renderManager({ error: "empty" }, "de");
    await expectNoAxeViolations(container);
  });
});
