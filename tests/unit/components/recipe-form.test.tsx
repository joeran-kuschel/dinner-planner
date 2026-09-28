import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EMPTY_RECIPE_FORM_STATE, type RecipeFormState, type RecipeFormValues } from "@/lib/recipe-form";
import { expectNoAxeViolations } from "@/tests/support/axe";
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
  ingredients: [
    { name: "Arborio rice", quantity: 300, unit: "g" },
    { name: "Salt", quantity: null, unit: null },
  ],
};

const REJECTED_VALUES: RecipeFormValues = {
  name: "",
  description: "Still typing",
  servings: "3",
  prepMinutes: "25",
  sourceUrl: "https://example.com/soup",
  instructions: "Chop\nSimmer",
  ingredients: [
    { name: "Leek", quantity: "2", unit: "" },
    { name: "Stock", quantity: "1,5", unit: "l" },
  ],
};

/** An action that rejects with the given message and echoes `values`. */
function rejectingAction(error: string, values: RecipeFormValues = REJECTED_VALUES) {
  return vi.fn<Action>(async (prev) => ({ error, values, attempt: prev.attempt + 1 }));
}

function renderForm(action: Action = vi.fn<Action>(async (prev) => prev), recipe?: Recipe) {
  const user = userEvent.setup();
  const result = render(<RecipeForm action={action} recipe={recipe} />);
  return { user, ...result };
}

const field = (label: string) => screen.getByLabelText(label);
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
      const action = rejectingAction("Give the recipe a name.");
      const { user } = renderForm(action);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();

      await user.type(field("Name"), "   ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Give the recipe a name.");
    });

    it("refills every field and row from the values the action echoed", async () => {
      const action = rejectingAction("Give the recipe a name.");
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
        error: "Give the recipe a name.",
        attempt: prev.attempt + 1,
        values: {
          name: String(data.get("name")),
          description: String(data.get("description")),
          servings: String(data.get("servings")),
          prepMinutes: String(data.get("prepMinutes")),
          sourceUrl: String(data.get("sourceUrl")),
          instructions: String(data.get("instructions")),
          ingredients: data.getAll("ingredientName").map((name, i) => ({
            name: String(name),
            quantity: String(data.getAll("ingredientQuantity")[i]),
            unit: String(data.getAll("ingredientUnit")[i]),
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
      const action = rejectingAction("Give the recipe a name.");
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
        .mockImplementationOnce(async (prev) => ({ error: "First problem", values: REJECTED_VALUES, attempt: prev.attempt + 1 }))
        .mockImplementationOnce(async (prev) => ({ error: "Second problem", values: REJECTED_VALUES, attempt: prev.attempt + 1 }));
      const { user } = renderForm(action);
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("First problem");

      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Second problem"));
      expect(screen.getAllByRole("alert")).toHaveLength(1);
    });

    it("can add and remove rows after a rejection without mixing them up", async () => {
      const action = rejectingAction("Give the recipe a name.");
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
      const action = rejectingAction("Give the recipe a name.", { ...REJECTED_VALUES, ingredients: [] });
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
      const action = rejectingAction("Give the recipe a name.");
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

      settle({ error: "Try again", values: REJECTED_VALUES, attempt: 1 });
      expect(await screen.findByRole("button", { name: "Create recipe" })).toBeEnabled();
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
      const { user, container } = renderForm(rejectingAction("Give the recipe a name."));
      await user.type(field("Name"), " ");
      await user.click(screen.getByRole("button", { name: "Create recipe" }));
      await screen.findByRole("alert");
      await expectNoAxeViolations(container);
    });
  });
});
