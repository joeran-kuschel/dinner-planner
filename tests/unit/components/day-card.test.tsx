import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CUSTOM_MEAL } from "@/lib/planner";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { DayCard, type DayCardMeal, type DayCardProps } from "@/components/day-card";

const actions = vi.hoisted(() => ({
  setPlannedMeal: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  clearPlannedMeal: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/meals", () => actions);

const RECIPES = [
  { id: "r-risotto", name: "Mushroom risotto" },
  { id: "r-curry", name: "Chickpea curry" },
];

const PLANNED: DayCardMeal = { recipeId: "r-risotto", customTitle: null, servings: 3, notes: "Use the good stock" };

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

const dinnerSelect = () => screen.getByRole("combobox", { name: "Dinner for Monday" });
const lastFormData = (fn: typeof actions.setPlannedMeal) => fn.mock.calls.at(-1)![0];

/** An action whose promise the test settles, to observe the pending state. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
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

    it("offers nothing, every recipe and something else, in that order", () => {
      renderCard();
      const options = screen.getAllByRole("option").map((option) => option.textContent);
      expect(options).toEqual(["— nothing planned —", "Mushroom risotto", "Chickpea curry", "Something else…"]);
    });

    it("labels the dropdown with the weekday", () => {
      renderCard();
      expect(dinnerSelect()).toHaveAttribute("name", "recipeId");
    });

    it("shows only the dropdown when nothing is planned", () => {
      renderCard();
      expect(dinnerSelect()).toHaveValue("");
      expect(screen.queryByLabelText("Serves")).not.toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Note (optional)")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Clear day" })).not.toBeInTheDocument();
    });

    it("shows the planned recipe, its servings, its note and a clear button", () => {
      renderCard({ meal: PLANNED });
      expect(dinnerSelect()).toHaveValue("r-risotto");
      expect(screen.getByLabelText("Serves")).toHaveValue(3);
      expect(screen.getByPlaceholderText("Note (optional)")).toHaveValue("Use the good stock");
      expect(screen.getByRole("button", { name: "Clear day" })).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("Leftovers, takeaway, eating out…")).not.toBeInTheDocument();
    });

    it("shows a custom meal as 'Something else…' with its title", () => {
      renderCard({ meal: { recipeId: null, customTitle: "Pizza night", servings: 2, notes: null } });
      expect(dinnerSelect()).toHaveValue(CUSTOM_MEAL);
      expect(screen.getByPlaceholderText("Leftovers, takeaway, eating out…")).toHaveValue("Pizza night");
      expect(screen.getByPlaceholderText("Note (optional)")).toHaveValue("");
    });

    it("gives the servings field a valid range", () => {
      renderCard({ meal: PLANNED });
      const servings = screen.getByRole("spinbutton", { name: "Serves" });
      expect(servings).toHaveAttribute("min", "1");
      expect(servings).toHaveAttribute("max", "99");
    });
  });

  describe("auto-save", () => {
    it("saves as soon as a recipe is picked, with the day and the choice", async () => {
      const { user } = renderCard();
      await user.selectOptions(dinnerSelect(), "Chickpea curry");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("day")).toBe("2026-09-28");
      expect(data.get("recipeId")).toBe("r-curry");
      // The servings and note fields appear only after this render, so the first
      // save leaves them out and the action falls back to its defaults.
      expect(data.has("servings")).toBe(false);
      expect(data.has("notes")).toBe(false);
      expect(actions.clearPlannedMeal).not.toHaveBeenCalled();
    });

    it("keeps the servings and note when switching to another recipe", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.selectOptions(dinnerSelect(), "Chickpea curry");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("recipeId")).toBe("r-curry");
      expect(data.get("servings")).toBe("3");
      expect(data.get("notes")).toBe("Use the good stock");
    });

    it("reveals servings, note and clear button once something is picked", async () => {
      const { user } = renderCard();
      await user.selectOptions(dinnerSelect(), "Mushroom risotto");
      expect(screen.getByLabelText("Serves")).toHaveValue(2);
      expect(screen.getByRole("button", { name: "Clear day" })).toBeInTheDocument();
    });

    it("saves an emptied day when 'nothing planned' is picked", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.selectOptions(dinnerSelect(), "— nothing planned —");

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      expect(lastFormData(actions.setPlannedMeal).get("recipeId")).toBe("");
      expect(screen.queryByLabelText("Serves")).not.toBeInTheDocument();
    });

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

  describe("something else", () => {
    it("shows a focused title field and does not save before a title is typed", async () => {
      const { user } = renderCard();
      await user.selectOptions(dinnerSelect(), "Something else…");

      const title = screen.getByPlaceholderText("Leftovers, takeaway, eating out…");
      expect(title).toHaveValue("");
      expect(title).toHaveFocus();
      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });

    it("does not save, and so does not clear the day, when the title is left empty", async () => {
      const { user } = renderCard({ meal: PLANNED });
      await user.selectOptions(dinnerSelect(), "Something else…");
      await user.tab();

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
      expect(actions.clearPlannedMeal).not.toHaveBeenCalled();
      expect(dinnerSelect()).toHaveValue(CUSTOM_MEAL);
    });

    it("does not save a title of only spaces", async () => {
      const { user } = renderCard();
      await user.selectOptions(dinnerSelect(), "Something else…");
      await user.type(screen.getByRole("textbox", { name: "Dinner title for Monday" }), "   ");
      await user.tab();

      expect(actions.setPlannedMeal).not.toHaveBeenCalled();
    });

    it("submits the CUSTOM_MEAL sentinel with the typed title on blur", async () => {
      const { user } = renderCard();
      await user.selectOptions(dinnerSelect(), "Something else…");
      await user.keyboard("Takeaway");
      await user.tab();

      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));
      const data = lastFormData(actions.setPlannedMeal);
      expect(data.get("recipeId")).toBe(CUSTOM_MEAL);
      expect(data.get("customTitle")).toBe("Takeaway");
      expect(data.get("day")).toBe("2026-09-28");
    });

    it("drops the title field when switching back to a recipe", async () => {
      const { user } = renderCard({ meal: { recipeId: null, customTitle: "Pizza night", servings: 2, notes: null } });
      await user.selectOptions(dinnerSelect(), "Chickpea curry");

      expect(screen.queryByPlaceholderText("Leftovers, takeaway, eating out…")).not.toBeInTheDocument();
      await waitFor(() =>
        expect(lastFormData(actions.setPlannedMeal).get("recipeId")).toBe("r-curry"),
      );
      // The save fires before the title field unmounts, so the old title still travels
      // along; setPlannedMeal ignores it once a recipe id is set.
    });

    // Focus moves into the field only after the user picks "Something else…"
    // (WCAG 2.4.3 Focus Order, 3.2.1 On Focus), never on page load.
    it("does not take focus when a custom meal comes from the server", () => {
      renderCard({ meal: { recipeId: null, customTitle: "Pizza night", servings: 2, notes: null } });
      expect(screen.getByPlaceholderText("Leftovers, takeaway, eating out…")).not.toHaveFocus();
    });

    it("labels the title field for screen readers", () => {
      renderCard({ meal: { recipeId: null, customTitle: "Pizza night", servings: 2, notes: null } });
      expect(screen.getByRole("textbox", { name: "Dinner title for Monday" })).toHaveValue("Pizza night");
    });
  });

  describe("focus", () => {
    it("labels the note field for screen readers", () => {
      renderCard({ meal: PLANNED });
      expect(screen.getByRole("textbox", { name: "Note for Monday" })).toHaveValue("Use the good stock");
    });

    it("keeps the dinner select focused when its save lands", async () => {
      const { user, rerender } = renderCard({ meal: PLANNED });
      await user.selectOptions(dinnerSelect(), "Chickpea curry");
      rerender(<DayCard {...props({ meal: { ...PLANNED, recipeId: "r-curry" } })} />);

      expect(dinnerSelect()).toHaveFocus();
      expect(dinnerSelect()).toHaveValue("r-curry");
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
      await user.selectOptions(dinnerSelect(), "Chickpea curry");
      await waitFor(() => expect(actions.setPlannedMeal).toHaveBeenCalledTimes(1));

      // React has reset the form by now; the revalidated page brings the new meal.
      rerender(<DayCard {...props({ meal: { recipeId: "r-curry", customTitle: null, servings: 2, notes: null } })} />);
      expect(dinnerSelect()).toHaveValue("r-curry");
      expect(screen.getByLabelText("Serves")).toHaveValue(2);
    });

    it("follows a new meal from the server, e.g. another week", () => {
      const { rerender } = renderCard({ meal: PLANNED });
      rerender(<DayCard {...props({ meal: { recipeId: "r-curry", customTitle: null, servings: 4, notes: "Spicy" } })} />);

      expect(dinnerSelect()).toHaveValue("r-curry");
      expect(screen.getByLabelText("Serves")).toHaveValue(4);
      expect(screen.getByPlaceholderText("Note (optional)")).toHaveValue("Spicy");
    });

    it("follows a day being cleared on the server", () => {
      const { rerender } = renderCard({ meal: PLANNED });
      rerender(<DayCard {...props({ meal: null })} />);

      expect(dinnerSelect()).toHaveValue("");
      expect(screen.queryByLabelText("Serves")).not.toBeInTheDocument();
    });

    it("follows a custom meal arriving from the server", () => {
      const { rerender } = renderCard();
      rerender(<DayCard {...props({ meal: { recipeId: null, customTitle: "Eating out", servings: 2, notes: null } })} />);

      expect(dinnerSelect()).toHaveValue(CUSTOM_MEAL);
      expect(screen.getByPlaceholderText("Leftovers, takeaway, eating out…")).toHaveValue("Eating out");
    });

    it("keeps the user's pick while the server value has not changed", async () => {
      const { user, rerender } = renderCard({ meal: PLANNED });
      await user.selectOptions(dinnerSelect(), "Something else…");
      rerender(<DayCard {...props({ meal: PLANNED })} />);

      expect(screen.getByPlaceholderText("Leftovers, takeaway, eating out…")).toBeInTheDocument();
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

    it("has no axe violations with a custom meal", async () => {
      const { container } = renderCard({ meal: { recipeId: null, customTitle: "Pizza", servings: 2, notes: null } });
      await expectNoAxeViolations(container);
    });
  });
});
