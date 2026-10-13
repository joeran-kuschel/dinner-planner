import { act, screen } from "@testing-library/react";
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

  describe("closing the fallback box", () => {
    async function openBox(locale?: "de") {
      const user = userEvent.setup();
      setClipboard(undefined);
      const { container } = renderWithI18n(<GroceryShare text={TEXT} />, locale ? { locale } : undefined);
      await user.click(screen.getByRole("button", { name: locale ? "Liste kopieren" : "Copy list" }));
      await screen.findByRole("textbox");
      return { user, container };
    }

    it("closes with the Close button, returns the focus to Copy list and says so", async () => {
      const { user } = await openBox();
      await user.click(screen.getByRole("button", { name: "Close" }));
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy list" })).toHaveFocus();
      expect(screen.getByRole("status")).toHaveTextContent("Closed the list as text.");
    });

    it("closes with Escape, also after a failed copy", async () => {
      const user = userEvent.setup();
      setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) });
      renderWithI18n(<GroceryShare text={TEXT} />);
      await user.click(screen.getByRole("button", { name: "Copy list" }));
      await user.click(await screen.findByRole("textbox"));
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy list" })).toHaveFocus();
    });

    it("closes with Escape from the icon button and from Close too, not only from the text", async () => {
      const { user } = await openBox();
      screen.getByRole("button", { name: "Copy to clipboard" }).focus();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy list" })).toHaveFocus();

      await user.click(screen.getByRole("button", { name: "Copy list" }));
      screen.getByRole("button", { name: "Close" }).focus();
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    });

    it("does nothing on Escape while there is no box", async () => {
      const user = userEvent.setup();
      setClipboard({ writeText: vi.fn(async () => {}) });
      renderWithI18n(<GroceryShare text={TEXT} />);
      screen.getByRole("button", { name: "Copy list" }).focus();
      await user.keyboard("{Escape}");
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("drops an open box, and the closed message, when the list changes", async () => {
      const user = userEvent.setup();
      setClipboard(undefined);
      const { rerender } = renderWithI18n(<GroceryShare text={TEXT} />);
      // The box belongs to the list it shows: another list is another answer.
      await user.click(screen.getByRole("button", { name: "Copy list" }));
      expect(await screen.findByRole("textbox")).toBeInTheDocument();
      rerender(<GroceryShare text={`${TEXT}\n- 1 Onion`} />);
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();

      await user.click(screen.getByRole("button", { name: "Copy list" }));
      await user.click(await screen.findByRole("button", { name: "Close" }));
      expect(screen.getByRole("status")).toHaveTextContent("Closed the list as text.");
      rerender(<GroceryShare text={TEXT} />);
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });

    it("fades the closed message after a moment, like Copied", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      try {
        const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
        setClipboard(undefined);
        renderWithI18n(<GroceryShare text={TEXT} />);
        await user.click(screen.getByRole("button", { name: "Copy list" }));
        await user.click(await screen.findByRole("button", { name: "Close" }));
        expect(screen.getByRole("status")).toHaveTextContent("Closed the list as text.");
        await act(async () => {
          vi.advanceTimersByTime(4100);
        });
        expect(screen.getByRole("status")).toBeEmptyDOMElement();
      } finally {
        vi.useRealTimers();
      }
    });

    it("selects the text from the icon button where there is no clipboard", async () => {
      const { user } = await openBox();
      const field = screen.getByRole("textbox") as HTMLTextAreaElement;
      await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
      expect(field).toHaveFocus();
      expect(field.selectionStart).toBe(0);
      expect(field.selectionEnd).toBe(TEXT.length);
      expect(screen.getByRole("status")).toHaveTextContent("Copying isn't available here");
    });

    it("copies from the icon button, closes the box and moves the focus to Copy list", async () => {
      const { user } = await openBox();
      const writeText = vi.fn(async () => {});
      setClipboard({ writeText });
      await user.click(screen.getByRole("button", { name: "Copy to clipboard" }));
      expect(writeText).toHaveBeenCalledWith(TEXT);
      expect(screen.getByRole("status")).toHaveTextContent("Copied");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Copy list" })).toHaveFocus();
    });

    it("removes the box when a later Copy list works", async () => {
      const { user } = await openBox();
      setClipboard({ writeText: vi.fn(async () => {}) });
      await user.click(screen.getByRole("button", { name: "Copy list" }));
      expect(await screen.findByText("Copied")).toBeInTheDocument();
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    });

    it("speaks German in the box", async () => {
      const { user } = await openBox("de");
      expect(screen.getByRole("button", { name: "In die Zwischenablage kopieren" })).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Schließen" }));
      expect(screen.getByRole("status")).toHaveTextContent("Die Liste als Text wurde geschlossen.");
    });

    it("closes with Escape in German too, and after a failed copy says so in German", async () => {
      const user = userEvent.setup();
      setClipboard({ writeText: vi.fn(async () => Promise.reject(new Error("denied"))) });
      renderWithI18n(<GroceryShare text={TEXT} />, { locale: "de" });
      await user.click(screen.getByRole("button", { name: "Liste kopieren" }));
      expect(await screen.findByText("Kopieren hat nicht geklappt. Markiere stattdessen den Text unten.")).toBeInTheDocument();
      await user.click(screen.getByRole("textbox"));
      await user.keyboard("{Escape}");
      expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toHaveTextContent("Die Liste als Text wurde geschlossen.");
    });

    it("has no accessibility violations", async () => {
      const { container } = await openBox();
      await expectNoAxeViolations(container);
    });
  });
});
