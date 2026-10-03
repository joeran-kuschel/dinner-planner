import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { NewRecipeScreen } from "@/components/new-recipe-screen";
import type { RecipeFormValues } from "@/lib/recipe-form";
import { polyfillDialog } from "@/tests/support/dialog";
import { renderWithI18n } from "@/tests/support/render";

vi.mock("@/app/actions/recipes", () => ({ createRecipe: vi.fn(async (state: unknown) => state) }));
const attach = vi.hoisted(() => ({ attachFile: vi.fn() }));
vi.mock("@/lib/attach-file", () => attach);

beforeAll(() => polyfillDialog());

const IMPORTED: RecipeFormValues = {
  name: "Lemon pancakes",
  description: "Thin and quick.",
  servings: "4",
  prepMinutes: "20",
  sourceUrl: "https://example.com/pancakes",
  instructions: "Whisk.\nFry.",
  photoAlt: "",
  tags: ["breakfast", "quick"],
  ingredients: [
    { name: "flour", quantity: "200", unit: "g", category: "OTHER" },
    { name: "eggs", quantity: "2", unit: "", category: "OTHER" },
  ],
};

function renderScreen(props: Partial<Parameters<typeof NewRecipeScreen>[0]> = {}) {
  const user = userEvent.setup();
  renderWithI18n(<NewRecipeScreen tagSuggestions={[]} unitSuggestions={["g"]} openImport={false} {...props} />);
  return { user };
}

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;
/** The announcement next to the button (the dialog has a status of its own, after it in the page). */
const announcement = () => screen.getAllByRole("status", { hidden: true })[0];
const name = () => document.getElementById("name") as HTMLInputElement;

describe("NewRecipeScreen", () => {
  it("starts as the empty new-recipe form with Add from a link above it", () => {
    renderScreen();
    expect(screen.getByRole("button", { name: "Add from a link" })).toBeInTheDocument();
    expect(name()).toHaveValue("");
    expect(dialog()).not.toHaveAttribute("open");
    expect(announcement()).toBeEmptyDOMElement();
  });

  it("opens the dialog with the button, and also on arrival when asked to", async () => {
    const { user } = renderScreen();
    await user.click(screen.getByRole("button", { name: "Add from a link" }));
    expect(dialog()).toHaveAttribute("open");
  });

  it("opens the dialog on arrival from the menu", () => {
    renderScreen({ openImport: true });
    expect(dialog()).toHaveAttribute("open");
  });

  it("puts the focus on the page's button when a dialog opened on arrival is cancelled", async () => {
    const { user } = renderScreen({ openImport: true });
    expect(document.body).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add from a link" })).toHaveFocus());
  });

  it("also does so when the browser fires close while the focus is still on the hidden dialog (as Chromium does)", async () => {
    polyfillDialog({ blurOnClose: false });
    try {
      const { user } = renderScreen({ openImport: true });
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Add from a link" })).toHaveFocus());
    } finally {
      polyfillDialog();
    }
  });

  it("leaves the focus where the browser put it when the dialog was opened from the button", async () => {
    const { user } = renderScreen();
    const opener = screen.getByRole("button", { name: "Add from a link" });
    await user.click(opener);
    // The browser gives the focus back to the button itself; nothing else moves it.
    const other = document.createElement("button");
    document.body.append(other);
    other.focus();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(document.activeElement).not.toBe(screen.getByRole("textbox", { name: "Link to the recipe", hidden: true }));
    other.remove();
  });

  it("fills the form from the import, announces it, and puts the focus on the name", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, values: IMPORTED }))));
    const { user } = renderScreen({ openImport: true });
    await user.type(screen.getByLabelText("Link to the recipe"), "https://example.com/pancakes{Enter}");

    await waitFor(() => expect(name()).toHaveValue("Lemon pancakes"));
    expect(name()).toHaveFocus();
    expect(screen.getByLabelText("Description")).toHaveValue("Thin and quick.");
    expect(screen.getByLabelText("Serves")).toHaveValue(4);
    expect(screen.getByLabelText("Prep time (min)")).toHaveValue(20);
    expect(screen.getByLabelText("Source")).toHaveValue("https://example.com/pancakes");
    expect(screen.getByLabelText("Method")).toHaveValue("Whisk.\nFry.");
    expect(screen.getByLabelText("Amount for ingredient 1")).toHaveValue("200");
    expect(screen.getByLabelText("Unit for ingredient 1")).toHaveValue("g");
    expect(screen.getByLabelText("Name of ingredient 2")).toHaveValue("eggs");
    expect(screen.getAllByLabelText(/^Name of ingredient/)).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Remove tag breakfast" })).toBeInTheDocument();
    expect(announcement()).toHaveTextContent("Recipe imported. Check it, then press “Create recipe”.");
    expect(screen.getByRole("button", { name: "Create recipe" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("replaces what was typed when another recipe is imported, with a fresh form", async () => {
    const second = { ...IMPORTED, name: "Waffles", ingredients: [{ name: "batter", quantity: "", unit: "", category: "OTHER" }], tags: [] };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, values: IMPORTED })))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, values: second }))),
    );
    const { user } = renderScreen({ openImport: true });
    await user.type(screen.getByLabelText("Link to the recipe"), "https://example.com/a{Enter}");
    await waitFor(() => expect(name()).toHaveValue("Lemon pancakes"));

    await user.click(screen.getByRole("button", { name: "Add from a link" }));
    await user.type(screen.getByLabelText("Link to the recipe"), "https://example.com/b{Enter}");
    await waitFor(() => expect(name()).toHaveValue("Waffles"));
    expect(screen.getAllByLabelText(/^Name of ingredient/)).toHaveLength(1);
    expect(screen.queryByRole("button", { name: "Remove tag breakfast" })).not.toBeInTheDocument();
    vi.unstubAllGlobals();
  });

  it("shows a recipe the server has already imported (a page without JavaScript)", () => {
    renderScreen({ imported: IMPORTED });
    expect(name()).toHaveValue("Lemon pancakes");
    expect(announcement()).toHaveTextContent("Recipe imported.");
    expect(dialog()).not.toHaveAttribute("open");
  });

  it("keeps the empty form when the import fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: false, error: "no-recipe" }))));
    const { user } = renderScreen({ openImport: true });
    await user.type(screen.getByLabelText("Link to the recipe"), "https://example.com/x{Enter}");
    await within(dialog()).findByRole("alert");
    expect(name()).toHaveValue("");
    expect(announcement()).toBeEmptyDOMElement();
    vi.unstubAllGlobals();
  });
});

