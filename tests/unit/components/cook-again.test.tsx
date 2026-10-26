import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { COOK_AGAIN_TITLE_ID, CookAgain, type CookAgainProps } from "@/components/cook-again";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  planFreeDay: vi.fn<(formData: FormData) => Promise<"planned" | "occupied">>(async () => "planned"),
  planFreeDayFromForm: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/meals", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

const SUGGESTIONS: CookAgainProps["suggestions"] = [
  { id: "r1", name: "Chickpea curry", favorite: true, daysSince: 35 },
  { id: "r2", name: "Roast lamb", favorite: false, daysSince: null },
];
const DAYS = [
  { key: "2026-10-28", label: "Wednesday 28 Oct" },
  { key: "2026-10-30", label: "Friday 30 Oct" },
];

function renderSection(props: Partial<CookAgainProps> = {}, locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  const result = renderWithI18n(<CookAgain suggestions={SUGGESTIONS} freeDays={DAYS} {...props} />, { locale });
  return { user, ...result };
}

describe("CookAgain", () => {
  it("is a region named by its heading, with a row for each suggestion and what it knows about it", () => {
    renderSection();
    const region = screen.getByRole("region", { name: "Cook again" });
    expect(within(region).getByRole("heading", { level: 2, name: "Cook again" })).toBeInTheDocument();
    expect(within(region).getByText("Favorites and recipes you have not planned for a while.")).toBeInTheDocument();
    expect(within(region).getAllByRole("listitem")).toHaveLength(2);
    expect(within(region).getByText("Favorite · last planned 5 weeks ago")).toBeInTheDocument();
    expect(within(region).getByText("never planned")).toBeInTheDocument();
  });

  it("collapses to its heading and opens again, the heading's button saying which it is", async () => {
    const { user } = renderSection();
    const toggle = screen.getByRole("button", { name: "Cook again" });
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(toggle).toHaveAttribute("aria-controls", screen.getByRole("list").id);

    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(screen.queryByText("Favorites and recipes you have not planned for a while.")).not.toBeInTheDocument();

    await user.keyboard("{Enter}");
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });

  it("is not there without a suggestion, or without a free day to plan it on", () => {
    const { container, rerender } = renderSection({ suggestions: [] });
    expect(container).toBeEmptyDOMElement();
    rerender(<CookAgain suggestions={SUGGESTIONS} freeDays={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("offers the free days of each recipe, the first one chosen, with a label a screen reader reads", () => {
    renderSection();
    const select = screen.getByRole("combobox", { name: "Day for Chickpea curry" });
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Wednesday 28 Oct", "Friday 30 Oct"]);
    expect(select).toHaveValue("2026-10-28");
    expect(screen.getByRole("button", { name: "Plan Chickpea curry" })).toHaveTextContent("Plan");
  });

  it("plans the recipe by its id on the chosen day, with no name that could point at another recipe", async () => {
    actions.planFreeDay.mockClear();
    const { user } = renderSection();
    await user.selectOptions(screen.getByRole("combobox", { name: "Day for Roast lamb" }), "2026-10-30");
    await user.click(screen.getByRole("button", { name: "Plan Roast lamb" }));

    await waitFor(() => expect(actions.planFreeDay).toHaveBeenCalledTimes(1));
    // No `dinner`: a recipe renamed meanwhile is still the one that was picked. The servings are the action's default.
    expect(Object.fromEntries(actions.planFreeDay.mock.calls[0][0])).toEqual({ recipeId: "r2", day: "2026-10-30" });
  });

  it("says so, keeps the row and gives the focus back to the day choice when the day was planned meanwhile", async () => {
    actions.planFreeDay.mockResolvedValueOnce("occupied");
    router.refresh.mockClear();
    const { user } = renderSection();
    await user.click(screen.getByRole("button", { name: "Plan Chickpea curry" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("That day has been planned in the meantime. Pick another day.");
    const select = screen.getByRole("combobox", { name: "Day for Chickpea curry" });
    expect(select).toHaveFocus();
    expect(select).toHaveAttribute("aria-invalid", "true");
    expect(select).toHaveAccessibleDescription("That day has been planned in the meantime. Pick another day.");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("says it could not plan when the action fails, for instance for a recipe that is gone", async () => {
    actions.planFreeDay.mockRejectedValueOnce(new Error("unknown recipeId"));
    const { user } = renderSection();
    await user.click(screen.getByRole("button", { name: "Plan Chickpea curry" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not plan this recipe. Reload the page and try again.");
  });

  it("clears the message when the visitor tries again", async () => {
    actions.planFreeDay.mockResolvedValueOnce("occupied");
    const { user } = renderSection();
    await user.click(screen.getByRole("button", { name: "Plan Chickpea curry" }));
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Plan Chickpea curry" }));
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
  });

  it("does not post twice while the first is under way", async () => {
    actions.planFreeDay.mockClear();
    let finish!: () => void;
    actions.planFreeDay.mockImplementationOnce(() => new Promise((resolve) => (finish = () => resolve("planned"))));
    const { user } = renderSection();
    const button = screen.getByRole("button", { name: "Plan Chickpea curry" });
    await user.click(button);
    await user.click(button);

    expect(actions.planFreeDay).toHaveBeenCalledTimes(1);
    expect(button).toHaveAttribute("aria-disabled", "true");
    finish();
  });

  it("sends the focus to the heading before the row goes away", async () => {
    const { user } = renderSection();
    await user.click(screen.getByRole("button", { name: "Plan Chickpea curry" }));
    expect(document.getElementById(COOK_AGAIN_TITLE_ID)).toHaveFocus();
  });

  it("sends the focus to the planned day's dinner field when the last free day is used, though other rows remain: the section goes", async () => {
    const { user } = renderSection({ freeDays: [DAYS[1]] });
    const field = document.createElement("input");
    field.id = "dinner-2026-10-30";
    document.body.append(field);
    await user.click(screen.getByRole("button", { name: "Plan Chickpea curry" }));

    expect(field).toHaveFocus();
    expect(document.getElementById(COOK_AGAIN_TITLE_ID)).not.toHaveFocus();
    field.remove();
  });

  it("sends the focus to the planned day's dinner field when it is the last row, since the section goes with it", async () => {
    const { user } = renderSection({ suggestions: [SUGGESTIONS[0]] });
    const field = document.createElement("input");
    field.id = "dinner-2026-10-30";
    document.body.append(field);
    await user.selectOptions(screen.getByRole("combobox", { name: "Day for Chickpea curry" }), "2026-10-30");
    await user.click(screen.getByRole("button", { name: "Plan Chickpea curry" }));

    expect(field).toHaveFocus();
    field.remove();
  });

  it("is a plain form for a browser without JavaScript", () => {
    renderSection();
    expect(screen.getByRole("button", { name: "Plan Chickpea curry" }).closest("form")).toHaveAttribute("action");
  });

  it("has no axe violations and says it in German", async () => {
    const { container } = renderSection({}, "de");
    expect(screen.getByRole("region", { name: "Nochmal kochen" })).toBeInTheDocument();
    expect(screen.getByText("Favorit · zuletzt geplant vor 5 Wochen")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Chickpea curry planen" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
