import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ImportRecipeDialog } from "@/components/import-recipe-dialog";
import type { RecipeFormValues } from "@/lib/recipe-form";
import type { ImportErrorCode } from "@/lib/recipe-import/errors";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { polyfillDialog } from "@/tests/support/dialog";
import { renderWithI18n } from "@/tests/support/render";

beforeAll(() => polyfillDialog());
afterEach(() => vi.unstubAllGlobals());

const VALUES: RecipeFormValues = {
  name: "Lemon pancakes",
  description: "",
  servings: "4",
  prepMinutes: "20",
  sourceUrl: "https://example.com/pancakes",
  instructions: "Whisk.",
  photoAlt: "",
  tags: ["quick"],
  ingredients: [{ name: "flour", quantity: "200", unit: "g", category: "OTHER" }],
};

type Result = { ok: true; values: RecipeFormValues } | { ok: false; error: ImportErrorCode };
const reply = (result: Result) => new Response(JSON.stringify(result), { headers: { "content-type": "application/json" } });

/** A fetch the test settles by hand, which also honours the abort signal like the real one. */
function pendingFetch() {
  let settle!: (result: Result) => void;
  const fetchMock = vi.fn((_url: string, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      settle = (result) => resolve(reply(result));
      init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
    }),
  );
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, settle: (result: Result) => settle(result) };
}

function renderDialog(props: { open?: boolean; locale?: "en" | "de" } = {}) {
  const onClose = vi.fn();
  const onImported = vi.fn();
  const user = userEvent.setup();
  const view = renderWithI18n(<ImportRecipeDialog open={props.open ?? true} onClose={onClose} onImported={onImported} />, {
    locale: props.locale,
  });
  return { user, onClose, onImported, ...view };
}

const field = () => screen.getByLabelText("Link to the recipe");
const dialogElement = () => document.querySelector("dialog")!;