describe("NewRecipeScreen with a photo", () => {
  /** What the server answers for a recipe (with a picture address) and for the picture. */
  function serverWith(photo: () => Response | Promise<Response>) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/recipes/import"
          ? new Response(JSON.stringify({ ok: true, values: IMPORTED, photoUrl: "https://example.com/p.jpg" }))
          : photo(),
      ),
    );
  }
  const importRecipe = async () => {
    const user = userEvent.setup();
    renderWithI18n(<NewRecipeScreen tagSuggestions={[]} unitSuggestions={[]} openImport />);
    await user.type(screen.getByLabelText("Link to the recipe"), "https://example.com/pancakes{Enter}");
    await waitFor(() => expect(name()).toHaveValue("Lemon pancakes"));
  };

  it("puts the photo in the form's file field, describes it with the recipe's name, and says so", async () => {
    attach.attachFile.mockClear();
    serverWith(() => new Response("JPEGDATA", { headers: { "content-type": "image/jpeg" } }));
    await importRecipe();

    expect(attach.attachFile).toHaveBeenCalledTimes(1);
    const [input, file] = attach.attachFile.mock.calls[0];
    expect(input).toBe(document.getElementById("photo"));
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("lemon-pancakes.jpg");
    expect(screen.getByLabelText(/^Description of the photo/)).toHaveValue("Lemon pancakes");
    // (That the description becomes required is the change event of the real attachFile: see the end-to-end test.)
    expect(announcement()).toHaveTextContent("Recipe and photo imported. Check them, then press “Create recipe”.");
    expect(name()).toHaveFocus();
    vi.unstubAllGlobals();
  });

  it("leaves the photo field and its description empty, and says so, when the photo cannot be fetched", async () => {
    attach.attachFile.mockClear();
    serverWith(() => new Response(JSON.stringify({ ok: false, error: "not-image" })));
    await importRecipe();

    expect(attach.attachFile).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/^Description of the photo/)).toHaveValue("");
    expect(announcement()).toHaveTextContent("Recipe imported, but its photo could not be fetched.");
    expect(name()).toHaveFocus();
    vi.unstubAllGlobals();
  });

  it("does not touch the photo field when the recipe has no picture", async () => {
    attach.attachFile.mockClear();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, values: IMPORTED, photoUrl: null }))));
    await importRecipe();
    expect(attach.attachFile).not.toHaveBeenCalled();
    expect(announcement()).toHaveTextContent("Recipe imported. Check it");
    vi.unstubAllGlobals();
  });

  it("takes the next recipe's photo, and none from the one before", async () => {
    attach.attachFile.mockClear();
    const second = { ...IMPORTED, name: "Waffles" };
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, values: IMPORTED, photoUrl: "https://example.com/a.jpg" })))
        .mockResolvedValueOnce(new Response("A", { headers: { "content-type": "image/jpeg" } }))
        .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, values: second, photoUrl: null }))),
    );
    const user = userEvent.setup();
    renderWithI18n(<NewRecipeScreen tagSuggestions={[]} unitSuggestions={[]} openImport />);
    await user.type(screen.getByLabelText("Link to the recipe"), "https://example.com/a{Enter}");
    await waitFor(() => expect(attach.attachFile).toHaveBeenCalledTimes(1));

    await user.click(screen.getByRole("button", { name: "Add from a link" }));
    await user.type(screen.getByLabelText("Link to the recipe"), "https://example.com/b{Enter}");
    await waitFor(() => expect(name()).toHaveValue("Waffles"));
    expect(attach.attachFile).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText(/^Description of the photo/)).toHaveValue("");
    vi.unstubAllGlobals();
  });
});
