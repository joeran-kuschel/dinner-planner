import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MergeLineButton, type MergeTarget } from "@/components/merge-lines-dialog";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { polyfillDialog } from "@/tests/support/dialog";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  mergeGroceryLines: vi.fn<(formData: FormData) => Promise<"merged" | "invalid" | "limit">>(async () => "merged"),
}));
vi.mock("@/app/actions/groceries", () => actions);

beforeAll(() => polyfillDialog());
beforeEach(() => {
  actions.mergeGroceryLines.mockReset();
  actions.mergeGroceryLines.mockResolvedValue("merged");
});

const TARGETS: MergeTarget[] = [
  { key: "~tomato|g", nameId: "~tomato", label: "Tomato", amount: "500 g" },
  { key: "cherries|g", nameId: "cherries", label: "Cherries", amount: "to taste" },
];

function renderButton(locale: "en" | "de" = "en", targets = TARGETS) {
  const user = userEvent.setup();
  const onMerged = vi.fn();
  const result = renderWithI18n(
    <MergeLineButton from={{ nameId: "tomatillo", label: "Tomatillo" }} targets={targets} onMerged={onMerged} />,
    { locale },
  );
  return { user, onMerged, ...result };
}

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;
const openButton = (name = "Merge Tomatillo with another line") => screen.getByRole("button", { name });
const confirm = () => within(dialog()).getByRole("button", { name: /^(Merge|Zusammenführen)$/ });

