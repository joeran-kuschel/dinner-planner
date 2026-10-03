import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { NewRecipeMenu } from "@/components/new-recipe-menu";
import { expectNoAxeViolations } from "@/tests/support/axe";

const ITEMS = [{ href: "/recipes/new?import=1", label: "Add from a link" }];

function renderMenu() {
  const user = userEvent.setup();
  render(
    <main>
      <NewRecipeMenu newLabel="New recipe" moreLabel="More ways to add a recipe" items={ITEMS} />
      <button type="button">Elsewhere</button>
    </main>,
  );
  return { user, arrow: document.querySelector("summary") as HTMLElement, details: document.querySelector("details") as HTMLDetailsElement };
}

describe("NewRecipeMenu", () => {
  it("keeps New recipe a plain link to the empty form, one click away", () => {
    renderMenu();
    expect(screen.getByRole("link", { name: "New recipe" })).toHaveAttribute("href", "/recipes/new");
  });

  it("names the arrow for screen readers and lists the other ways in a closed menu", () => {
    const { details, arrow } = renderMenu();
    expect(arrow).toHaveAttribute("aria-label", "More ways to add a recipe");
    expect(details.open).toBe(false);
    expect(screen.getByRole("link", { name: "Add from a link", hidden: true })).toHaveAttribute("href", "/recipes/new?import=1");
  });

  it("opens with a click on the arrow and shows the links", async () => {
    const { user, arrow, details } = renderMenu();
    await user.click(arrow);
    expect(details.open).toBe(true);
    expect(screen.getByRole("link", { name: "Add from a link" })).toBeVisible();
  });

  it("puts the arrow in the tab order, as a summary the browser opens with Enter or Space", () => {
    const { arrow } = renderMenu();
    expect(arrow.tagName).toBe("SUMMARY");
    expect(arrow).not.toHaveAttribute("tabindex", "-1");
    arrow.focus();
    expect(arrow).toHaveFocus();
  });

  it("closes on Escape and puts the focus back on the arrow", async () => {
    const { user, arrow, details } = renderMenu();
    await user.click(arrow);
    screen.getByRole("link", { name: "Add from a link" }).focus();
    await user.keyboard("{Escape}");
    expect(details.open).toBe(false);
    expect(arrow).toHaveFocus();
  });

  it("closes on a click anywhere else, but not on a click inside", async () => {
    const { user, arrow, details } = renderMenu();
    await user.click(arrow);
    await user.pointer({ target: details.querySelector("ul")!, keys: "[MouseLeft]" });
    expect(details.open).toBe(true);
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(details.open).toBe(false);
  });

  it("does not listen for Escape while it is closed", async () => {
    const { user, details } = renderMenu();
    screen.getByRole("button", { name: "Elsewhere" }).focus();
    await user.keyboard("{Escape}");
    expect(details.open).toBe(false);
    expect(screen.getByRole("button", { name: "Elsewhere" })).toHaveFocus();
  });

  it("has no accessibility violations, closed and open", async () => {
    const { user, arrow } = renderMenu();
    await expectNoAxeViolations(document.body);
    await user.click(arrow);
    await expectNoAxeViolations(document.body);
  });
});
