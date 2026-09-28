import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { SiteNav } from "@/components/site-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

function renderAt(path: string) {
  pathname.current = path;
  return render(<SiteNav />);
}

describe("SiteNav", () => {
  it("links to the week, the recipes and the groceries", () => {
    renderAt("/");
    const nav = screen.getByRole("navigation");
    expect(nav).toContainElement(screen.getByRole("link", { name: "This week" }));
    expect(screen.getByRole("link", { name: "Recipes" })).toHaveAttribute("href", "/recipes");
    expect(screen.getByRole("link", { name: "Groceries" })).toHaveAttribute("href", "/groceries");
  });

  it.each([
    ["/", "This week"],
    ["/recipes", "Recipes"],
    ["/recipes/abc/edit", "Recipes"],
    ["/groceries", "Groceries"],
  ])("marks only the current section on %s", (path, current) => {
    renderAt(path);
    const marked = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");
    expect(marked.map((link) => link.textContent)).toEqual([current]);
  });

  it("has no axe violations", async () => {
    const { container } = renderAt("/recipes");
    await expectNoAxeViolations(container);
  });
});
