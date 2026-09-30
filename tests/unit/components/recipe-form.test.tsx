import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_RECIPE_FORM_STATE, type RecipeFormState, type RecipeFormValues } from "@/lib/recipe-form";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";
import { RecipeForm, type RecipeFormProps } from "@/components/recipe-form";

type Action = RecipeFormProps["action"];
type Recipe = NonNullable<RecipeFormProps["recipe"]>;

const RISOTTO: Recipe = {
  id: "r-risotto",
  name: "Mushroom risotto",
  description: "Creamy and slow",
  servings: 4,
  prepMinutes: 40,
  sourceUrl: "https://example.com/risotto",
  instructions: "Soften the onion\nToast the rice",
  tags: ["vegetarian", "italian"],
  ingredients: [
    { name: "Arborio rice", quantity: 300, unit: "g", category: "PANTRY" },
    { name: "Salt", quantity: null, unit: null, category: "OTHER" },
  ],
};

const REJECTED_VALUES: RecipeFormValues = {
  name: "",
  description: "Still typing",
  servings: "3",
  prepMinutes: "25",
  sourceUrl: "https://example.com/soup",
  instructions: "Chop\nSimmer",
  photoAlt: "",
  tags: ["soup", "quick"],
  ingredients: [
    { name: "Leek", quantity: "2", unit: "", category: "PRODUCE" },
    { name: "Stock", quantity: "1,5", unit: "l", category: "PANTRY" },
  ],
};

// The same messages the recipe actions return.
const NAME_MISSING = msg`Give the recipe a name.`;
const SOURCE_INVALID = msg`The source has to be a web address starting with http:// or https://.`;

/** An action that rejects with the given message and echoes `values`. */
function rejectingAction(error: MessageDescriptor, values: RecipeFormValues = REJECTED_VALUES) {
  return vi.fn<Action>(async (prev) => ({ error, values, attempt: prev.attempt + 1 }));
}

function renderForm(action: Action = vi.fn<Action>(async (prev) => prev), recipe?: Recipe) {
  const user = userEvent.setup();
  const result = renderWithI18n(<RecipeForm action={action} recipe={recipe} />);
  return { user, ...result };
}

// A required field's label also holds the visible "*", which is hidden from assistive technology.
const withoutMark = (text: string) => text.replace(/\s*\*$/, "").trim();
const field = (label: string) => screen.getByLabelText(label, { normalizer: withoutMark });
const rowCount = () => screen.getAllByRole("textbox", { name: /^Name of ingredient/ }).length;
const ingredientRow = (n: number) =>
  [`Amount for ingredient ${n}`, `Unit for ingredient ${n}`, `Name of ingredient ${n}`].map(
    (label) => (screen.getByRole("textbox", { name: label }) as HTMLInputElement).value,
  );
const submittedData = (action: ReturnType<typeof vi.fn<Action>>) => action.mock.calls.at(-1)![1];

