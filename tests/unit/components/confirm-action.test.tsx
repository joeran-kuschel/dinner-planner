import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";
import { ConfirmAction, type ConfirmActionProps } from "@/components/confirm-action";

function renderConfirm(overrides: Partial<ConfirmActionProps> = {}, locale: "en" | "de" = "en") {
  const action = vi.fn<(formData: FormData) => Promise<void>>(async () => {});
  const user = userEvent.setup();
  const result = renderWithI18n(
    <ConfirmAction
      label="Delete"
      question="Delete “Mushroom risotto”?"
      confirmLabel="Delete recipe"
      action={action}
      fields={{ id: "r-risotto" }}
      {...overrides}
    />,
    { locale },
  );
  const details = result.container.querySelector("details")!;
  return { user, action, details, ...result };
}

// A <details> is a group itself, so the question's group is found by its name.
const question = () => screen.getByRole("group", { name: "Delete “Mushroom risotto”?" });
const summary = () => screen.getByText("Delete", { selector: "summary" });

describe("ConfirmAction", () => {
  it("shows only the asking button until it is opened", () => {
    const { details } = renderConfirm();
    expect(details.open).toBe(false);
    expect(summary()).toBeInTheDocument();
  });

  it("asks the question and offers the confirm and cancel buttons once opened", async () => {
    const { user } = renderConfirm();
    await user.click(summary());

    expect(question()).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete recipe" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("styles the asking button as a danger action and the confirming one as the solid danger button", async () => {
    const { user } = renderConfirm();
    expect(summary()).toHaveClass("btn-danger-quiet");
    expect(summary()).not.toHaveClass("btn-ghost", "btn-primary");

    await user.click(summary());
    expect(screen.getByRole("button", { name: "Delete recipe" })).toHaveClass("btn-danger");
    expect(screen.getByRole("button", { name: "Delete recipe" })).not.toHaveClass("btn-primary");
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveClass("btn-secondary");
  });

  it("does nothing until the confirm button is used", async () => {
    const { user, action } = renderConfirm();
    await user.click(summary());
    expect(action).not.toHaveBeenCalled();
  });

  it("runs the action with the hidden fields when confirmed", async () => {
    const { user, action } = renderConfirm({ fields: { id: "r-risotto", weekStart: "2026-09-28" } });
    await user.click(summary());
    await user.click(screen.getByRole("button", { name: "Delete recipe" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = action.mock.calls[0][0];
    expect(data.get("id")).toBe("r-risotto");
    expect(data.get("weekStart")).toBe("2026-09-28");
  });

  it("closes again on Cancel, without running the action, and puts the focus back on the asking button", async () => {
    const { user, action, details } = renderConfirm();
    await user.click(summary());
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(details.open).toBe(false);
    expect(summary()).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  it("closes on Escape from inside the question and puts the focus back", async () => {
    const { user, action, details } = renderConfirm();
    await user.click(summary());
    screen.getByRole("button", { name: "Delete recipe" }).focus();
    await user.keyboard("{Escape}");

    expect(details.open).toBe(false);
    expect(summary()).toHaveFocus();
    expect(action).not.toHaveBeenCalled();
  });

  // React handles events at the container, so an outer listener has to sit above it (on the
  // document) for stopPropagation to make a difference.
  function listenOutside() {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    return { outer, stop: () => document.removeEventListener("keydown", outer) };
  }

  it("leaves Escape alone while closed, so an enclosing dialog can still use it", async () => {
    const { outer, stop } = listenOutside();
    const { user } = renderConfirm();
    summary().focus();
    await user.keyboard("{Escape}");
    stop();

    expect(outer).toHaveBeenCalled();
  });

  it("keeps the Escape that closes the question from reaching anything around it", async () => {
    const { outer, stop } = listenOutside();
    const { user, details } = renderConfirm();
    await user.click(summary());
    screen.getByRole("button", { name: "Cancel" }).focus();
    await user.keyboard("{Escape}");
    stop();

    expect(details.open).toBe(false);
    expect(outer).not.toHaveBeenCalled();
  });

  it("closes again when the asking button is used a second time", async () => {
    const { user, details } = renderConfirm();
    await user.click(summary());
    await user.click(summary());
    expect(details.open).toBe(false);
  });

  it("can open upward for a button at the bottom of the page", async () => {
    const { user } = renderConfirm({ openUpward: true });
    await user.click(summary());
    expect(question()).toHaveClass("sm:bottom-full");
  });

  it("opens below by default", async () => {
    const { user } = renderConfirm();
    await user.click(summary());
    expect(question()).toHaveClass("sm:top-full");
  });

  describe("while the confirmed action runs", () => {
    it("turns the confirm button off, so a double click cannot run it twice", async () => {
      let finish!: () => void;
      const action = vi.fn<(formData: FormData) => Promise<void>>(() => new Promise((resolve) => (finish = resolve)));
      const { user } = renderConfirm({ action });
      await user.click(summary());
      const confirm = screen.getByRole("button", { name: "Delete recipe" });
      await user.dblClick(confirm);

      await waitFor(() => expect(confirm).toBeDisabled());
      expect(action).toHaveBeenCalledTimes(1);
      finish();
      await waitFor(() => expect(confirm).toBeEnabled());
    });
  });

  describe("handing on the focus", () => {
    function renderWithTarget() {
      const action = vi.fn<(formData: FormData) => Promise<void>>(async () => {});
      const user = userEvent.setup();
      const result = renderWithI18n(
        <>
          <h1 id="title" tabIndex={-1}>
            Title
          </h1>
          <ConfirmAction
            label="Delete"
            question="Delete “Mushroom risotto”?"
            confirmLabel="Delete recipe"
            action={action}
            fields={{ id: "r-risotto" }}
            focusAfter="title"
          />
        </>,
      );
      return { user, ...result };
    }

    it("focuses the target once a confirmed action takes the component away", async () => {
      const { user, rerender } = renderWithTarget();
      await user.click(summary());
      await user.click(screen.getByRole("button", { name: "Delete recipe" }));

      rerender(
        <h1 id="title" tabIndex={-1}>
          Title
        </h1>,
      );
      expect(screen.getByRole("heading", { name: "Title" })).toHaveFocus();
    });

    it("leaves the focus alone when the question was cancelled before the component goes", async () => {
      const { user, rerender } = renderWithTarget();
      await user.click(summary());
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      rerender(
        <h1 id="title" tabIndex={-1}>
          Title
        </h1>,
      );
      expect(screen.getByRole("heading", { name: "Title" })).not.toHaveFocus();
    });

    it("leaves the focus alone when the action was confirmed, the component stayed and the question was cancelled afterwards", async () => {
      const { user, rerender } = renderWithTarget();
      await user.click(summary());
      await user.click(screen.getByRole("button", { name: "Delete recipe" }));
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      rerender(
        <h1 id="title" tabIndex={-1}>
          Title
        </h1>,
      );
      expect(screen.getByRole("heading", { name: "Title" })).not.toHaveFocus();
    });
  });

  it("names Cancel in German", async () => {
    const { user } = renderConfirm({}, "de");
    await user.click(summary());
    expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  });

  it("has no accessibility violations, closed or open", async () => {
    const { user, container } = renderConfirm();
    await expectNoAxeViolations(container);
    await user.click(summary());
    await expectNoAxeViolations(container);
  });
});