describe("ImportRecipeDialog", () => {
  it("is a labelled modal dialog with a link field and Import and Cancel", () => {
    renderDialog();
    const dialog = screen.getByRole("dialog", { name: "Add from a link" });
    expect(dialog).toHaveAttribute("aria-describedby", "import-hint");
    expect(dialog).toHaveAccessibleDescription(/nothing is saved until you save it/);
    expect(field()).toHaveAttribute("inputmode", "url");
    expect(screen.getByRole("button", { name: "Import" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
  });

  it("opens and closes with its `open` prop", () => {
    const { rerender, onClose } = renderDialog({ open: false });
    expect(dialogElement()).not.toHaveAttribute("open");
    // The component is wrapped by the i18n provider that `renderWithI18n` gives `rerender`.
    rerender(<ImportRecipeDialog open onClose={onClose} onImported={vi.fn()} />);
    expect(dialogElement()).toHaveAttribute("open");
    rerender(<ImportRecipeDialog open={false} onClose={onClose} onImported={vi.fn()} />);
    expect(dialogElement()).not.toHaveAttribute("open");
  });

  it("has no accessibility violations, open and with an error", async () => {
    const { user } = renderDialog();
    await expectNoAxeViolations(document.body);
    await user.type(field(), "no link{Enter}");
    await screen.findByRole("alert");
    await expectNoAxeViolations(document.body);
  });

  describe("an address that is no web address", () => {
    it.each(["", "   ", "just words", "example.com/pie", "ftp://example.com/x"])("is answered at once, without a request: %j", async (text) => {
      const fetchMock = vi.fn();
      vi.stubGlobal("fetch", fetchMock);
      const { user, onClose } = renderDialog();
      if (text.trim()) await user.type(field(), text);
      await user.click(screen.getByRole("button", { name: "Import" }));

      expect(await screen.findByRole("alert")).toHaveTextContent("Enter a web address starting with http:// or https://.");
      expect(field()).toHaveAttribute("aria-invalid", "true");
      expect(field()).toHaveAccessibleDescription("Enter a web address starting with http:// or https://.");
      expect(field()).toHaveFocus();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(dialogElement()).toHaveAttribute("open");
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  describe("importing", () => {
    it("sends the address to the server, hands the recipe over and closes", async () => {
      const fetchMock = vi.fn(async () => reply({ ok: true, values: VALUES }));
      vi.stubGlobal("fetch", fetchMock);
      const { user, onImported, onClose } = renderDialog();
      await user.type(field(), "  https://example.com/pancakes  {Enter}");

      await waitFor(() => expect(onImported).toHaveBeenCalledWith(VALUES));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("/recipes/import");
      expect(init.method).toBe("POST");
      expect(new Headers(init.headers).get("content-type")).toBe("application/json");
      expect(JSON.parse(init.body as string)).toEqual({ url: "https://example.com/pancakes" });
      await waitFor(() => expect(dialogElement()).not.toHaveAttribute("open"));
      expect(onClose).toHaveBeenCalled();
    });

    it("says it is working, announces it, and does not send twice", async () => {
      const { fetchMock, settle } = pendingFetch();
      const { user, onImported } = renderDialog();
      await user.type(field(), "https://example.com/pancakes");
      await user.click(screen.getByRole("button", { name: "Import" }));

      expect(screen.getByRole("status")).toHaveTextContent("Fetching the page…");
      expect(screen.getByRole("button", { name: "Importing…" })).toHaveAttribute("aria-disabled", "true");
      expect(field()).toHaveAttribute("readonly");
      await user.click(screen.getByRole("button", { name: "Importing…" }));
      await user.type(field(), "{Enter}");
      expect(fetchMock).toHaveBeenCalledTimes(1);

      settle({ ok: true, values: VALUES });
      await waitFor(() => expect(onImported).toHaveBeenCalledTimes(1));
      // The dialog has closed by then, so its (now hidden) status is empty again.
      expect(screen.getByRole("status", { hidden: true })).toBeEmptyDOMElement();
    });

    it("keeps its status region on the page when nothing is going on, so the text is announced when it appears", () => {
      renderDialog();
      expect(screen.getByRole("status")).toBeInTheDocument();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });

  describe("an import that fails", () => {
    it.each<[ImportErrorCode, string]>([
      ["blocked", "That address cannot be imported: it points to this computer or to a private network."],
      ["timeout", "The page took too long to answer. Try again later."],
      ["too-large", "The page is too large to import."],
      ["not-html", "That address is not a web page."],
      ["unreachable", "The page could not be fetched. Check the address and try again."],
      ["no-recipe", "No recipe was found on that page. Importing needs recipe data that the website publishes for search engines."],
    ])("shows the message for %s inside the dialog, and keeps it open", async (code, message) => {
      vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: false, error: code })));
      const { user, onImported, onClose } = renderDialog();
      await user.type(field(), "https://example.com/x{Enter}");

      expect(await screen.findByRole("alert")).toHaveTextContent(message);
      expect(dialogElement()).toHaveAttribute("open");
      expect(onImported).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      // The address stays for a correction, and the field has the focus again.
      expect(field()).toHaveValue("https://example.com/x");
      expect(field()).toHaveFocus();
      expect(screen.getByRole("button", { name: "Import" })).not.toHaveAttribute("aria-disabled");
    });

    it("shows an unreadable answer, or no answer, as an unreachable page", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response("<html>Bad gateway</html>", { status: 502 })));
      const { user } = renderDialog();
      await user.type(field(), "https://example.com/x{Enter}");
      expect(await screen.findByRole("alert")).toHaveTextContent("The page could not be fetched.");

      vi.stubGlobal("fetch", vi.fn(async () => Promise.reject(new TypeError("offline"))));
      await user.click(screen.getByRole("button", { name: "Import" }));
      await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("The page could not be fetched."));
    });

    it("takes the message away with the next try", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(reply({ ok: false, error: "timeout" }))
        .mockResolvedValueOnce(reply({ ok: true, values: VALUES }));
      vi.stubGlobal("fetch", fetchMock);
      const { user, onImported } = renderDialog();
      await user.type(field(), "https://example.com/x{Enter}");
      await screen.findByRole("alert");
      await user.click(screen.getByRole("button", { name: "Import" }));
      await waitFor(() => expect(onImported).toHaveBeenCalled());
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("speaks German", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: false, error: "no-recipe" })));
      const { user } = renderDialog({ locale: "de" });
      expect(screen.getByRole("dialog", { name: "Über einen Link hinzufügen" })).toBeInTheDocument();
      await user.type(screen.getByLabelText("Link zum Rezept"), "https://example.com/x");
      await user.click(screen.getByRole("button", { name: "Importieren" }));
      expect(await screen.findByRole("alert")).toHaveTextContent("Auf dieser Seite wurde kein Rezept gefunden.");
      expect(screen.getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
    });
  });

  describe("cancelling", () => {
    it("closes the dialog and tells the page", async () => {
      const { user, onClose } = renderDialog();
      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(dialogElement()).not.toHaveAttribute("open");
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("stops the wait: the request is aborted and nothing is handed over", async () => {
      const { fetchMock, settle } = pendingFetch();
      const { user, onImported, onClose } = renderDialog();
      await user.type(field(), "https://example.com/slow");
      await user.click(screen.getByRole("button", { name: "Import" }));
      const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;
      expect(signal.aborted).toBe(false);

      await user.click(screen.getByRole("button", { name: "Cancel" }));
      expect(signal.aborted).toBe(true);
      expect(onClose).toHaveBeenCalled();
      // A late answer is ignored.
      settle({ ok: true, values: VALUES });
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(onImported).not.toHaveBeenCalled();
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("stops the wait when the browser closes the dialog by itself (Escape)", async () => {
      const { fetchMock } = pendingFetch();
      const { user, onClose } = renderDialog();
      await user.type(field(), "https://example.com/slow{Enter}");
      const signal = (fetchMock.mock.calls[0][1] as RequestInit).signal as AbortSignal;

      dialogElement().dispatchEvent(new Event("close"));
      expect(signal.aborted).toBe(true);
      expect(onClose).toHaveBeenCalled();
    });

    it("starts fresh when opened again: no old message, not working", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => reply({ ok: false, error: "timeout" })));
      const { user } = renderDialog();
      await user.type(field(), "https://example.com/x{Enter}");
      await screen.findByRole("alert");
      await user.click(screen.getByRole("button", { name: "Cancel" }));

      dialogElement().setAttribute("open", "");
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
      expect(screen.getByRole("status")).toBeEmptyDOMElement();
    });
  });
});
