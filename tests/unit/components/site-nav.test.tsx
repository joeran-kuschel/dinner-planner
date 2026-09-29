import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";
import { SiteNav } from "@/components/site-nav";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));
vi.mock("@/app/actions/locale", () => ({ setLocale: vi.fn(async () => {}) }));

function renderAt(path: string, locale: "en" | "de" = "en") {
  pathname.current = path;
  return renderWithI18n(<SiteNav />, { locale });
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

  it("offers the language switcher outside the navigation", () => {
    renderAt("/");
    const switcher = screen.getByRole("group", { name: "Language" });
    expect(screen.getByRole("navigation")).not.toContainElement(switcher);
  });

  it("puts the switcher before the links, as narrow screens show them", () => {
    renderAt("/");
    const switcher = screen.getByRole("group", { name: "Language" });
    const nav = screen.getByRole("navigation");
    expect(switcher.compareDocumentPosition(nav) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("is in German when the language is German", () => {
    renderAt("/groceries", "de");
    expect(screen.getByRole("navigation", { name: "Hauptnavigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Abendessen-Planer" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Diese Woche" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Rezepte" })).toHaveAttribute("href", "/recipes");
    expect(screen.getByRole("link", { name: "Einkauf" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("group", { name: "Sprache" })).toBeInTheDocument();
  });

  it("has no axe violations in German", async () => {
    const { container } = renderAt("/", "de");
    await expectNoAxeViolations(container);
  });
});
