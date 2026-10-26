import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Link from "next/link";
import { useRef } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaveGuard } from "@/components/leave-guard";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { polyfillDialog } from "@/tests/support/dialog";
import { renderWithI18n } from "@/tests/support/render";

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));

beforeAll(() => polyfillDialog());
beforeEach(() => {
  router.push.mockClear();
  delete (window as unknown as { navigation?: unknown }).navigation;
});

type HarnessProps = { saving?: boolean; startChanged?: boolean; onSubmit?: (data: FormData) => void };

/** A page with links and a form that has the guard in it, like the recipe form. */
function Harness({ saving = false, startChanged = false, onSubmit = () => {} }: HarnessProps) {
  const ref = useRef<HTMLFormElement>(null);
  return (
    <>
      <Link href="/recipes">
        <span>Recipes</span>
      </Link>
      <Link href="/recipes?tag=soup#top">Soups</Link>
      <a href="https://elsewhere.example/page">Elsewhere</a>
      <Link href="/recipes/new" target="_blank">
        New tab
      </Link>
      <a href="/file.pdf" download>Download</a>
      <a href="#bottom">Jump</a>
      <form
        ref={ref}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit(new FormData(event.currentTarget));
        }}
      >
        <label>
          Name <input name="name" required />
        </label>
        <label>
          Note <input name="note" />
        </label>
        <LeaveGuard formRef={ref} saving={saving} startChanged={startChanged} />
        <button type="submit">Save</button>
      </form>
    </>
  );
}

function setup(props: HarnessProps = {}, locale: "en" | "de" = "en") {
  const user = userEvent.setup();
  const result = renderWithI18n(<Harness {...props} />, { locale });
  return { user, ...result };
}

/** A click on a link as a user makes it; false when something called preventDefault. */
function clickLink(name: string, init: MouseEventInit = {}): boolean {
  let proceeded = true;
  act(() => {
    proceeded = screen.getByRole("link", { name }).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
  });
  return proceeded;
}

const dialog = () => document.querySelector("dialog") as HTMLDialogElement;
const open = () => dialog().hasAttribute("open");
const nameField = () => screen.getByLabelText("Name");

describe("LeaveGuard: the app's own links", () => {
  it("lets a form that was not touched go", () => {
    setup();
    expect(clickLink("Recipes")).toBe(true);
    expect(open()).toBe(false);
  });

  it("stops the click and asks once something changed", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");

    expect(clickLink("Recipes")).toBe(false);
    expect(open()).toBe(true);
    expect(within(dialog()).getByRole("heading", { name: "Leave without saving?" })).toBeInTheDocument();
    expect(dialog()).toHaveAccessibleDescription("You changed this recipe and have not saved it yet.");
  });

  it("has Stay as the first button, so a dialog opened by the browser puts the focus there", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    clickLink("Recipes");

    expect(within(dialog()).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Stay",
      "Leave without saving",
      "Save and leave",
    ]);
  });

  it("does not ask when the change was undone", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    await user.clear(nameField());

    expect(clickLink("Recipes")).toBe(true);
  });

  it("counts a form that starts with something unsaved as changed at once", () => {
    setup({ startChanged: true });
    expect(clickLink("Recipes")).toBe(false);
    expect(open()).toBe(true);
  });

  it("does not ask while a save is under way: its own redirect must go through", async () => {
    const { user, rerender } = setup();
    await user.type(nameField(), "Soup");
    rerender(<Harness saving />);

    expect(clickLink("Recipes")).toBe(true);
  });

  it.each([
    ["another site (the browser asks for that one)", "Elsewhere", {}],
    ["a link that opens a new tab", "New tab", {}],
    ["a download", "Download", {}],
    ["a jump on this page", "Jump", {}],
    ["a click with the command key", "Recipes", { metaKey: true }],
    ["a click with the control key", "Recipes", { ctrlKey: true }],
    ["a click with the shift key", "Recipes", { shiftKey: true }],
    ["a click with the alt key", "Recipes", { altKey: true }],
    ["a click with the middle button", "Recipes", { button: 1 }],
  ])("does not stop %s", async (_what, name, init) => {
    const { user } = setup();
    await user.type(nameField(), "Soup");

    expect(clickLink(name, init)).toBe(true);
    expect(open()).toBe(false);
  });

  it("keeps the focus on the link when the visitor stays", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    screen.getByRole("link", { name: "Recipes" }).focus();
    clickLink("Recipes");

    await user.click(within(dialog()).getByRole("button", { name: "Stay" }));

    expect(open()).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Recipes" })).toHaveFocus();
    expect(nameField()).toHaveValue("Soup");
  });

  it("means stay when the dialog is closed with Escape", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    clickLink("Recipes");

    act(() => dialog().close());

    expect(open()).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: "Recipes" })).toHaveFocus();
  });

  it("leaves without saving: opens the address with the router and sends nothing", async () => {
    const onSubmit = vi.fn();
    const { user } = setup({ onSubmit });
    await user.type(nameField(), "Soup");
    clickLink("Soups");

    await user.click(within(dialog()).getByRole("button", { name: "Leave without saving" }));

    expect(router.push).toHaveBeenCalledWith("/recipes?tag=soup#top");
    expect(onSubmit).not.toHaveBeenCalled();
    expect(open()).toBe(false);
  });

  it("lets the leave go through the browser's prompt too: no beforeunload question once the visitor chose to leave", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    clickLink("Recipes");
    await user.click(within(dialog()).getByRole("button", { name: "Leave without saving" }));

    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
    expect(clickLink("Soups")).toBe(true);
  });
});

