import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TagInput } from "@/components/tag-input";
import { MAX_TAGS } from "@/lib/tags";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

function renderTags(
  { initial = [], suggestions = [] }: { initial?: string[]; suggestions?: string[] } = {},
  locale: "en" | "de" = "en",
) {
  const user = userEvent.setup();
  const onSubmit = vi.fn((event: React.FormEvent<HTMLFormElement>) => event.preventDefault());
  const result = renderWithI18n(
    <form onSubmit={onSubmit} aria-label="test form">
      <TagInput initial={initial} suggestions={suggestions} />
      <button type="submit">Send</button>
    </form>,
    { locale },
  );
  return { user, onSubmit, ...result };
}

// An input with a `list` is a combobox to assistive technology.
const field = () => screen.getByRole("combobox", { name: "Tags" });
const chips = () => screen.queryAllByRole("listitem").map((item) => item.textContent?.replace("✕", ""));
const posted = () => new FormData(screen.getByRole("form", { name: "test form" }) as HTMLFormElement);
const status = () => screen.getByRole("status").textContent;

describe("TagInput", () => {
  it("is a labelled field with a hint, and no list while there are no tags", () => {
    renderTags();
    expect(field()).toHaveAccessibleDescription(/Press Enter or type a comma/);
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows the recipe's tags as chips, each with a remove button", () => {
    renderTags({ initial: ["vegan", "quick"] });
    expect(screen.getByRole("list", { name: "Tags of this recipe" })).toBeInTheDocument();
    expect(chips()).toEqual(["vegan", "quick"]);
    expect(screen.getByRole("button", { name: "Remove tag vegan" })).toBeInTheDocument();
  });

  it("posts each chip as a `tag` and the typed text as `tags`", async () => {
    const { user } = renderTags({ initial: ["vegan", "quick"] });
    await user.type(field(), "spi");
    expect(posted().getAll("tag")).toEqual(["vegan", "quick"]);
    expect(posted().get("tags")).toBe("spi");
  });

  describe("adding", () => {
    it("turns the typed text into a chip on Enter without sending the form", async () => {
      const { user, onSubmit } = renderTags();
      await user.type(field(), "Quick{Enter}");
      expect(chips()).toEqual(["quick"]);
      expect(field()).toHaveValue("");
      expect(onSubmit).not.toHaveBeenCalled();
      expect(status()).toBe("Added tag quick");
    });

    it("turns the text before a comma into a chip and keeps typing after it", async () => {
      const { user } = renderTags();
      await user.type(field(), "one pan, veg");
      expect(chips()).toEqual(["one pan"]);
      expect(field()).toHaveValue("veg");
    });

    it("adds several chips from pasted text", async () => {
      const { user } = renderTags();
      await user.click(field());
      await user.paste("Quick, Vegan, pasta,");
      expect(chips()).toEqual(["quick", "vegan", "pasta"]);
      expect(field()).toHaveValue("");
    });

    it("ignores a tag that is already there, whatever its case", async () => {
      const { user } = renderTags({ initial: ["quick"] });
      await user.type(field(), "QUICK{Enter}");
      expect(chips()).toEqual(["quick"]);
    });

    it("ignores blank input", async () => {
      const { user } = renderTags();
      await user.type(field(), " , ,");
      expect(chips()).toEqual([]);
    });

    it("sends the form on Enter when nothing is typed, like the other fields", async () => {
      const { user, onSubmit } = renderTags({ initial: ["quick"] });
      await user.type(field(), "{Enter}");
      expect(onSubmit).toHaveBeenCalledTimes(1);
    });

    it("stops at the largest number of tags and says so", async () => {
      const initial = Array.from({ length: MAX_TAGS }, (_, i) => `tag${i}`);
      const { user } = renderTags({ initial });
      await user.type(field(), "one more{Enter}");
      expect(chips()).toHaveLength(MAX_TAGS);
      expect(status()).toBe(`A recipe can have at most ${MAX_TAGS} tags.`);
    });

    it("limits how much can be typed for one tag", () => {
      renderTags();
      expect(field()).toHaveAttribute("maxLength");
    });
  });

  describe("removing", () => {
    it("removes the chip and announces it", async () => {
      const { user } = renderTags({ initial: ["vegan", "quick"] });
      await user.click(screen.getByRole("button", { name: "Remove tag vegan" }));
      expect(chips()).toEqual(["quick"]);
      expect(posted().getAll("tag")).toEqual(["quick"]);
      expect(status()).toBe("Removed tag vegan");
    });

    it("keeps the focus in the list: on the next chip's button, then the previous one, then the field", async () => {
      const { user } = renderTags({ initial: ["a", "b", "c"] });
      await user.click(screen.getByRole("button", { name: "Remove tag b" }));
      expect(screen.getByRole("button", { name: "Remove tag c" })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(screen.getByRole("button", { name: "Remove tag a" })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(field()).toHaveFocus();
    });

    it("can be done with the keyboard", async () => {
      const { user } = renderTags({ initial: ["vegan"] });
      await user.tab(); // the field
      await user.tab(); // the chip's button
      expect(screen.getByRole("button", { name: "Remove tag vegan" })).toHaveFocus();
      await user.keyboard("{Enter}");
      expect(chips()).toEqual([]);
    });
  });

  describe("suggestions", () => {
    it("offers the tags in use that are not chosen yet", () => {
      const { container } = renderTags({ initial: ["quick"], suggestions: ["quick", "vegan", "pasta"] });
      const list = container.querySelector("datalist")!;
      expect(field()).toHaveAttribute("list", list.id);
      expect([...list.querySelectorAll("option")].map((option) => option.value)).toEqual(["vegan", "pasta"]);
    });

    it("offers the tag again after its chip is removed", async () => {
      const { user, container } = renderTags({ initial: ["quick"], suggestions: ["quick"] });
      await user.click(screen.getByRole("button", { name: "Remove tag quick" }));
      expect([...container.querySelectorAll("datalist option")].map((o) => (o as HTMLOptionElement).value)).toEqual(["quick"]);
    });
  });

  it("has no axe violations, empty or with chips", async () => {
    const empty = renderTags();
    await expectNoAxeViolations(empty.container);
    empty.unmount();
    const { container } = renderTags({ initial: ["vegan", "quick"], suggestions: ["pasta"] });
    await expectNoAxeViolations(container);
  });

  it("speaks German", async () => {
    const { user } = renderTags({ initial: ["vegan"] }, "de");
    expect(field()).toHaveAccessibleDescription(/Mit Enter oder Komma/);
    expect(screen.getByRole("list", { name: "Tags dieses Rezepts" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tag vegan entfernen" }));
    expect(status()).toBe("Tag vegan entfernt");
    await user.type(field(), "schnell{Enter}");
    expect(status()).toBe("Tag schnell hinzugefügt");
    expect(within(screen.getByRole("list")).getByText("schnell")).toBeInTheDocument();
  });
});
