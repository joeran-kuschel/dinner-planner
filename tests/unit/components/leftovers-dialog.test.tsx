import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LeftoversButton, takeLeftoversFocus } from "@/components/leftovers-dialog";
import type { LeftoverSource } from "@/lib/leftovers";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { polyfillDialog } from "@/tests/support/dialog";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  setLeftovers: vi.fn<(formData: FormData) => Promise<"saved" | "changed">>(async () => "saved"),
}));
vi.mock("@/app/actions/meals", () => actions);

const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeAll(() => polyfillDialog());
beforeEach(() => {
  takeLeftoversFocus("2026-09-30"); // module state: an earlier test's save leaves the focus claim behind
  actions.setLeftovers.mockClear();
  actions.setLeftovers.mockResolvedValue("saved");
  router.refresh.mockClear();
});

const SOURCES: LeftoverSource[] = [
  { key: "2026-09-29", weekday: "Tuesday", dateLabel: "29 Sep", title: "Mushroom risotto" },
  { key: "2026-09-28", weekday: "Monday", dateLabel: "28 Sep", title: "Chickpea curry" },
];

function renderButton(sources = SOURCES, locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  const result = renderWithI18n(
    <LeftoversButton dayKey="2026-09-30" weekday={locale === "en" ? "Wednesday" : "Mittwoch"} sources={sources} />,
    { locale },
  );
  return { user, ...result };
}

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;
const open = (user: ReturnType<typeof userEvent.setup>, name = "Leftovers on Wednesday") =>
  user.click(screen.getByRole("button", { name }));
const save = () => within(dialog()).getByRole("button", { name: "Save" });

describe("LeftoversButton", () => {
  it("names the day it makes leftovers", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Leftovers on Wednesday" })).toHaveTextContent("Leftovers");
  });

  it("opens a modal dialog listing the earlier dinners, the nearest first, with their days", async () => {
    const { user } = renderButton();
    await open(user);

    expect(screen.getByRole("dialog", { name: "Leftovers on Wednesday" })).toBeInTheDocument();
    const radios = within(dialog()).getAllByRole("radio");
    expect(radios.map((radio) => radio.closest("label")?.textContent)).toEqual(["Mushroom risottoTuesday 29 Sep", "Chickpea curryMonday 28 Sep"]);
    expect(radios.every((radio) => !(radio as HTMLInputElement).checked)).toBe(true);
    expect(within(dialog()).getByText(/raise “Serves” on that dinner/)).toBeInTheDocument();
  });

  it("saves the chosen dinner for this day and closes", async () => {
    const { user } = renderButton();
    await open(user);

    await user.click(within(dialog()).getByRole("radio", { name: /Chickpea curry/ }));
    await user.click(save());

    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    const posted = actions.setLeftovers.mock.calls[0][0];
    expect(posted.get("day")).toBe("2026-09-30");
    expect(posted.get("from")).toBe("2026-09-28");
  });

  it("saves nothing until a dinner is chosen", async () => {
    const { user } = renderButton();
    await open(user);

    expect(save()).toHaveAttribute("aria-disabled", "true");
    await user.click(save());

    expect(actions.setLeftovers).not.toHaveBeenCalled();
    expect(dialog()).toHaveAttribute("open");
  });

  it("starts without a choice every time it opens", async () => {
    const { user } = renderButton();
    await open(user);
    await user.click(within(dialog()).getByRole("radio", { name: /Mushroom/ }));
    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    await open(user);

    expect(within(dialog()).getByRole("radio", { name: /Mushroom/ })).not.toBeChecked();
  });

  it("cancels without saving", async () => {
    const { user } = renderButton();
    await open(user);

    await user.click(within(dialog()).getByRole("button", { name: "Cancel" }));

    expect(dialog()).not.toHaveAttribute("open");
    expect(actions.setLeftovers).not.toHaveBeenCalled();
  });

  it("says so when no dinner is planned in the six days before, and offers no choice", async () => {
    const { user } = renderButton([]);
    await open(user);

    expect(within(dialog()).getByText("No dinner is planned in the six days before this one.")).toBeInTheDocument();
    expect(within(dialog()).queryByRole("radio")).not.toBeInTheDocument();
    expect(save()).toHaveAttribute("aria-disabled", "true");
  });

  it("hands the focus to the card that replaces the empty one, once, after a save", async () => {
    const { user } = renderButton();
    expect(takeLeftoversFocus("2026-09-30")).toBe(false);
    await open(user);

    await user.click(within(dialog()).getByRole("radio", { name: /Mushroom/ }));
    await user.click(save());

    await waitFor(() => expect(dialog()).not.toHaveAttribute("open"));
    expect(takeLeftoversFocus("2026-10-01")).toBe(false);
    expect(takeLeftoversFocus("2026-09-30")).toBe(true);
    expect(takeLeftoversFocus("2026-09-30")).toBe(false);
  });

  it("stays open with an alert and refreshes when the plan changed in the meantime", async () => {
    actions.setLeftovers.mockResolvedValue("changed");
    const { user } = renderButton();
    await open(user);

    await user.click(within(dialog()).getByRole("radio", { name: /Mushroom/ }));
    await user.click(save());

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("The plan changed in the meantime");
    expect(dialog()).toHaveAttribute("open");
    expect(router.refresh).toHaveBeenCalled();
  });

  it("stays open with an alert when saving fails", async () => {
    actions.setLeftovers.mockRejectedValue(new Error("boom"));
    const { user } = renderButton();
    await open(user);

    await user.click(within(dialog()).getByRole("radio", { name: /Mushroom/ }));
    await user.click(save());

    expect(await within(dialog()).findByRole("alert")).toHaveTextContent("could not be saved");
    expect(dialog()).toHaveAttribute("open");
  });

  it("has no form of its own, since it sits inside the day card's form", () => {
    const { container } = renderButton();
    expect(container.querySelector("form")).toBeNull();
    // The radios are named (for the arrow keys) and share one name, which the card's action does not read.
    const names = new Set([...dialog().querySelectorAll("input[name]")].map((input) => input.getAttribute("name")));
    expect(names).toEqual(new Set(["leftovers-from-2026-09-30"]));
  });

  it("has no accessibility violations, open or closed", async () => {
    const { container, user } = renderButton();
    await expectNoAxeViolations(container);
    await open(user);
    await expectNoAxeViolations(container);
  });

  it("speaks German", async () => {
    const { user } = renderButton(SOURCES, "de");
    await open(user, "Reste am Mittwoch");

    expect(screen.getByRole("dialog", { name: "Reste am Mittwoch" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("group", { name: "Den Rest essen von" })).toBeInTheDocument();
    expect(within(dialog()).getByRole("button", { name: "Speichern" })).toBeInTheDocument();
  });
});