describe("LeaveGuard: a click inside a link, and a leave that did not happen", () => {
  it("is caught on an element inside the link too", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    let proceeded = true;
    act(() => {
      proceeded = screen.getByText("Recipes").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });

    expect(proceeded).toBe(false);
    expect(open()).toBe(true);
  });

  it("guards again after the next edit when the leave did not happen", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    clickLink("Recipes");
    await user.click(within(dialog()).getByRole("button", { name: "Leave without saving" }));
    // The router answered and the page is still here: the guard is off only until something is typed.
    expect(clickLink("Soups")).toBe(true);

    await user.type(nameField(), "s");

    expect(clickLink("Recipes")).toBe(false);
    expect(open()).toBe(true);
  });

  it("does not take the focus from the field that Save and leave asked to complete", async () => {
    const { user } = setup();
    await user.type(screen.getByLabelText("Note"), "only a note");
    const field = nameField();
    vi.spyOn(HTMLFormElement.prototype, "reportValidity").mockImplementation(() => {
      field.focus();
      return false;
    });
    screen.getByRole("link", { name: "Recipes" }).focus();
    clickLink("Recipes");

    await user.click(within(dialog()).getByRole("button", { name: "Save and leave" }));

    expect(field).toHaveFocus();
    vi.restoreAllMocks();
  });

  it("still means stay for Escape after a leave that was not carried out", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    clickLink("Recipes");
    await user.click(within(dialog()).getByRole("button", { name: "Leave without saving" }));
    await user.type(nameField(), "s");
    screen.getByRole("link", { name: "Recipes" }).focus();
    clickLink("Recipes");

    act(() => dialog().close());

    expect(screen.getByRole("link", { name: "Recipes" })).toHaveFocus();
  });
});

describe("LeaveGuard: Save and leave", () => {
  it("sends the form with the address that was asked for, and goes there when the save succeeds", async () => {
    const onSubmit = vi.fn();
    const { user } = setup({ onSubmit });
    await user.type(nameField(), "Soup");
    clickLink("Soups");

    await user.click(within(dialog()).getByRole("button", { name: "Save and leave" }));

    expect(open()).toBe(false);
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const data = onSubmit.mock.calls[0][0] as FormData;
    expect(data.get("next")).toBe("/recipes?tag=soup#top");
    expect(data.get("name")).toBe("Soup");
    // The server redirects; the router is not used for it.
    expect(router.push).not.toHaveBeenCalled();
  });

  it("stays on the page when the form is not complete, and says what is missing", async () => {
    const onSubmit = vi.fn();
    const { user } = setup({ onSubmit });
    await user.type(screen.getByLabelText("Note"), "only a note");
    const report = vi.spyOn(HTMLFormElement.prototype, "reportValidity");
    clickLink("Recipes");

    await user.click(within(dialog()).getByRole("button", { name: "Save and leave" }));

    expect(onSubmit).not.toHaveBeenCalled();
    expect(report).toHaveBeenCalled();
    expect(open()).toBe(false);
    expect(screen.getByLabelText("Note")).toHaveValue("only a note");
    report.mockRestore();
  });

  it("does not carry the address into the next save when this one was refused", async () => {
    const onSubmit = vi.fn();
    const { user, rerender } = setup({ onSubmit });
    await user.type(nameField(), "Soup");
    clickLink("Recipes");
    await user.click(within(dialog()).getByRole("button", { name: "Save and leave" }));
    // The save runs and the server refuses it: the form goes back to not saving.
    rerender(<Harness onSubmit={onSubmit} saving />);
    rerender(<Harness onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect((onSubmit.mock.calls[1][0] as FormData).get("next")).toBe("");
  });

  it("asks again after a refused save, since the form still has changes", async () => {
    const { user, rerender } = setup();
    await user.type(nameField(), "Soup");
    rerender(<Harness saving />);
    rerender(<Harness />);

    expect(clickLink("Recipes")).toBe(false);
  });
});

describe("LeaveGuard: the browser's own prompt", () => {
  const prompt = () => {
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    return event.defaultPrevented;
  };

  it("is not set for a form that was not touched", () => {
    setup();
    expect(prompt()).toBe(false);
  });

  it("is set once something changed, and removed when the change is undone", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    expect(prompt()).toBe(true);

    await user.clear(nameField());
    expect(prompt()).toBe(false);
  });

  it("is set from the start for a form with something unsaved, and not during a save", () => {
    const { rerender } = setup({ startChanged: true });
    expect(prompt()).toBe(true);
    rerender(<Harness startChanged saving />);
    expect(prompt()).toBe(false);
  });

  it("is removed when the page goes", async () => {
    const { user, unmount } = setup();
    await user.type(nameField(), "Soup");
    unmount();
    expect(prompt()).toBe(false);
  });
});