describe("MergeLineButton", () => {
  it("is an icon button that names the line and announces a dialog", () => {
    renderButton();
    expect(openButton()).toHaveAttribute("aria-haspopup", "dialog");
    expect(openButton()).toHaveAttribute("title", "Merge");
  });

  it("renders no dialog content while closed", () => {
    renderButton();
    expect(dialog()).not.toHaveAttribute("open");
    expect(dialog().querySelector("input")).toBeNull();
  });

  it("opens a modal dialog with the other lines as radios and their amounts", async () => {
    const { user } = renderButton();
    await user.click(openButton());

    expect(dialog()).toHaveAttribute("open");
    expect(screen.getByRole("dialog", { name: "Merge Tomatillo" })).toBeInTheDocument();
    const radios = within(dialog()).getAllByRole("radio");
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual(["Tomato500 g", "Cherriesto taste"]);
    expect(radios.every((r) => !(r as HTMLInputElement).checked)).toBe(true);
    expect(within(dialog()).getByRole("group", { name: "List it as" })).toBeInTheDocument();
  });

  it("keeps Merge unavailable until a line is chosen, and then says what will happen", async () => {
    const { user } = renderButton();
    await user.click(openButton());

    expect(confirm()).toHaveAttribute("aria-disabled", "true");
    await user.click(confirm());
    expect(actions.mergeGroceryLines).not.toHaveBeenCalled();
    expect(within(dialog()).getByRole("status")).toBeEmptyDOMElement();

    await user.click(within(dialog()).getByRole("radio", { name: /Tomato/ }));

    expect(confirm()).not.toHaveAttribute("aria-disabled");
    expect(within(dialog()).getByRole("status")).toHaveTextContent("Tomatillo will be listed as Tomato.");
  });

  it("posts the name ids and labels, closes and reports the line that remains", async () => {
    const { user, onMerged } = renderButton();
    await user.click(openButton());
    await user.click(within(dialog()).getByRole("radio", { name: /Cherries/ }));

    await user.click(confirm());

    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    const posted = actions.mergeGroceryLines.mock.calls[0][0];
    expect(Object.fromEntries(posted)).toEqual({ from: "tomatillo", fromLabel: "Tomatillo", to: "cherries", toLabel: "Cherries" });
    expect(onMerged).toHaveBeenCalledWith("Tomatillo", TARGETS[1]);
  });

  it("cancels without saving, and starts without a choice the next time", async () => {
    const { user, onMerged } = renderButton();
    await user.click(openButton());
    await user.click(within(dialog()).getByRole("radio", { name: /Tomato/ }));

    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    expect(dialog()).not.toHaveAttribute("open");
    expect(actions.mergeGroceryLines).not.toHaveBeenCalled();
    expect(onMerged).not.toHaveBeenCalled();
    expect(dialog().querySelector("input")).toBeNull();

    await user.click(openButton());
    expect(within(dialog()).getAllByRole("radio").every((r) => !(r as HTMLInputElement).checked)).toBe(true);
  });

  it("can be used with the keyboard alone", async () => {
    const { user, onMerged } = renderButton();
    openButton().focus();
    await user.keyboard("{Enter}");
    const first = within(dialog()).getAllByRole("radio")[0];
    first.focus();
    await user.keyboard(" ");
    expect(first).toBeChecked();
    confirm().focus();
    await user.keyboard("{Enter}");

    await waitFor(() => expect(onMerged).toHaveBeenCalledWith("Tomatillo", TARGETS[0]));
  });

  it("stays open with an alert when the lines cannot be merged", async () => {
    actions.mergeGroceryLines.mockResolvedValue("invalid");
    const { user, onMerged } = renderButton();
    await user.click(openButton());
    await user.click(within(dialog()).getAllByRole("radio")[0]);

    await user.click(confirm());

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("These lines cannot be merged. Please try again.");
    expect(dialog()).toHaveAttribute("open");
    expect(onMerged).not.toHaveBeenCalled();
  });

  it("says when there are too many merges", async () => {
    actions.mergeGroceryLines.mockResolvedValue("limit");
    const { user } = renderButton();
    await user.click(openButton());
    await user.click(within(dialog()).getAllByRole("radio")[0]);

    await user.click(confirm());

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("There are too many merges already.");
    expect(dialog()).toHaveAttribute("open");
  });

  it("shows an alert when the action throws", async () => {
    actions.mergeGroceryLines.mockRejectedValue(new Error("network"));
    const { user, onMerged } = renderButton();
    await user.click(openButton());
    await user.click(within(dialog()).getAllByRole("radio")[0]);

    await user.click(confirm());

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("cannot be merged");
    expect(onMerged).not.toHaveBeenCalled();
  });

  it("clears an earlier error when it opens again", async () => {
    actions.mergeGroceryLines.mockResolvedValue("invalid");
    const { user } = renderButton();
    await user.click(openButton());
    await user.click(within(dialog()).getAllByRole("radio")[0]);
    await user.click(confirm());
    await within(dialog()).findByRole("alert");
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    await user.click(openButton());

    expect(within(dialog()).queryByRole("alert")).not.toBeInTheDocument();
  });

  it("gives two buttons in one list ids of their own", async () => {
    const user = userEvent.setup();
    const { container } = renderWithI18n(
      <>
        <MergeLineButton from={{ nameId: "a", label: "A" }} targets={TARGETS} onMerged={vi.fn()} />
        <MergeLineButton from={{ nameId: "b", label: "B" }} targets={TARGETS} onMerged={vi.fn()} />
      </>,
    );
    await user.click(screen.getByRole("button", { name: "Merge A with another line" }));
    const dialogs = [...document.querySelectorAll("dialog")];
    const ids = dialogs.flatMap((d) => [d.getAttribute("aria-labelledby"), d.getAttribute("aria-describedby")]);
    expect(new Set(ids).size).toBe(ids.length);
    const all = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(all).size).toBe(all.length);
    await expectNoAxeViolations(container);
  });

  it("has no axe violations, closed and open", async () => {
    const { user, container } = renderButton();
    await expectNoAxeViolations(container);
    await user.click(openButton());
    await user.click(within(dialog()).getAllByRole("radio")[0]);
    await expectNoAxeViolations(container);
  });

  describe("in German", () => {
    it("is labelled, opened and confirmed in German", async () => {
      const { user, onMerged } = renderButton("de");
      await user.click(screen.getByRole("button", { name: "Tomatillo mit einer anderen Zeile zusammenführen" }));

      expect(screen.getByRole("dialog", { name: "Tomatillo zusammenführen" })).toBeInTheDocument();
      expect(within(dialog()).getByRole("group", { name: "Aufführen als" })).toBeInTheDocument();
      await user.click(within(dialog()).getAllByRole("radio")[0]);
      expect(within(dialog()).getByRole("status")).toHaveTextContent("Tomatillo steht künftig als Tomato auf der Liste.");

      await user.click(confirm());
      await waitFor(() => expect(onMerged).toHaveBeenCalled());
    });

    it("has no axe violations", async () => {
      const { user, container } = renderButton("de");
      await user.click(screen.getByRole("button", { name: /zusammenführen/ }));
      await expectNoAxeViolations(container);
    });
  });
});