describe("RecipeForm", () => {
  describe("create mode", () => {
    it("starts empty with two servings and three blank ingredient rows", () => {
      renderForm();
      expect(field("Name")).toHaveValue("");
      expect(field("Name")).toBeRequired();
      expect(field("Description")).toHaveValue("");
      expect(field("Serves")).toHaveValue(2);
      expect(field("Minutes")).toHaveValue(null);
      expect(field("Source")).toHaveValue("");
      expect(field("Method")).toHaveValue("");
      expect(rowCount()).toBe(3);
      expect(ingredientRow(1)).toEqual(["", "", ""]);
    });

    it("offers 'Create recipe' and cancels back to the recipe list", () => {
      renderForm();
      expect(screen.getByRole("button", { name: "Create recipe" })).toBeEnabled();
      expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/recipes");
    });

    it("gives number and URL fields their input types and ranges", () => {
      renderForm();
      expect(field("Serves")).toHaveAttribute("type", "number");
      expect(field("Serves")).toHaveAttribute("min", "1");
      expect(field("Serves")).toHaveAttribute("max", "99");
      expect(field("Minutes")).toHaveAttribute("min", "1");
      expect(field("Minutes")).toHaveAttribute("max", "1440");
      expect(field("Source")).toHaveAttribute("type", "url");
      expect(screen.getByRole("textbox", { name: "Amount for ingredient 1" })).toHaveAttribute("inputmode", "decimal");
    });

    it("submits every field and the ingredient rows as parallel lists, without an id", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action);

      await user.type(field("Name"), "Leek soup");
      await user.type(field("Description"), "Quick");
      await user.clear(field("Serves"));
      await user.type(field("Serves"), "3");
      await user.type(field("Minutes"), "25");
      await user.type(field("Source"), "https://example.com/soup");
      await user.type(field("Method"), "Chop{Enter}Simmer");
      await user.type(screen.getByRole("textbox", { name: "Amount for ingredient 1" }), "2");
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 1" }), "Leek");
      await user.type(screen.getByRole("textbox", { name: "Amount for ingredient 2" }), "1,5");
      await user.type(screen.getByRole("textbox", { name: "Unit for ingredient 2" }), "l");
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 2" }), "Stock");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      const [prev, data] = action.mock.calls[0];
      expect(prev).toEqual(EMPTY_RECIPE_FORM_STATE);
      expect(data.has("id")).toBe(false);
      expect(data.get("name")).toBe("Leek soup");
      expect(data.get("description")).toBe("Quick");
      expect(data.get("servings")).toBe("3");
      expect(data.get("prepMinutes")).toBe("25");
      expect(data.get("sourceUrl")).toBe("https://example.com/soup");
      expect(data.get("instructions")).toBe("Chop\nSimmer");
      expect(data.getAll("ingredientQuantity")).toEqual(["2", "1,5", ""]);
      expect(data.getAll("ingredientUnit")).toEqual(["", "l", ""]);
      expect(data.getAll("ingredientName")).toEqual(["Leek", "Stock", ""]);
    });

    it("does not submit without a name", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action);
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      expect(field("Name")).toBeInvalid();
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("edit mode", () => {
    it("fills the fields and rows from the recipe", () => {
      renderForm(undefined, RISOTTO);
      expect(field("Name")).toHaveValue("Mushroom risotto");
      expect(field("Description")).toHaveValue("Creamy and slow");
      expect(field("Serves")).toHaveValue(4);
      expect(field("Minutes")).toHaveValue(40);
      expect(field("Source")).toHaveValue("https://example.com/risotto");
      expect(field("Method")).toHaveValue("Soften the onion\nToast the rice");
      expect(rowCount()).toBe(2);
      expect(ingredientRow(1)).toEqual(["300", "g", "Arborio rice"]);
      expect(ingredientRow(2)).toEqual(["", "", "Salt"]);
    });

    it("shows empty optional fields as blank", () => {
      renderForm(undefined, {
        ...RISOTTO,
        description: null,
        prepMinutes: null,
        sourceUrl: null,
        instructions: null,
      });
      expect(field("Description")).toHaveValue("");
      expect(field("Minutes")).toHaveValue(null);
      expect(field("Source")).toHaveValue("");
      expect(field("Method")).toHaveValue("");
    });

    it("offers three blank rows for a recipe without ingredients", () => {
      renderForm(undefined, { ...RISOTTO, ingredients: [] });
      expect(rowCount()).toBe(3);
      expect(ingredientRow(3)).toEqual(["", "", ""]);
    });

    it("offers 'Save changes' and cancels back to the recipe", () => {
      renderForm(undefined, RISOTTO);
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Create recipe" })).not.toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Cancel" })).toHaveAttribute("href", "/recipes/r-risotto");
    });

    it("submits the recipe id with the edited values", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action, RISOTTO);
      await user.clear(field("Name"));
      await user.type(field("Name"), "Risotto verde");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      const data = submittedData(action);
      expect(data.get("id")).toBe("r-risotto");
      expect(data.get("name")).toBe("Risotto verde");
      expect(data.getAll("ingredientName")).toEqual(["Arborio rice", "Salt"]);
      expect(data.getAll("ingredientQuantity")).toEqual(["300", ""]);
    });
  });

  describe("tags", () => {
    const chips = () => within(screen.getByRole("list", { name: "Tags of this recipe" })).getAllByRole("listitem").map((item) => item.textContent?.replace("✕", ""));

    it("starts without tags for a new recipe", () => {
      renderForm();
      expect(screen.getByRole("combobox", { name: "Tags" })).toHaveValue("");
      expect(screen.queryByRole("list", { name: "Tags of this recipe" })).not.toBeInTheDocument();
    });

    it("shows a recipe's tags when editing", () => {
      renderForm(undefined, RISOTTO);
      const list = screen.getByRole("list", { name: "Tags of this recipe" });
      expect(within(list).getAllByRole("listitem").map((item) => item.textContent?.replace("✕", ""))).toEqual([
        "vegetarian",
        "italian",
      ]);
    });

    it("offers the tags in use while typing", () => {
      const { container } = renderWithI18n(
        <RecipeForm action={vi.fn<Action>(async (prev) => prev)} tagSuggestions={["pasta", "vegan"]} />,
      );
      expect([...container.querySelectorAll("datalist option")].map((o) => (o as HTMLOptionElement).value)).toEqual(["pasta", "vegan"]);
    });

    it("posts the chips and the text still in the field", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action, RISOTTO);
      await user.type(screen.getByRole("combobox", { name: "Tags" }), "spicy");
      await user.click(screen.getByRole("button", { name: "Remove tag italian" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(action).toHaveBeenCalled());
      expect(submittedData(action).getAll("tag")).toEqual(["vegetarian"]);
      expect(submittedData(action).get("tags")).toBe("spicy");
    });

    it("does not send the form when Enter adds a tag", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action);
      await user.type(screen.getByRole("combobox", { name: "Tags" }), "quick{Enter}");
      expect(action).not.toHaveBeenCalled();
      expect(chips()).toContain("quick");
    });

    it("keeps the tags after a rejection", async () => {
      const { user } = renderForm(rejectingAction(NAME_MISSING, REJECTED_VALUES));
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");

      const list = screen.getByRole("list", { name: "Tags of this recipe" });
      expect(within(list).getAllByRole("listitem").map((item) => item.textContent?.replace("✕", ""))).toEqual(["soup", "quick"]);
    });
  });

  describe("ingredient categories", () => {
    const category = (n: number) => screen.getByRole("combobox", { name: `Category for ingredient ${n}` });

    it("files a new ingredient under Other", () => {
      renderForm();
      expect(category(1)).toHaveValue("OTHER");
    });

    it("offers every category, Other last", () => {
      renderForm();
      expect(within(category(1)).getAllByRole("option").map((option) => option.textContent)).toEqual([
        "Fruit and vegetables",
        "Bakery",
        "Meat and fish",
        "Dairy and eggs",
        "Pantry",
        "Frozen",
        "Drinks",
        "Other",
      ]);
    });

    it("shows the saved category of each ingredient", () => {
      renderForm(undefined, RISOTTO);
      expect(category(1)).toHaveValue("PANTRY");
      expect(category(2)).toHaveValue("OTHER");
    });

    it("posts the chosen category with each row", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action, RISOTTO);
      await user.selectOptions(category(2), "PRODUCE");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(action).toHaveBeenCalled());
      expect(submittedData(action).getAll("ingredientCategory")).toEqual(["PANTRY", "PRODUCE"]);
    });

    it("keeps the chosen categories after a rejection", async () => {
      const { user } = renderForm(rejectingAction(NAME_MISSING, REJECTED_VALUES));
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");

      expect(category(1)).toHaveValue("PRODUCE");
      expect(category(2)).toHaveValue("PANTRY");
    });

    it("is named in German", () => {
      renderWithI18n(<RecipeForm action={vi.fn<Action>(async (prev) => prev)} />, { locale: "de" });
      expect(screen.getByRole("combobox", { name: "Kategorie für Zutat 1" })).toHaveValue("OTHER");
      expect(within(screen.getByRole("combobox", { name: "Kategorie für Zutat 1" })).getByRole("option", { name: "Obst und Gemüse" })).toBeInTheDocument();
    });
  });

  describe("ingredient rows", () => {
    it("adds a blank row at the end", async () => {
      const { user } = renderForm(undefined, RISOTTO);
      await user.click(screen.getByRole("button", { name: "Add ingredient" }));

      expect(rowCount()).toBe(3);
      expect(ingredientRow(3)).toEqual(["", "", ""]);
      expect(ingredientRow(2)).toEqual(["", "", "Salt"]);
    });

    it("removes the chosen row and keeps what was typed in the others", async () => {
      const { user } = renderForm();
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 1" }), "Leek");
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 2" }), "Stock");
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 3" }), "Pepper");

      await user.click(screen.getByRole("button", { name: "Remove ingredient 2" }));

      expect(rowCount()).toBe(2);
      expect(ingredientRow(1)).toEqual(["", "", "Leek"]);
      expect(ingredientRow(2)).toEqual(["", "", "Pepper"]);
      expect(screen.queryByRole("button", { name: "Remove ingredient 3" })).not.toBeInTheDocument();
    });

    it("renumbers the labels after a removal", async () => {
      const { user } = renderForm(undefined, RISOTTO);
      await user.click(screen.getByRole("button", { name: "Remove ingredient 1" }));

      expect(ingredientRow(1)).toEqual(["", "", "Salt"]);
      expect(screen.getByRole("button", { name: "Remove ingredient 1" })).toBeInTheDocument();
    });

    it("keeps the last row, so there is always one to fill in", async () => {
      const { user } = renderForm(undefined, { ...RISOTTO, ingredients: [RISOTTO.ingredients[0]] });
      await user.click(screen.getByRole("button", { name: "Remove ingredient 1" }));

      expect(rowCount()).toBe(1);
      expect(ingredientRow(1)).toEqual(["300", "g", "Arborio rice"]);
    });

    it("submits added rows and leaves out removed ones", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action, RISOTTO);
      await user.click(screen.getByRole("button", { name: "Remove ingredient 1" }));
      await user.click(screen.getByRole("button", { name: "Add ingredient" }));
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 2" }), "Parmesan");
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(submittedData(action).getAll("ingredientName")).toEqual(["Salt", "Parmesan"]);
    });

    it("does not submit the form when adding or removing rows", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action, RISOTTO);
      await user.click(screen.getByRole("button", { name: "Add ingredient" }));
      await user.click(screen.getByRole("button", { name: "Remove ingredient 3" }));
      expect(action).not.toHaveBeenCalled();
    });
  });

  describe("validation error", () => {
    it("announces the error in an alert", async () => {
      const action = rejectingAction(NAME_MISSING);
      const { user } = renderForm(action);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      await user.type(field("Name"), "   ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Give the recipe a name.");
    });

    it("refills every field and row from the values the action echoed", async () => {
      const action = rejectingAction(NAME_MISSING);
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");

      expect(field("Name")).toHaveValue("");
      expect(field("Description")).toHaveValue("Still typing");
      expect(field("Serves")).toHaveValue(3);
      expect(field("Minutes")).toHaveValue(25);
      expect(field("Source")).toHaveValue("https://example.com/soup");
      expect(field("Method")).toHaveValue("Chop\nSimmer");
      expect(rowCount()).toBe(2);
      expect(ingredientRow(1)).toEqual(["2", "", "Leek"]);
      expect(ingredientRow(2)).toEqual(["1,5", "l", "Stock"]);
    });

    it("keeps what the user typed after a rejection, as the action echoes it", async () => {
      // A real action echoes the submission; build the echo from the FormData.
      const action = vi.fn<Action>(async (prev, data) => ({
        error: NAME_MISSING,
        attempt: prev.attempt + 1,
        values: {
          name: String(data.get("name")),
          description: String(data.get("description")),
          servings: String(data.get("servings")),
          prepMinutes: String(data.get("prepMinutes")),
          sourceUrl: String(data.get("sourceUrl")),
          instructions: String(data.get("instructions")),
          photoAlt: String(data.get("photoAlt")),
          tags: data.getAll("tag").map(String),
          ingredients: data.getAll("ingredientName").map((name, i) => ({
            name: String(name),
            quantity: String(data.getAll("ingredientQuantity")[i]),
            unit: String(data.getAll("ingredientUnit")[i]),
            category: String(data.getAll("ingredientCategory")[i]),
          })),
        },
      }));
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.type(field("Description"), "Keep me");
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 2" }), "Leek");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");

      expect(field("Description")).toHaveValue("Keep me");
      expect(rowCount()).toBe(3);
      expect(ingredientRow(2)).toEqual(["", "", "Leek"]);
    });

    it("re-applies the echoed values on every rejected attempt", async () => {
      const action = rejectingAction(NAME_MISSING);
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");

      // The user changes things, then the same echo comes back on attempt 2.
      await user.clear(field("Description"));
      await user.type(field("Description"), "Changed");
      await user.click(screen.getByRole("button", { name: "Add ingredient" }));
      expect(rowCount()).toBe(3);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(2));
      expect(action.mock.calls[1][0].attempt).toBe(1);
      await waitFor(() => expect(rowCount()).toBe(2));
      expect(field("Description")).toHaveValue("Still typing");
    });

    it("replaces the alert text when the next attempt fails differently", async () => {
      const action = vi
        .fn<Action>()
        .mockImplementationOnce(async (prev) => ({ error: NAME_MISSING, values: REJECTED_VALUES, attempt: prev.attempt + 1 }))
        .mockImplementationOnce(async (prev) => ({ error: SOURCE_INVALID, values: REJECTED_VALUES, attempt: prev.attempt + 1 }));
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Give the recipe a name.");

      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The source has to be a web address"));
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });

    it("can add and remove rows after a rejection without mixing them up", async () => {
      const action = rejectingAction(NAME_MISSING);
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");

      await user.click(screen.getByRole("button", { name: "Add ingredient" }));
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 3" }), "Cream");
      await user.click(screen.getByRole("button", { name: "Remove ingredient 1" }));

      expect(rowCount()).toBe(2);
      expect(ingredientRow(1)).toEqual(["1,5", "l", "Stock"]);
      expect(ingredientRow(2)).toEqual(["", "", "Cream"]);
    });

    it("adds a separate row after a rejection that echoed no ingredients", async () => {
      const action = rejectingAction(NAME_MISSING, { ...REJECTED_VALUES, ingredients: [] });
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");
      expect(rowCount()).toBe(1);

      await user.click(screen.getByRole("button", { name: "Add ingredient" }));
      await user.type(screen.getByRole("textbox", { name: "Name of ingredient 1" }), "Leek");
      await user.click(screen.getByRole("button", { name: "Remove ingredient 2" }));

      expect(rowCount()).toBe(1);
      expect(ingredientRow(1)).toEqual(["", "", "Leek"]);
    });

    it("keeps the recipe id and edit mode after a rejected edit", async () => {
      const action = rejectingAction(NAME_MISSING);
      const { user } = renderForm(action, RISOTTO);
      await user.clear(field("Name"));
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Save changes" }));
      await screen.findByRole("alert");

      expect(submittedData(action).get("id")).toBe("r-risotto");
      expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();
      expect(field("Description")).toHaveValue("Still typing");
    });
  });

  describe("pending state", () => {
    it("disables the submit button and says 'Saving…' until the action settles", async () => {
      let settle!: (state: RecipeFormState) => void;
      const action = vi.fn<Action>(() => new Promise<RecipeFormState>((resolve) => (settle = resolve)));
      const { user } = renderForm(action);
      await user.type(field("Name"), "Leek soup");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      const button = await screen.findByRole("button", { name: "Saving…" });
      expect(button).toBeDisabled();

      settle({ error: NAME_MISSING, values: REJECTED_VALUES, attempt: 1 });
      expect(await screen.findByRole("button", { name: "Create recipe" })).toBeEnabled();
    });
  });

  describe("photo", () => {
    const WITH_PHOTO: Recipe = { ...RISOTTO, photo: { alt: "A plate of risotto", version: 1_700_000_000_000 } };

    it("offers a file field for JPEG, PNG and WebP, and a description, for a new recipe", () => {
      renderForm();
      const file = field("Photo file");
      expect(file).toHaveAttribute("type", "file");
      expect(file).toHaveAttribute("name", "photo");
      expect(file).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
      expect(field("Description of the photo")).toHaveAttribute("name", "photoAlt");
      expect(field("Description of the photo")).toHaveValue("");
    });

    it("says what is accepted, linked to the file field", () => {
      renderForm();
      const hint = screen.getByText("JPEG, PNG or WebP, up to 5 MB.");
      expect(field("Photo file")).toHaveAccessibleDescription(hint.textContent!);
    });

    it("explains why every photo needs a description, linked to its field", () => {
      renderForm();
      expect(field("Description of the photo")).toHaveAccessibleDescription(
        "Say what it shows, for people who cannot see it. Needed for every photo.",
      );
    });

    it("limits the description's length in the field", () => {
      renderForm();
      expect(field("Description of the photo")).toHaveAttribute("maxlength", "200");
    });

    it("shows no current photo and no way to remove one for a recipe without a photo", () => {
      renderForm(undefined, RISOTTO);
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.queryByRole("checkbox", { name: "Remove photo" })).not.toBeInTheDocument();
      expect(field("Photo file")).toBeInTheDocument();
    });

    it("shows the current photo by its versioned thumbnail address, with its description", () => {
      renderForm(undefined, WITH_PHOTO);
      const image = screen.getByRole("img", { name: "A plate of risotto" });
      expect(image).toHaveAttribute("src", "/recipes/r-risotto/photo?size=thumb&v=1700000000000");
      expect(field("Description of the photo")).toHaveValue("A plate of risotto");
    });

    it("offers to replace or remove a current photo", () => {
      renderForm(undefined, WITH_PHOTO);
      expect(field("Replace photo")).toHaveAttribute("name", "photo");
      expect(screen.queryByLabelText("Photo file")).not.toBeInTheDocument();
      const remove = screen.getByRole("checkbox", { name: "Remove photo" });
      expect(remove).toHaveAttribute("name", "removePhoto");
      expect(remove).toHaveAttribute("value", "1");
      expect(remove).not.toBeChecked();
    });

    it("takes the chosen file in the photo field and posts its description with the rest of the form", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action);
      await user.type(field("Name"), "Leek soup");
      await user.upload(field("Photo file"), new File(["image bytes"], "soup.jpg", { type: "image/jpeg" }));
      await user.type(field("Description of the photo"), "Soup in a bowl");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      // jsdom does not put an uploaded file into the FormData; the real upload is covered by the e2e tests.
      expect((field("Photo file") as HTMLInputElement).files?.[0]?.name).toBe("soup.jpg");
      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(action.mock.calls[0][1].get("photoAlt")).toBe("Soup in a bowl");
    });

    it("posts 'Remove photo' when it is ticked", async () => {
      const action = vi.fn<Action>(async (prev) => prev);
      const { user } = renderForm(action, WITH_PHOTO);
      await user.click(screen.getByRole("checkbox", { name: "Remove photo" }));
      await user.click(screen.getByRole("button", { name: "Save changes" }));

      await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      expect(action.mock.calls[0][1].get("removePhoto")).toBe("1");
    });

    it("puts the typed description back after a rejection", async () => {
      const action = rejectingAction(NAME_MISSING, { ...REJECTED_VALUES, photoAlt: "Soup in a bowl" });
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      await waitFor(() => expect(field("Description of the photo")).toHaveValue("Soup in a bowl"));
    });

    describe("a refused submission", () => {
      const soup = () => new File(["image bytes"], "soup.jpg", { type: "image/jpeg" });
      const fileField = () => field("Photo file") as HTMLInputElement;

      it("keeps the chosen photo and its description, so the retry uploads it", async () => {
        const action = vi.fn<Action>(async (prev, data) => ({
          error: NAME_MISSING,
          attempt: prev.attempt + 1,
          values: { ...REJECTED_VALUES, name: String(data.get("name")), photoAlt: String(data.get("photoAlt")) },
        }));
        const { user } = renderForm(action);
        await user.type(field("Name"), " ");
        await user.upload(fileField(), soup());
        await user.type(field("Description of the photo"), "Soup in a bowl");
        const chosen = fileField();

        await user.click(screen.getByRole("button", { name: "Create recipe" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Give the recipe a name.");

        // The same field, still holding the file: React's form reset did not empty it.
        expect(fileField()).toBe(chosen);
        expect(fileField().files?.[0]?.name).toBe("soup.jpg");
        expect(field("Description of the photo")).toHaveValue("Soup in a bowl");
      });

      it("keeps the chosen photo through several refusals", async () => {
        // A blank name that passes the browser's own check, as a server refusal would echo it.
        const action = rejectingAction(NAME_MISSING, { ...REJECTED_VALUES, name: " " });
        const { user } = renderForm(action);
        await user.type(field("Name"), " ");
        await user.upload(fileField(), soup());
        await user.type(field("Description of the photo"), "Soup");

        for (let attempt = 1; attempt <= 3; attempt++) {
          await user.click(screen.getByRole("button", { name: "Create recipe" }));
          await waitFor(() => expect(action).toHaveBeenCalledTimes(attempt));
          await screen.findByRole("alert");
          expect(fileField().files?.[0]?.name).toBe("soup.jpg");
        }
      });

      it("keeps 'Remove photo' ticked", async () => {
        const { user } = renderForm(rejectingAction(NAME_MISSING), WITH_PHOTO);
        await user.click(screen.getByRole("checkbox", { name: "Remove photo" }));
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        await screen.findByRole("alert");
        expect(screen.getByRole("checkbox", { name: "Remove photo" })).toBeChecked();
      });

      it("still posts through the form's action, for browsers without JavaScript", () => {
        renderForm();
        // React swaps a form action for a placeholder URL; the point is that the form has one.
        expect(field("Name").closest("form")).toHaveAttribute("action");
      });
    });

    describe("checks in the browser, before anything is sent", () => {
      const fileField = () => field("Photo file") as HTMLInputElement;
      const alt = () => field("Description of the photo") as HTMLInputElement;
      const small = () => new File(["image bytes"], "soup.jpg", { type: "image/jpeg" });
      const tooBig = () => new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.jpg", { type: "image/jpeg" });

      it("does not need a description while no file is chosen", () => {
        renderForm();
        expect(alt()).not.toBeRequired();
        expect(alt().validity.valid).toBe(true);
      });

      it("needs a description as soon as a file is chosen", async () => {
        const { user } = renderForm();
        await user.upload(fileField(), small());

        expect(alt()).toBeRequired();
        expect(alt().validity.valueMissing).toBe(true);
      });

      it("does not need it again when the file is taken back out", async () => {
        const { user } = renderForm();
        await user.upload(fileField(), small());
        fireEvent.change(fileField(), { target: { files: [] } });

        await waitFor(() => expect(alt()).not.toBeRequired());
      });

      it("needs the description of a photo that stays, so it cannot be emptied", () => {
        renderForm(undefined, WITH_PHOTO);
        expect(alt()).toBeRequired();
      });

      it("does not need it while the photo is being removed", async () => {
        const { user } = renderForm(undefined, WITH_PHOTO);
        await user.click(screen.getByRole("checkbox", { name: "Remove photo" }));
        expect(alt()).not.toBeRequired();

        await user.click(screen.getByRole("checkbox", { name: "Remove photo" }));
        expect(alt()).toBeRequired();
      });

      it("blocks saving an existing photo with its description emptied", async () => {
        const action = vi.fn<Action>(async (prev) => prev);
        const { user } = renderForm(action, WITH_PHOTO);
        await user.clear(alt());
        await user.click(screen.getByRole("button", { name: "Save changes" }));

        expect(action).not.toHaveBeenCalled();
      });

      it("blocks the submit, and keeps the file, when the description is missing", async () => {
        const action = vi.fn<Action>(async (prev) => prev);
        const { user } = renderForm(action);
        await user.type(field("Name"), "Leek soup");
        await user.upload(fileField(), small());
        await user.click(screen.getByRole("button", { name: "Create recipe" }));

        expect(action).not.toHaveBeenCalled();
        expect(fileField().files?.[0]?.name).toBe("soup.jpg");
      });

      it("submits once the description is there", async () => {
        const action = vi.fn<Action>(async (prev) => prev);
        const { user } = renderForm(action);
        await user.type(field("Name"), "Leek soup");
        await user.upload(fileField(), small());
        await user.type(alt(), "Soup in a bowl");
        await user.click(screen.getByRole("button", { name: "Create recipe" }));

        await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
      });

      it("refuses a file over the size limit on the spot, naming the limit", async () => {
        const { user } = renderForm();
        await user.upload(fileField(), tooBig());

        expect(fileField().validity.customError).toBe(true);
        expect(fileField().validationMessage).toBe("The photo is too large: 5 MB at most.");
      });

      it("does not submit a file over the limit", async () => {
        const action = vi.fn<Action>(async (prev) => prev);
        const { user } = renderForm(action);
        await user.type(field("Name"), "Leek soup");
        await user.upload(fileField(), tooBig());
        await user.type(alt(), "Too big");
        await user.click(screen.getByRole("button", { name: "Create recipe" }));

        expect(action).not.toHaveBeenCalled();
      });

      it("accepts a file exactly at the limit", async () => {
        const { user } = renderForm();
        await user.upload(fileField(), new File([new Uint8Array(5 * 1024 * 1024)], "edge.jpg", { type: "image/jpeg" }));
        expect(fileField().validity.customError).toBe(false);
      });

      it("lifts the refusal when a smaller file is chosen instead", async () => {
        const { user } = renderForm();
        await user.upload(fileField(), tooBig());
        await user.upload(fileField(), small());

        expect(fileField().validity.customError).toBe(false);
        expect(fileField().validationMessage).toBe("");
      });

      it("names the size limit in German", async () => {
        renderWithI18n(<RecipeForm action={vi.fn<Action>(async (prev) => prev)} />, { locale: "de" });
        const user = userEvent.setup();
        await user.upload(screen.getByLabelText("Fotodatei"), tooBig());

        expect((screen.getByLabelText("Fotodatei") as HTMLInputElement).validationMessage).toBe(
          "Das Foto ist zu groß: höchstens 5 MB.",
        );
      });
    });

    it("is labelled in German", () => {
      renderWithI18n(<RecipeForm action={vi.fn<Action>(async (prev) => prev)} recipe={WITH_PHOTO} />, { locale: "de" });
      expect(screen.getByRole("img", { name: "A plate of risotto" })).toBeInTheDocument();
      expect(screen.getByLabelText("Foto ersetzen")).toBeInTheDocument();
      expect(screen.getByRole("checkbox", { name: "Foto entfernen" })).toBeInTheDocument();
      expect(field("Beschreibung des Fotos")).toBeInTheDocument();
      expect(screen.getByText("JPEG, PNG oder WebP, bis zu 5 MB.")).toBeInTheDocument();
    });

    it("has no accessibility violations with a photo", async () => {
      const { container } = renderForm(undefined, WITH_PHOTO);
      await expectNoAxeViolations(container);
    });
  });

  describe("required fields", () => {
    const WITH_PHOTO: Recipe = { ...RISOTTO, photo: { alt: "A plate of risotto", version: 1 } };
    const label = (text: string) => screen.getByText(text, { selector: "label", normalizer: withoutMark });
    const markIn = (element: HTMLElement) => within(element).queryByTitle("Required");

    it("explains the asterisk at the top of the form", () => {
      renderForm();
      expect(screen.getByText("required")).toBeInTheDocument();
      expect(screen.getByText("required")).toHaveTextContent("* required");
    });

    it("marks the name with a title, and only the name while there is no photo", () => {
      renderForm();
      expect(markIn(label("Name"))).toHaveTextContent("*");
      expect(markIn(label("Description"))).not.toBeInTheDocument();
      expect(markIn(label("Description of the photo"))).not.toBeInTheDocument();
    });

    it("hides the asterisk from assistive technology, which hears the required attribute", () => {
      renderForm();
      expect(markIn(label("Name"))).toHaveAttribute("aria-hidden", "true");
      expect(screen.getByRole("textbox", { name: "Name" })).toBeRequired();
    });

    it("marks the photo description once a file is chosen", async () => {
      const user = userEvent.setup();
      renderForm();
      await user.upload(field("Photo file"), new File(["x"], "soup.jpg", { type: "image/jpeg" }));
      expect(markIn(label("Description of the photo"))).toBeInTheDocument();
      expect(field("Description of the photo")).toBeRequired();
    });

    it("marks the description of a photo that stays, and drops the mark while it is removed", async () => {
      const user = userEvent.setup();
      renderForm(undefined, WITH_PHOTO);
      expect(markIn(label("Description of the photo"))).toBeInTheDocument();
      await user.click(screen.getByRole("checkbox", { name: "Remove photo" }));
      expect(markIn(label("Description of the photo"))).not.toBeInTheDocument();
    });

    it("says so in German", () => {
      renderWithI18n(<RecipeForm action={vi.fn<Action>(async (prev) => prev)} />, { locale: "de" });
      expect(screen.getByText("Pflichtfeld")).toBeInTheDocument();
      expect(within(screen.getByText("Name", { selector: "label", normalizer: withoutMark })).getByTitle("Pflichtfeld")).toBeInTheDocument();
    });

    it("has no axe violations with the marker", async () => {
      const { container } = renderForm(undefined, WITH_PHOTO);
      await expectNoAxeViolations(container);
    });
  });

  describe("accessibility", () => {
    it("labels every ingredient input and button by its row number", () => {
      renderForm();
      const list = screen.getByRole("list");
      const second = within(list).getAllByRole("listitem")[1];
      expect(within(second).getByRole("textbox", { name: "Amount for ingredient 2" })).toBeInTheDocument();
      expect(within(second).getByRole("textbox", { name: "Unit for ingredient 2" })).toBeInTheDocument();
      expect(within(second).getByRole("textbox", { name: "Name of ingredient 2" })).toBeInTheDocument();
      expect(within(second).getByRole("button", { name: "Remove ingredient 2" })).toBeInTheDocument();
    });

    it("has no axe violations when creating", async () => {
      const { container } = renderForm();
      await expectNoAxeViolations(container);
    });

    it("has no axe violations when editing", async () => {
      const { container } = renderForm(undefined, RISOTTO);
      await expectNoAxeViolations(container);
    });

    it("has no axe violations with a validation error", async () => {
      const { user, container } = renderForm(rejectingAction(NAME_MISSING));
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");
      await expectNoAxeViolations(container);
    });
  });

  describe("in German", () => {
    function renderGerman(action: Action = vi.fn<Action>(async (prev) => prev), recipe?: Recipe) {
      const user = userEvent.setup();
      const result = renderWithI18n(<RecipeForm action={action} recipe={recipe} />, { locale: "de" });
      return { user, ...result };
    }

    it("labels the form in German", () => {
      renderGerman();
      expect(field("Name")).toHaveAttribute("placeholder", "Pilzrisotto");
      expect(field("Beschreibung")).toBeInTheDocument();
      expect(field("Personen")).toHaveValue(2);
      expect(field("Minuten")).toBeInTheDocument();
      expect(field("Quelle")).toBeInTheDocument();
      expect(field("Zubereitung")).toBeInTheDocument();
      expect(field("Menge für Zutat 1")).toBeInTheDocument();
      expect(field("Einheit für Zutat 1")).toBeInTheDocument();
      expect(field("Name von Zutat 1")).toHaveAttribute("placeholder", "Risottoreis");
      expect(screen.getByRole("button", { name: "Zutat 1 entfernen" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Zutat hinzufügen" })).toBeInTheDocument();
      expect(screen.getByRole("link", { name: "Abbrechen" })).toBeInTheDocument();
    });

    it("names the submit button after what it does", () => {
      renderGerman(undefined, RISOTTO);
      expect(screen.getByRole("button", { name: "Änderungen speichern" })).toBeInTheDocument();
    });

    it("shows the action's error in German", async () => {
      const { user } = renderGerman(rejectingAction(NAME_MISSING));
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Rezept anlegen" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Gib dem Rezept einen Namen.");
    });

    it("has no axe violations with a validation error", async () => {
      const { user, container } = renderGerman(rejectingAction(SOURCE_INVALID));
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Rezept anlegen" }));
      await screen.findByRole("alert");
      await expectNoAxeViolations(container);
    });
  });
});
