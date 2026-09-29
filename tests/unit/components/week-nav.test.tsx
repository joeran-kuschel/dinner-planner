import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { testI18n } from "@/tests/support/i18n";
import { WeekNav, type WeekNavProps } from "@/components/week-nav";
import { parseDayKey } from "@/lib/week";

// Monday 28 Sep 2026; the week before starts on 21 Sep, the one after on 5 Oct.
const WEEK_START = parseDayKey("2026-09-28")!;

function renderNav(props: Partial<WeekNavProps> & { locale?: "en" | "de" } = {}) {
  const { locale = "en", ...rest } = props;
  return render(<WeekNav basePath="/" weekStart={WEEK_START} i18n={testI18n(locale)} {...rest} />);
}

describe("WeekNav", () => {
  it("links to the week before and after, and back to this week, on the plan", () => {
    renderNav({ basePath: "/" });
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute("href", "/?week=2026-09-21");
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "Next week" })).toHaveAttribute("href", "/?week=2026-10-05");
  });

  it("stays on the grocery list when used there", () => {
    renderNav({ basePath: "/groceries", thisWeekLabel: "This week's list" });
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute("href", "/groceries?week=2026-09-21");
    expect(screen.getByRole("link", { name: "This week's list" })).toHaveAttribute("href", "/groceries");
    expect(screen.queryByRole("link", { name: "This week" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Next week" })).toHaveAttribute("href", "/groceries?week=2026-10-05");
  });

  it("keeps \"This week\" when no other label is given", () => {
    renderNav({ basePath: "/groceries" });
    expect(screen.getByRole("link", { name: "This week" })).toHaveAttribute("href", "/groceries");
  });

  it("crosses a year boundary", () => {
    renderNav({ weekStart: parseDayKey("2027-01-04")! });
    expect(screen.getByRole("link", { name: "Previous week" })).toHaveAttribute("href", "/?week=2026-12-28");
  });

  it("puts the previous week first, then this week, then the next", () => {
    renderNav();
    expect(screen.getAllByRole("link").map((link) => link.getAttribute("aria-label") ?? link.textContent)).toEqual([
      "Previous week",
      "This week",
      "Next week",
    ]);
  });

  it("names the arrows in German", () => {
    renderNav({ locale: "de", basePath: "/groceries", thisWeekLabel: "Einkaufsliste dieser Woche" });
    expect(screen.getByRole("link", { name: "Vorige Woche" })).toHaveAttribute("href", "/groceries?week=2026-09-21");
    expect(screen.getByRole("link", { name: "Einkaufsliste dieser Woche" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Nächste Woche" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderNav();
    await expectNoAxeViolations(container);
  });
});
