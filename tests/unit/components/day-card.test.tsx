import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { DayCard, type DayCardMeal, type DayCardProps } from "@/components/day-card";

const actions = vi.hoisted(() => ({
  setPlannedMeal: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  clearPlannedMeal: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/meals", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const RECIPES = [
  { id: "r-risotto", name: "Mushroom risotto" },
  { id: "r-curry", name: "Chickpea curry" },
];

const PLANNED: DayCardMeal = { recipeId: "r-risotto", customTitle: null, servings: 3, notes: "Use the good stock" };
const ONE_OFF: DayCardMeal = { recipeId: null, customTitle: "Pizza night", servings: 2, notes: null };

function props(overrides: Partial<DayCardProps> = {}): DayCardProps {
  return {
    dayKey: "2026-09-28",
    weekdayLabel: "Monday",
    dateLabel: "28 Sep",
    isToday: false,
    recipes: RECIPES,
    meal: null,
    ...overrides,
  };
}

function renderCard(overrides: Partial<DayCardProps> = {}) {
  const user = userEvent.setup();
  const result = render(<DayCard {...props(overrides)} />);
  return { user, ...result };
}

const dinnerField = () => screen.getByRole("combobox", { name: "Dinner for Monday" });
const suggestions = () => screen.queryAllByRole("option").map((option) => option.textContent);
const lastFormData = (fn: typeof actions.setPlannedMeal) => fn.mock.calls.at(-1)![0];

/** An action whose promise the test settles, to observe the pending state. */
function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe("DayCard", () => {
  describe("rendering", () => {
    it("shows the weekday as a heading and the date", () => {
      renderCard();
      expect(screen.getByRole("heading", { name: "Monday" })).toBeInTheDocument();
      expect(screen.getByText("28 Sep")).toBeInTheDocument();
    });

    it("marks today inside the heading", () => {
      renderCard({ isToday: true });
      expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent(/^Monday\s*today$/);
    });

    it("announces today's heading as two words", () => {
      renderCard({ isToday: true });
      expect(screen.getByRole("heading", { name: "Monday today" })).toBeInTheDocument();
    });

    it("does not mark other days as today", () => {
      renderCard();
      expect(screen.queryByText("today")).not.toBeInTheDocument();
    });

    it("labels the dinner field with the weekday and submits it as `dinner`", () => {
      renderCard();
      expect(dinnerField()).toHaveAttribute("name", "dinner");
      expect(dinnerField()).toHaveAttribute("placeholder", "Pick a recipe or type a dinner…");
    });

    it("shows only an empty dinner field when nothing is planned", () => {
      renderCard();
      expect(dinnerField()).toHaveValue("");
      expect(screen.queryByLabelText("Serves")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Note (optional)")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear day" })).not.toBeInTheDocument();
    });

    it("shows the planned recipe's name, its servings, its note and a clear button", () => {
      renderCard({ meal: PLANNED });
      expect(dinnerField()).toHaveValue("Mushroom risotto");
      expect(screen.getByLabelText("Serves")).toHaveValue(3);
      expect(screen.getByPlaceholderText("Note (optional)")).toHaveValue("Use the good stock");
      expect(screen.getByRole("button", { name: "Clear day" })).toBeInTheDocument();
    });

    it("shows a one-off dinner by its title", () => {
      renderCard({ meal: ONE_OFF });
      expect(dinnerField()).toHaveValue("Pizza night");
      expect(screen.getByPlaceholderText("Note (optional)")).toHaveValue("");
    });

    it("gives the servings field a valid range", () => {
      renderCard({ meal: PLANNED });
      const servings = screen.getByRole("spinbutton", { name: "Serves" });
      expect(servings).toHaveAttribute("min", "1");
      expect(servings).toHaveAttribute("max", "99");
    });
  });

  describe("suggestions", () => {
    it("shows no suggestions until the user types or opens the field", () => {
      renderCard();
      expect(dinnerField()).toHaveAttribute("aria-expanded", "false");
      expect(suggestions()).toEqual([]);
    });

    it("lists every recipe when the field is clicked", async () => {
      const { user } = renderCard();
      await user.click(dinnerField());
      expect(dinnerField()).toHaveAttribute("aria-expanded", "true");
      expect(suggestions()).toEqual(["Mushroom risotto", "Chickpea curry"]);
    });

    it("lists every recipe, not just the planned one, when opened on a planned day", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.click(dinnerField());
      expect(suggestions()).toEqual(["Mushroom risotto", "Chickpea curry"]);
    });

    it("filters recipes by any part of the name, ignoring case", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "CURR");
      expect(suggestions()).toEqual([
        "Chickpea curry",
        "Plan “CURR” for this day only",
        "Add “CURR” as a new recipe",
      ]);
    });

    it("offers to plan a name that is no recipe once, or to add it as a recipe", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "  Shakshuka ");
      expect(suggestions()).toEqual(["Plan “Shakshuka” for this day only", "Add “Shakshuka” as a new recipe"]);
    });

    it("offers nothing extra when the text is exactly a recipe's name", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "chickpea curry");
      expect(suggestions()).toEqual(["Chickpea curry"]);
    });

    it("keeps the typed text when the mouse is pressed on the list outside an option", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.clear(dinnerField());
      await user.type(dinnerField(), "curr");
      await user.pointer({ keys: "[MouseLeft>]", target: screen.getByRole("listbox") });

      expect(dinnerField()).toHaveFocus();
      expect(dinnerField()).toHaveValue("curr");
      await user.pointer({ keys: "[/MouseLeft]" });
    });

    it("moves through the suggestions with the arrow keys", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "r");
      await user.keyboard("{ArrowDown}");
      const [first, second] = screen.getAllByRole("option");
      expect(dinnerField()).toHaveAttribute("aria-activedescendant", first.id);
      await user.keyboard("{ArrowDown}");
      expect(dinnerField()).toHaveAttribute("aria-activedescendant", second.id);
    });

    it("tells screen readers how many suggestions there are", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "curry");
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3 suggestions"));

      await user.type(dinnerField(), "{Backspace}{Backspace}{Backspace}{Backspace}{Backspace}chickpea curry");
      await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 suggestion"));
    });

    it("offers only the two ways to plan a name when there are no recipes yet", async () => {
      const { user } = renderCard({ recipes: [] });
      await user.type(dinnerField(), "Soup");
      expect(suggestions()).toEqual(["Plan “Soup” for this day only", "Add “Soup” as a new recipe"]);
    });

    // An open menu with nothing in it would announce "expanded" over nothing (WCAG 4.1.2).
    it("does not report itself expanded when there is nothing to suggest", async () => {
      const { user } = renderCard({ recipes: [] });
      await user.click(dinnerField());
      expect(dinnerField()).toHaveAttribute("aria-expanded", "false");
    });

    it("shows no empty list when there are no recipes and nothing is typed", async () => {
      const { user } = renderCard({ recipes: [] });
      await user.click(dinnerField());
      expect(suggestions()).toEqual([]);
      expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    });

    it("closes the list on Escape, then puts the planned dinner back on a second Escape", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.clear(dinnerField());
      await user.type(dinnerField(), "Soup");
      await user.keyboard("{Escape}");
      expect(suggestions()).toEqual([]);
      expect(dinnerField()).toHaveValue("Soup");

      await user.keyboard("{Escape}");
      expect(dinnerField()).toHaveValue("Mushroom risotto");
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });
  });

  describe("picking a dinner", () => {
    it("saves a clicked recipe at once, with the day", async () => {
      const { user } = renderCard();
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Chickpea curry" }));

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("day")).toBe("2026-09-28");
      expect(data.get("dinner")).toBe("Chickpea curry");
      expect(data.get("recipeId")).toBe("r-curry");
      expect(data.has("newRecipe")).toBe(false);
      // The save waits for the render that shows the servings and note, so the
      // first one already carries their defaults.
      expect(data.get("servings")).toBe("2");
      expect(data.get("notes")).toBe("");
      expect(actions.clearPlannedMeal).not.toHaveBeenCalled();
      expect(dinnerField()).toHaveValue("Chickpea curry");
    });

    it("picks a suggestion with the keyboard", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "risotto");
      await user.keyboard("{ArrowDown}{Enter}");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("recipeId")).toBe("r-risotto");
      expect(dinnerField()).toHaveValue("Mushroom risotto");
      expect(suggestions()).toEqual([]);
    });

    it("plans a name for this day only, without a recipe", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "Eating out");
      await user.click(screen.getByRole("option", { name: "Plan “Eating out” for this day only" }));

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("dinner")).toBe("Eating out");
      expect(data.get("recipeId")).toBe("");
      expect(data.has("newRecipe")).toBe(false);
      expect(dinnerField()).toHaveValue("Eating out");
    });

    it("asks the server to add a name as a new recipe", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "Shakshuka");
      await user.click(screen.getByRole("option", { name: "Add “Shakshuka” as a new recipe" }));

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("dinner")).toBe("Shakshuka");
      expect(data.get("recipeId")).toBe("");
      expect(data.get("newRecipe")).toBe("1");
    });

    it("turns a one-off dinner into a recipe", async () => {
      const { user } = renderCard({ meal: ONE_OFF });
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Add “Pizza night” as a new recipe" }));

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("newRecipe")).toBe("1");
    });

    it("keeps the servings and note when switching to another recipe", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Chickpea curry" }));

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("recipeId")).toBe("r-curry");
      expect(data.get("servings")).toBe("3");
      expect(data.get("notes")).toBe("Use the good stock");
    });

    it("saves nothing when the planned recipe is picked again", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Mushroom risotto" }));

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });

    it("saves nothing when the planned one-off dinner is picked again", async () => {
      const { user } = renderCard({ meal: ONE_OFF });
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Plan “Pizza night” for this day only" }));

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
      expect(dinnerField()).toHaveValue("Pizza night");
    });

    it("reveals servings, note and clear button once something is picked", async () => {
      const { user } = renderCard();
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Mushroom risotto" }));
      expect(screen.getByLabelText("Serves")).toHaveValue(2);
      expect(screen.getByRole("button", { name: "Clear day" })).toBeInTheDocument();
    });
  });

  describe("typing without picking", () => {
    it("saves nothing while typing", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "Chickpea curry");
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });

    it("plans the recipe whose exact name is typed when the field is left", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "chickpea CURRY");
      await user.tab();

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("recipeId")).toBe("r-curry");
      expect(dinnerField()).toHaveValue("Chickpea curry");
    });

    it("puts the planned dinner back when the field is left with a name that is no recipe", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.clear(dinnerField());
      await user.type(dinnerField(), "Soup");
      await user.tab();

      expect(dinnerField()).toHaveValue("Mushroom risotto");
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });

    it("saves nothing when the field is left with the planned recipe's name, and shows it as named", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.clear(dinnerField());
      await user.type(dinnerField(), "MUSHROOM RISOTTO");
      await user.tab();

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
      expect(dinnerField()).toHaveValue("Mushroom risotto");
    });

    it("switches to the recipe whose exact name replaces the planned one when the field is left", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.clear(dinnerField());
      await user.type(dinnerField(), "Chickpea curry");
      await user.tab();

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("recipeId")).toBe("r-curry");
      expect(data.get("servings")).toBe("3");
      expect(data.get("notes")).toBe("Use the good stock");
    });

    it("does not pick a highlighted suggestion when tabbing away", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "Soup");
      await user.keyboard("{ArrowDown}");
      await user.tab();

      expect(dinnerField()).toHaveValue("");
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });

    it("does not clear the day when the field is emptied and left", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.clear(dinnerField());
      await user.tab();

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
      expect(actions.clearPlannedMeal).not.toHaveBeenCalled();
      expect(dinnerField()).toHaveValue("Mushroom risotto");
    });

    it("picks the recipe whose exact name is typed on Enter", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "Mushroom risotto");
      await user.keyboard("{Escape}{Enter}");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("recipeId")).toBe("r-risotto");
    });

    it("opens the choices on Enter for a name that is no recipe, saving nothing", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "Soup");
      await user.keyboard("{Escape}{Enter}");

      expect(suggestions()).toEqual(["Plan “Soup” for this day only", "Add “Soup” as a new recipe"]);
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });

    it("never submits the form, and so never clears the day, on Enter", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.click(dinnerField());
      await user.keyboard("{Escape}{Enter}");

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
      expect(actions.clearPlannedMeal).not.toHaveBeenCalled();
    });
  });

  describe("leaving the field unchanged", () => {
    it("keeps the planned one of two recipes with the same name", async () => {
      const recipes = [
        { id: "r-curry-1", name: "Curry" },
        { id: "r-curry-2", name: "Curry" },
      ];
      const { user } = renderCard({ recipes, meal: { ...PLANNED, recipeId: "r-curry-2" } });
      await user.click(dinnerField());
      await user.tab();
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();

      // Back into the field: the servings field it leaves saves on blur, and
      // Enter on the unchanged name saves nothing more.
      await user.click(dinnerField());
      await user.keyboard("{Escape}{Enter}");
      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("recipeId")).toBe("r-curry-2");
      expect(screen.getByDisplayValue("r-curry-2")).toHaveAttribute("name", "recipeId");
    });

    it("keeps a one-off dinner when a recipe of that name exists", async () => {
      const recipes = [...RECIPES, { id: "r-pizza", name: "Pizza night" }];
      const { user } = renderCard({ recipes, meal: ONE_OFF });
      await user.click(dinnerField());
      await user.tab();

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
      expect(dinnerField()).toHaveValue("Pizza night");
    });

    it("closes the suggestions when Enter plans a recipe by its exact name", async () => {
      const { user } = renderCard();
      await user.type(dinnerField(), "chickpea curry");
      await user.keyboard("{Enter}");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(dinnerField()).toHaveAttribute("aria-expanded", "false");
      expect(suggestions()).toEqual([]);
    });
  });

  describe("a failed save", () => {
    it("says so, shows what is saved and reloads the data", async () => {
      actions.setPlannedMeal.mockRejectedValueOnce(new Error("setPlannedMeal: unknown `recipeId`"));
      const { user } = renderCard({ meal: PLANNED });
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Chickpea curry" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("This day could not be saved.");
      expect(dinnerField()).toHaveValue("Mushroom risotto");
      expect(router.refresh).toHaveBeenCalledTimes(1);
    });

    it("puts the saved note back instead of the unsaved one", async () => {
      actions.setPlannedMeal.mockRejectedValueOnce(new Error("offline"));
      const { user } = renderCard({ meal: PLANNED });
      const note = screen.getByPlaceholderText("Note (optional)");
      await user.clear(note);
      await user.type(note, "Not saved");
      await user.tab();

      await screen.findByRole("alert");
      expect(note).toHaveValue("Use the good stock");
    });

    it("falls back to what the server has now, not to when the save started", async () => {
      const save = deferred();
      actions.setPlannedMeal.mockImplementationOnce(() => save.promise);
      const { user, rerender } = renderCard({ meal: PLANNED });
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Chickpea curry" }));
      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));

      // Another save has landed meanwhile: the day now holds a one-off dinner.
      rerender(<DayCard {...props({ meal: ONE_OFF })} />);
      save.reject(new Error("unknown `recipeId`"));

      await screen.findByRole("alert");
      expect(dinnerField()).toHaveValue("Pizza night");
    });

    it("clears the message with the next save", async () => {
      actions.setPlannedMeal.mockRejectedValueOnce(new Error("offline"));
      const { user } = renderCard({ meal: PLANNED });
      const note = screen.getByPlaceholderText("Note (optional)");
      await user.type(note, "!");
      await user.tab();
      await screen.findByRole("alert");

      await user.type(note, "?");
      await user.tab();
      await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    });
  });

  describe("servings and note", () => {
    it("saves servings on blur, not while typing", async () => {
      const { user } = renderCard({ meal: PLANNED });
      const servings = screen.getByLabelText("Serves");
      await user.clear(servings);
      await user.type(servings, "5");
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();

      await user.tab();
      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("servings")).toBe("5");
      expect(data.get("recipeId")).toBe("r-risotto");
      expect(data.get("dinner")).toBe("Mushroom risotto");
      expect(data.get("notes")).toBe("Use the good stock");
    });

    it("saves the note on blur, not while typing", async () => {
      const { user } = renderCard({ meal: PLANNED });
      const note = screen.getByPlaceholderText("Note (optional)");
      await user.clear(note);
      await user.type(note, "Double the garlic");
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();

      await user.tab();
      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("notes")).toBe("Double the garlic");
    });

    it("saves the note, and does not clear the day, on Enter", async () => {
      const { user } = renderCard({ meal: PLANNED });
      const note = screen.getByPlaceholderText("Note (optional)");
      await user.clear(note);
      await user.type(note, "Brown butter{Enter}");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("notes")).toBe("Brown butter");
      expect(actions.clearPlannedMeal).not.toHaveBeenCalled();
    });

    it("saves the servings, and does not clear the day, on Enter", async () => {
      const { user } = renderCard({ meal: PLANNED });
      const servings = screen.getByLabelText("Serves");
      await user.clear(servings);
      await user.type(servings, "6{Enter}");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("servings")).toBe("6");
      expect(data.get("recipeId")).toBe("r-risotto");
      expect(actions.clearPlannedMeal).not.toHaveBeenCalled();
    });

    it("announces 'Saving…' in a polite live region while a save is pending", async () => {
      const save = deferred();
      actions.setPlannedMeal.mockImplementationOnce(() => save.promise);
      const { user } = renderCard({ meal: PLANNED });

      const note = screen.getByPlaceholderText("Note (optional)");
      await user.type(note, "!");
      await user.tab();

      const status = await screen.findByText("Saving…");
      expect(status).toHaveAttribute("aria-live", "polite");

      save.resolve();
      await waitFor(() => expect(screen.queryByText("Saving…")).not.toBeInTheDocument());
    });

    it("keeps what the user types while a save is still pending", async () => {
      const save = deferred();
      actions.setPlannedMeal.mockImplementationOnce(() => save.promise);
      const { user } = renderCard({ meal: PLANNED });

      await user.clear(screen.getByLabelText("Serves"));
      await user.type(screen.getByLabelText("Serves"), "5");
      const note = screen.getByRole("textbox", { name: "Note for Monday" });
      await user.click(note); // the blur saves the servings
      await screen.findByText("Saving…");
      await user.clear(note);
      await user.type(note, "Half a batch");

      save.resolve();
      await waitFor(() => expect(screen.queryByText("Saving…")).not.toBeInTheDocument());

      expect(note).toHaveFocus();
      expect(note).toHaveValue("Half a batch");
    });
  });

  describe("focus", () => {
    it("labels the note field for screen readers", () => {
      renderCard({ meal: PLANNED });
      expect(screen.getByRole("textbox", { name: "Note for Monday" })).toHaveValue("Use the good stock");
    });

    it("keeps the dinner field focused when its save lands", async () => {
      const { user, rerender } = renderCard({ meal: PLANNED });
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Chickpea curry" }));
      rerender(<DayCard {...props({ meal: { ...PLANNED, recipeId: "r-curry" } })} />);

      expect(dinnerField()).toHaveFocus();
      expect(dinnerField()).toHaveValue("Chickpea curry");
    });

    it("does not take focus when the page loads with a one-off dinner", () => {
      renderCard({ meal: ONE_OFF });
      expect(dinnerField()).not.toHaveFocus();
    });

    it("leaves the focused field as typed when the server value changes", async () => {
      const { user, rerender } = renderCard({ meal: PLANNED });
      const note = screen.getByRole("textbox", { name: "Note for Monday" });
      await user.clear(note);
      await user.type(note, "Half a batch");
      rerender(<DayCard {...props({ meal: { ...PLANNED, servings: 5 } })} />);

      expect(note).toHaveFocus();
      expect(note).toHaveValue("Half a batch");
      expect(screen.getByLabelText("Serves")).toHaveValue(5);
    });
  });

  describe("clear day", () => {
    it("sends the day to clearPlannedMeal instead of saving", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.click(screen.getByRole("button", { name: "Clear day" }));

      await waitFor(() => expect(actions.clearPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.clearPlannedMeal).get("day")).toBe("2026-09-28");
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });
  });

  describe("following the server value", () => {
    it("shows the saved recipe after the save lands and the page revalidates", async () => {
      const { user, rerender } = renderCard();
      await user.click(dinnerField());
      await user.click(screen.getByRole("option", { name: "Chickpea curry" }));
      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));

      rerender(<DayCard {...props({ meal: { recipeId: "r-curry", customTitle: null, servings: 2, notes: null } })} />);
      expect(dinnerField()).toHaveValue("Chickpea curry");
      expect(screen.getByLabelText("Serves")).toHaveValue(2);
    });

    it("shows a recipe added from the day once the server has created it", async () => {
      const { user, rerender } = renderCard();
      await user.type(dinnerField(), "Shakshuka");
      await user.click(screen.getByRole("option", { name: "Add “Shakshuka” as a new recipe" }));
      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));

      rerender(
        <DayCard
          {...props({
            recipes: [...RECIPES, { id: "r-new", name: "Shakshuka" }],
            meal: { recipeId: "r-new", customTitle: null, servings: 2, notes: null },
          })}
        />,
      );
      expect(dinnerField()).toHaveValue("Shakshuka");
      expect(screen.getByDisplayValue("r-new")).toHaveAttribute("name", "recipeId");
      expect(document.querySelector('input[name="newRecipe"]')).toBeNull();
    });

    it("keeps what the user types after adding a recipe when that save lands", async () => {
      const save = deferred();
      actions.setPlannedMeal.mockImplementationOnce(() => save.promise);
      const { user, rerender } = renderCard();
      await user.type(dinnerField(), "Shakshuka");
      await user.click(screen.getByRole("option", { name: "Add “Shakshuka” as a new recipe" }));
      await user.clear(dinnerField());
      await user.type(dinnerField(), "Sal");

      save.resolve();
      rerender(
        <DayCard
          {...props({
            recipes: [...RECIPES, { id: "r-new", name: "Shakshuka" }],
            meal: { recipeId: "r-new", customTitle: null, servings: 2, notes: null },
          })}
        />,
      );
      expect(dinnerField()).toHaveValue("Sal");
      expect(dinnerField()).toHaveFocus();
    });

    it("follows a new meal from the server, e.g. another week", () => {
      const { rerender } = renderCard({ meal: PLANNED });
      rerender(<DayCard {...props({ meal: { recipeId: "r-curry", customTitle: null, servings: 4, notes: "Spicy" } })} />);

      expect(dinnerField()).toHaveValue("Chickpea curry");
      expect(screen.getByLabelText("Serves")).toHaveValue(4);
      expect(screen.getByPlaceholderText("Note (optional)")).toHaveValue("Spicy");
    });

    it("follows a day being cleared on the server", () => {
      const { rerender } = renderCard({ meal: PLANNED });
      rerender(<DayCard {...props({ meal: null })} />);

      expect(dinnerField()).toHaveValue("");
      expect(screen.queryByLabelText("Serves")).not.toBeInTheDocument();
    });

    it("follows a one-off dinner arriving from the server", () => {
      const { rerender } = renderCard();
      rerender(<DayCard {...props({ meal: { ...ONE_OFF, customTitle: "Eating out" } })} />);

      expect(dinnerField()).toHaveValue("Eating out");
    });

    it("follows a planned recipe being renamed", () => {
      const { rerender } = renderCard({ meal: PLANNED });
      rerender(<DayCard {...props({ meal: PLANNED, recipes: [{ id: "r-risotto", name: "Porcini risotto" }] })} />);

      expect(dinnerField()).toHaveValue("Porcini risotto");
    });
  });

  describe("accessibility", () => {
    it("has no axe violations with nothing planned", async () => {
      const { container } = renderCard();
      await expectNoAxeViolations(container);
    });

    it("has no axe violations with a recipe planned today", async () => {
      const { container } = renderCard({ meal: PLANNED, isToday: true });
      await expectNoAxeViolations(container);
    });

    it("has no axe violations with a one-off dinner", async () => {
      const { container } = renderCard({ meal: ONE_OFF });
      await expectNoAxeViolations(container);
    });

    it("has no axe violations with the suggestions open and one highlighted", async () => {
      const { user, container } = renderCard();
      await user.type(dinnerField(), "r");
      await user.keyboard("{ArrowDown}");
      await expectNoAxeViolations(container);
    });
  });
});
