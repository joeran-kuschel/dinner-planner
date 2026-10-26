import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FavoriteButton, type FavoriteButtonProps } from "@/components/favorite-button";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const actions = vi.hoisted(() => ({
  setRecipeFavorite: vi.fn<(formData: FormData) => Promise<void>>(async () => {}),
}));
vi.mock("@/app/actions/recipes", () => actions);

function renderButton(props: Partial<FavoriteButtonProps> = {}, locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  const result = renderWithI18n(<FavoriteButton id="r1" name="Chickpea curry" favorite={false} variant="button" {...props} />, { locale });
  return { user, ...result };
}

describe("FavoriteButton: the button on the recipe page", () => {
  it("is a toggle named Favorite, not pressed while the recipe is no favorite", () => {
    renderButton();
    const button = screen.getByRole("button", { name: "Favorite" });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button).toHaveTextContent("Favorite");
  });

  it("is pressed for a favorite, with a filled star and the tint, and still has the same name", () => {
    const { container } = renderButton({ favorite: true });
    const button = screen.getByRole("button", { name: "Favorite" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button.className).toContain("bg-accent-soft");
    expect(container.querySelector("svg")).toHaveAttribute("fill", "currentColor");
  });

  it("draws an outline star when it is off, and the star is decorative", () => {
    const { container } = renderButton();
    const star = container.querySelector("svg")!;
    expect(star).toHaveAttribute("fill", "none");
    expect(star).toHaveAttribute("aria-hidden", "true");
  });

  it("posts the recipe and the opposite of what it is now", async () => {
    const { user } = renderButton({ favorite: false });
    await user.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() => expect(actions.setRecipeFavorite).toHaveBeenCalledTimes(1));
    const data = actions.setRecipeFavorite.mock.calls[0][0];
    expect([data.get("id"), data.get("favorite")]).toEqual(["r1", "true"]);
  });

  it("takes the mark off a favorite", async () => {
    actions.setRecipeFavorite.mockClear();
    const { user } = renderButton({ favorite: true });
    await user.click(screen.getByRole("button", { name: "Favorite" }));

    await waitFor(() => expect(actions.setRecipeFavorite).toHaveBeenCalledTimes(1));
    expect(actions.setRecipeFavorite.mock.calls[0][0].get("favorite")).toBe("false");
  });

  it("keeps the keyboard focus while the save runs: it is not disabled", async () => {
    let finish!: () => void;
    actions.setRecipeFavorite.mockImplementationOnce(() => new Promise<void>((resolve) => (finish = resolve)));
    const { user } = renderButton();
    const button = screen.getByRole("button", { name: "Favorite" });
    await user.click(button);

    await waitFor(() => expect(button).toHaveAttribute("aria-disabled", "true"));
    expect(button).toBeEnabled();
    expect(button).toHaveFocus();
    finish();
  });

  it("is a plain form with the action, for a browser without JavaScript", () => {
    renderButton();
    expect(screen.getByRole("button", { name: "Favorite" }).closest("form")).toHaveAttribute("action");
  });

  it("has no axe violations, off or on, and says it in German", async () => {
    const { container } = renderButton({ favorite: true }, "de");
    expect(screen.getByRole("button", { name: "Favorit" })).toHaveAttribute("aria-pressed", "true");
    await expectNoAxeViolations(container);
  });
});

describe("FavoriteButton: the star on a list card", () => {
  it("is named after the recipe, since a list has many, and is a toggle", () => {
    renderButton({ variant: "star" });
    const star = screen.getByRole("button", { name: "Favorite Chickpea curry" });
    expect(star).toHaveAttribute("aria-pressed", "false");
    expect(star).toHaveTextContent("");
  });

  it("is a round 44 px target that is tinted when pressed", () => {
    renderButton({ variant: "star", favorite: true });
    const star = screen.getByRole("button", { name: "Favorite Chickpea curry" });
    expect(star).toHaveAttribute("aria-pressed", "true");
    expect(star.className).toContain("size-11");
    expect(star.className).toContain("rounded-full");
    expect(star.className).toContain("bg-accent-soft");
  });

  it("posts like the button does", async () => {
    actions.setRecipeFavorite.mockClear();
    const { user } = renderButton({ variant: "star", id: "r9", favorite: false });
    await user.click(screen.getByRole("button", { name: "Favorite Chickpea curry" }));

    await waitFor(() => expect(actions.setRecipeFavorite).toHaveBeenCalledTimes(1));
    const data = actions.setRecipeFavorite.mock.calls[0][0];
    expect([data.get("id"), data.get("favorite")]).toEqual(["r9", "true"]);
  });

  it("has no axe violations and says it in German", async () => {
    const { container } = renderButton({ variant: "star" }, "de");
    expect(screen.getByRole("button", { name: "Favorit Chickpea curry" })).toBeInTheDocument();
    await expectNoAxeViolations(container);
  });
});
