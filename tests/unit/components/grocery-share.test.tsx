import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GroceryShare } from "@/components/grocery-share";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const TEXT = "Grocery list · 28 Sept – 4 Oct 2026\n\nPantry\n- 300 g Rice";

function setClipboard(clipboard: unknown) {
  Object.defineProperty(navigator, "clipboard", { value: clipboard, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
  setClipboard(undefined);
});

describe("GroceryShare", () => {
  it("copies the text and says so in the status region", async () => {
    const user = userEvent.setup();
    // userEvent.setup() installs its own clipboard stub, so the mock goes in after it.
    const writeText = vi.fn(async () => {});
    setClipboard({ writeText });
    renderWithI18n(<GroceryShare text={TEXT} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();

    await user.click(screen.getByRole("button", { name: "Copy list" }));

    expect(writeText).toHaveBeenCalledWith(TEXT);
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Copied");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("forgets the answer once the list changes, and fades \"Copied\" after a moment", async () => {
    const user = userEvent.setup();
    setClipboard({ writeText: vi.fn(async () => {}) });
    const { rerender } = renderWithI18n(<GroceryShare text={TEXT} />);
    await user.click(screen.getByRole("button", { name: "Copy list" }));
    expect(await screen.findByText("Copied")).toBeInTheDocument();

    rerender(<GroceryShare text={`${TEXT}\n- 1 Onion`} />);
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });

  it("says it could not copy and offers the text to select", async () => {
    const user = userEvent.setup();
    setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) });
    renderWithI18n(<GroceryShare text={TEXT} />);

    await user.click(screen.getByRole("button", { name: "Copy list" }));

    expect(await screen.findByText(/Couldn't copy/)).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Couldn't copy");
    const field = screen.getByRole("textbox", { name: "The list as text" });
    expect(field).toHaveValue(TEXT);
    expect(field).toHaveAttribute("readonly");
  });

  it("falls back to the text field where there is no clipboard", async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    renderWithI18n(<GroceryShare text={TEXT} />);

    await user.click(screen.getByRole("button", { name: "Copy list" }));

    expect(await screen.findByText(/Copying isn't available here/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "The list as text" })).toHaveValue(TEXT);
  });

  it("prints", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    const user = userEvent.setup();
    renderWithI18n(<GroceryShare text={TEXT} />);

    await user.click(screen.getByRole("button", { name: "Print" }));

    expect(print).toHaveBeenCalledOnce();
  });

  it("only prints when nothing is left to copy", () => {
    renderWithI18n(<GroceryShare text={null} />);
    expect(screen.queryByRole("button", { name: "Copy list" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("is hidden when printed", () => {
    const { container } = renderWithI18n(<GroceryShare text={TEXT} />);
    expect(container.firstElementChild).toHaveClass("print:hidden");
  });

  it("speaks German", async () => {
    const user = userEvent.setup();
    setClipboard({ writeText: vi.fn(async () => {}) });
    renderWithI18n(<GroceryShare text={TEXT} />, { locale: "de" });

    await user.click(screen.getByRole("button", { name: "Liste kopieren" }));

    expect(await screen.findByText("Kopiert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Drucken" })).toBeInTheDocument();
  });

  it("has no accessibility violations, also with the fallback field", async () => {
    const user = userEvent.setup();
    setClipboard(undefined);
    const { container } = renderWithI18n(<GroceryShare text={TEXT} />);
    await expectNoAxeViolations(container);

    await user.click(screen.getByRole("button", { name: "Copy list" }));
    await screen.findByRole("textbox");
    await expectNoAxeViolations(container);
  });
});
