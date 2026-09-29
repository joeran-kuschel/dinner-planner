import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";
import { LanguageSwitcher } from "@/components/language-switcher";

const actions = vi.hoisted(() => ({ setLocale: vi.fn<(formData: FormData) => Promise<void>>(async () => {}) }));
vi.mock("@/app/actions/locale", () => actions);

function renderSwitcher(locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  return { user, ...renderWithI18n(<LanguageSwitcher />, { locale }) };
}

describe("LanguageSwitcher", () => {
  it("offers each language by its own name, in its own language", () => {
    renderSwitcher();
    const english = screen.getByRole("button", { name: "English" });
    const german = screen.getByRole("button", { name: "Deutsch" });
    expect(english).toHaveAttribute("lang", "en");
    expect(german).toHaveAttribute("lang", "de");
  });

  it.each([
    ["en", "Language", "English", "Deutsch"],
    ["de", "Sprache", "Deutsch", "English"],
  ] as const)("in %s, groups the buttons as %j and marks %s as the current one", (locale, group, current, other) => {
    renderSwitcher(locale);
    expect(screen.getByRole("group", { name: group })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: current })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: other })).toHaveAttribute("aria-pressed", "false");
  });

  it("asks the server to switch to the language that was pressed", async () => {
    const { user } = renderSwitcher();
    await user.click(screen.getByRole("button", { name: "Deutsch" }));
    await waitFor(() => expect(actions.setLocale).toHaveBeenCalledTimes(1));
    expect(actions.setLocale.mock.calls[0][0].get("locale")).toBe("de");
  });

  it("can be used with the keyboard", async () => {
    const { user } = renderSwitcher();
    await user.tab();
    await user.tab();
    expect(screen.getByRole("button", { name: "Deutsch" })).toHaveFocus();
    await user.keyboard("{Enter}");
    await waitFor(() => expect(actions.setLocale).toHaveBeenCalledTimes(1));
    expect(actions.setLocale.mock.calls[0][0].get("locale")).toBe("de");
  });

  it("has no axe violations", async () => {
    const { container } = renderSwitcher("de");
    await expectNoAxeViolations(container);
  });
});