describe("LeaveGuard: fields that come and go", () => {
  it("sees a field added to the form, as a tag or an ingredient row is, and one taken away", async () => {
    setup();
    const form = document.querySelector("form")!;
    const tag = document.createElement("input");
    tag.type = "hidden";
    tag.name = "tag";
    tag.value = "soup";

    form.append(tag);
    await waitFor(() => expect(clickLink("Recipes")).toBe(false));
    act(() => dialog().close());

    tag.remove();
    await waitFor(() => expect(clickLink("Recipes")).toBe(true));
  });

  it("sees a value changed from code, as a controlled field does", async () => {
    setup();
    const note = screen.getByLabelText("Note") as HTMLInputElement;
    note.setAttribute("value", "changed");
    note.value = "changed";

    await waitFor(() => expect(clickLink("Recipes")).toBe(false));
  });
});

describe("LeaveGuard: the back and forward buttons", () => {
  /** A browser with the Navigation API: an event target that can be told to go to an entry. */
  function withNavigation() {
    const target = new EventTarget() as EventTarget & { traverseTo: ReturnType<typeof vi.fn> };
    target.traverseTo = vi.fn();
    (window as unknown as { navigation: unknown }).navigation = target;
    return target;
  }
  const traverse = (target: EventTarget, init: { cancelable?: boolean; navigationType?: string } = {}) => {
    const event = Object.assign(new Event("navigate", { cancelable: init.cancelable ?? true }), {
      navigationType: init.navigationType ?? "traverse",
      destination: { key: "entry-7", url: "http://localhost:3000/recipes?tag=soup" },
    });
    act(() => {
      target.dispatchEvent(event);
    });
    return event;
  };

  it("cancels a step back and asks, once something changed", async () => {
    const navigation = withNavigation();
    const { user } = setup();
    await user.type(nameField(), "Soup");

    const event = traverse(navigation);

    expect(event.defaultPrevented).toBe(true);
    expect(open()).toBe(true);
  });

  it("goes to that entry of the history on Leave without saving, and does not ask again", async () => {
    const navigation = withNavigation();
    const { user } = setup();
    await user.type(nameField(), "Soup");
    traverse(navigation);

    await user.click(within(dialog()).getByRole("button", { name: "Leave without saving" }));

    expect(navigation.traverseTo).toHaveBeenCalledWith("entry-7");
    expect(router.push).not.toHaveBeenCalled();
    expect(traverse(navigation).defaultPrevented).toBe(false);
  });

  it("saves and then goes to the address of that entry", async () => {
    const navigation = withNavigation();
    const onSubmit = vi.fn();
    const { user } = setup({ onSubmit });
    await user.type(nameField(), "Soup");
    traverse(navigation);

    await user.click(within(dialog()).getByRole("button", { name: "Save and leave" }));

    expect((onSubmit.mock.calls[0][0] as FormData).get("next")).toBe("/recipes?tag=soup");
  });

  it("stays where it is on Stay", async () => {
    const navigation = withNavigation();
    const { user } = setup();
    await user.type(nameField(), "Soup");
    traverse(navigation);

    await user.click(within(dialog()).getByRole("button", { name: "Stay" }));

    expect(navigation.traverseTo).not.toHaveBeenCalled();
    expect(open()).toBe(false);
  });

  it.each([
    ["an untouched form", {}, false],
    ["a navigation that is not a step in the history (a push of the router)", { navigationType: "push" }, true],
    ["a navigation that cannot be cancelled", { cancelable: false }, true],
  ])("lets %s through", async (_what, init, typed) => {
    const navigation = withNavigation();
    const { user } = setup();
    if (typed) await user.type(nameField(), "Soup");

    const event = traverse(navigation, init);

    expect(event.defaultPrevented).toBe(false);
    expect(open()).toBe(false);
  });

  it("does not ask during a save", async () => {
    const navigation = withNavigation();
    const { user, rerender } = setup();
    await user.type(nameField(), "Soup");
    rerender(<Harness saving />);

    expect(traverse(navigation).defaultPrevented).toBe(false);
  });

  it("works without the Navigation API: the links are still guarded", async () => {
    const { user } = setup();
    await user.type(nameField(), "Soup");
    expect(clickLink("Recipes")).toBe(false);
  });
});

describe("LeaveGuard: accessibility and language", () => {
  it("has no axe violations, open or not", async () => {
    const { user, container } = setup();
    await expectNoAxeViolations(container);
    await user.type(nameField(), "Soup");
    clickLink("Recipes");
    await expectNoAxeViolations(dialog());
  });

  it("says it in German", async () => {
    const { user } = setup({}, "de");
    await user.type(screen.getByLabelText("Name"), "Suppe");
    clickLink("Recipes");

    expect(within(dialog()).getByRole("heading", { name: "Ohne Speichern verlassen?" })).toBeInTheDocument();
    expect(within(dialog()).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Hier bleiben",
      "Ohne Speichern verlassen",
      "Speichern und verlassen",
    ]);
  });
});
