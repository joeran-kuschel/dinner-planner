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

  it("leaves Escape alone while closed", async () => {
    const outer = vi.fn();
    const { user, details } = renderConfirm();
    details.parentElement!.addEventListener("keydown", outer);
    summary().focus();
    await user.keyboard("{Escape}");

    expect(outer).toHaveBeenCalled();
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
    expect(question()).toHaveClass("bottom-full");
  });

  it("opens below by default", async () => {
    const { user } = renderConfirm();
    await user.click(summary());
    expect(question()).toHaveClass("top-full");
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
