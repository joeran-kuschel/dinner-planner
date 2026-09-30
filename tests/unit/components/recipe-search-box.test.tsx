import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { RecipeSearchBox } from "@/components/recipe-search-box";
import type { SearchTerm } from "@/lib/recipe-search-terms";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const TERMS: SearchTerm[] = [
  { text: "Red Lentil Dal", kind: "recipe" },
  { text: "vegan", kind: "tag" },
  { text: "Lentils", kind: "ingredient" },
];

function renderBox(initial = "", locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  // What the form holds at the moment it is sent, which is what the server would get.
  const sent: string[] = [];
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    sent.push(String(new FormData(event.currentTarget).get("q")));
  });
  const result = renderWithI18n(
    <form role="search" onSubmit={onSubmit}>
      <RecipeSearchBox initial={initial} terms={TERMS} />
      <button type="submit">Search</button>
    </form>,
    { locale },
  );
  return { user, onSubmit, sent, ...result };
}

const field = () => screen.getByRole("combobox", { name: /Search recipes|Rezepte suchen/ });
const options = () => screen.queryAllByRole("option").map((option) => option.textContent);

describe("RecipeSearchBox", () => {
  it("is a labelled search field that says when suggestions start", () => {
    renderBox();
    expect(field()).toHaveAttribute("name", "q");
    expect(field()).toHaveAccessibleDescription("Suggestions appear after 3 letters.");
  });

  it("starts with the text of the current search", () => {
    renderBox("lentil");
    expect(field()).toHaveValue("lentil");
  });

  it("suggests nothing for one or two letters", async () => {
    const { user } = renderBox();
    await user.type(field(), "le");
    expect(options()).toEqual([]);
    expect(field()).toHaveAttribute("aria-expanded", "false");
  });

  it("suggests from the third letter, with the kind of each", async () => {
    const { user } = renderBox();
    await user.type(field(), "len");
    expect(options()).toEqual(["Lentilsingredient", "Red Lentil Dalrecipe"]);
    expect(field()).toHaveAttribute("aria-expanded", "true");
  });

  it("closes the suggestions again when the text gets shorter or matches nothing", async () => {
    const { user } = renderBox();
    await user.type(field(), "len");
    await user.keyboard("{Backspace}");
    expect(options()).toEqual([]);
    await user.type(field(), "xyz");
    expect(options()).toEqual([]);
  });

  it("does not send the form while typing, and Enter with nothing highlighted sends it", async () => {
    const { user, onSubmit } = renderBox();
    await user.type(field(), "lentil");
    expect(onSubmit).not.toHaveBeenCalled();
    await user.keyboard("{Enter}");
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(new FormData(screen.getByRole("search") as HTMLFormElement).get("q")).toBe("lentil");
  });

  it("fills the field with a picked suggestion and runs the search", async () => {
    const { user, onSubmit, sent } = renderBox();
    await user.type(field(), "veg");
    await user.click(screen.getByRole("option", { name: /vegan/ }));

    expect(field()).toHaveValue("vegan");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(sent).toEqual(["vegan"]);
    expect(new FormData(screen.getByRole("search") as HTMLFormElement).get("q")).toBe("vegan");
  });

  it("runs the search when the picked suggestion is exactly what was typed, and only then", async () => {
    const { user, onSubmit } = renderBox();
    await user.type(field(), "vegan");
    await user.click(screen.getByRole("option", { name: /vegan/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    // The next keystroke must not send the form again.
    await user.type(field(), "x");
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("picks with the keyboard", async () => {
    const { user, onSubmit } = renderBox();
    await user.type(field(), "len");
    await user.keyboard("{ArrowDown}{ArrowDown}{Enter}");

    expect(field()).toHaveValue("Red Lentil Dal");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("does not pick a highlighted suggestion when tabbing away", async () => {
    const { user, onSubmit } = renderBox();
    await user.type(field(), "len");
    await user.keyboard("{ArrowDown}");
    await user.tab();
    expect(field()).toHaveValue("len");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("announces how many suggestions there are", async () => {
    const { user } = renderBox();
    await user.type(field(), "len");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("2 suggestions"));
  });

  it("has no axe violations, closed or open", async () => {
    const { user, container } = renderBox();
    await expectNoAxeViolations(container);
    await user.type(field(), "len");
    await expectNoAxeViolations(container);
  });

  it("speaks German", async () => {
    const { user } = renderBox("", "de");
    expect(field()).toHaveAccessibleDescription("Vorschläge erscheinen ab 3 Buchstaben.");
    await user.type(field(), "len");
    expect(options()).toEqual(["LentilsZutat", "Red Lentil DalRezept"]);
  });
});
