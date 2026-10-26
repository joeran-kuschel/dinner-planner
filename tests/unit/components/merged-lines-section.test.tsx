import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MergedLinesSection } from "@/components/merged-lines-section";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  unmergeGroceryLines: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
  unkeepGroceryName: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/groceries", () => actions);

const RULES = [
  { id: "r1", from: "Aubergine", to: "Eggplant" },
  { id: "r2", from: "Shallot", to: "Onion" },
];

const SEPARATE = [{ id: "k1", label: "Tomaten" }];

function renderSection(rules = RULES, locale: "en" | "de" = "en", separate: { id: string; label: string }[] = []) {
  const user = userEvent.setup();
  const result = renderWithI18n(<MergedLinesSection rules={rules} separate={separate} />, { locale });
  return { user, ...result };
}

const summary = () => screen.getByText("Merged lines", { selector: "summary" });

describe("MergedLinesSection", () => {
  it("is a closed disclosure with the number of merges in the summary", () => {
    const { container } = renderSection();
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    expect(summary()).toHaveTextContent("Merged lines 2 rules");
  });

  it("says '1 merge' for one", () => {
    renderSection([RULES[0]]);
    expect(summary()).toHaveTextContent("1 rule");
    expect(summary()).not.toHaveTextContent("1 rules");
  });

  it("lists each merge in words with an undo button that names it", () => {
    renderSection();
    const list = screen.getByRole("list", { name: "Merged lines" });
    const items = within(list).getAllByRole("listitem");
    expect(items.map((li) => li.querySelector("span")?.textContent)).toEqual([
      "Aubergine is listed as Eggplant",
      "Shallot is listed as Onion",
    ]);
    expect(within(list).getByRole("button", { name: "Undo merging Aubergine into Eggplant" })).toHaveTextContent("Undo");
  });

  it("says so when nothing is merged, without a count", () => {
    renderSection([]);
    expect(screen.getByText("Nothing merged yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
    expect(summary()).toHaveTextContent(/^Merged lines$/);
  });

  it("posts the rule's id to undo it", async () => {
    const { user } = renderSection();
    await user.click(screen.getByRole("button", { name: "Undo merging Shallot into Onion" }));

    expect(actions.unmergeGroceryLines).toHaveBeenCalledTimes(1);
    expect(actions.unmergeGroceryLines.mock.calls[0][0].get("id")).toBe("r2");
  });

  it("announces the undo politely and moves the focus to the summary", async () => {
    const { user } = renderSection();
    await user.click(screen.getByRole("button", { name: "Undo merging Aubergine into Eggplant" }));

    expect(screen.getByRole("status")).toHaveTextContent("Undid merging Aubergine into Eggplant");
    expect(summary()).toHaveFocus();
  });

  it("has an empty status until something is undone", () => {
    renderSection();
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("has no axe violations, with merges and without", async () => {
    const { container, unmount } = renderSection();
    await expectNoAxeViolations(container);
    unmount();
    const empty = renderSection([]);
    await expectNoAxeViolations(empty.container);
  });

  describe("in German", () => {
    it("reads in German and has no axe violations", async () => {
      const { container, user } = renderSection(RULES, "de");
      expect(screen.getByText("Zusammengeführte Zeilen", { selector: "summary" })).toHaveTextContent("2 Regeln");
      expect(screen.getByText("Aubergine steht als Eggplant auf der Liste")).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Zusammenführung von Aubergine mit Eggplant rückgängig machen" }));
      expect(screen.getByRole("status")).toHaveTextContent("Zusammenführung von Aubergine mit Eggplant rückgängig gemacht");
      await expectNoAxeViolations(container);
    });

    it("says nothing is merged", () => {
      renderSection([], "de");
      expect(screen.getByText("Noch nichts zusammengeführt.")).toBeInTheDocument();
    });
  });
});

describe("MergedLinesSection: names kept on their own line", () => {
  it("counts them with the merges", () => {
    renderSection(RULES, "en", SEPARATE);
    expect(summary()).toHaveTextContent("Merged lines 3 rules");
  });

  it("lists each in words with an undo that names it, apart from the merges", () => {
    renderSection(RULES, "en", SEPARATE);
    const list = screen.getByRole("list", { name: "Lines kept apart" });
    expect(within(list).getByText("Tomaten is kept on its own line")).toBeInTheDocument();
    expect(within(list).getByRole("button", { name: "Undo keeping Tomaten on its own line" })).toBeInTheDocument();
  });

  it("says nothing merged only when there is neither", () => {
    renderSection([], "en", SEPARATE);
    expect(screen.queryByText("Nothing merged yet.")).not.toBeInTheDocument();
    renderSection([], "en", []);
    expect(screen.getByText("Nothing merged yet.")).toBeInTheDocument();
  });

  it("undoes by id and moves the focus to the summary with an announcement", async () => {
    const { user } = renderSection([], "en", SEPARATE);
    await user.click(screen.getByRole("button", { name: "Undo keeping Tomaten on its own line" }));

    await vi.waitFor(() => expect(actions.unkeepGroceryName).toHaveBeenCalledTimes(1));
    expect(actions.unkeepGroceryName.mock.calls[0][0].get("id")).toBe("k1");
    expect(summary()).toHaveFocus();
    expect(screen.getByRole("status")).toHaveTextContent("Tomaten may be merged again");
  });

  it("has no axe violations and says it in German", async () => {
    const { container } = renderSection(RULES, "de", SEPARATE);
    expect(screen.getByRole("list", { name: "Getrennt gehaltene Zeilen" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
