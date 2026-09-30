import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RequiredMark, RequiredNote } from "@/components/required-mark";
import { expectNoAxeViolations } from "@/tests/support/axe";

describe("RequiredMark", () => {
  it("is an asterisk with the given title, hidden from assistive technology", () => {
    render(<RequiredMark title="Required" />);
    const mark = screen.getByTitle("Required");
    expect(mark).toHaveTextContent("*");
    expect(mark).toHaveAttribute("aria-hidden", "true");
  });

  it("does not change the accessible name of its label's input", () => {
    render(
      <>
        <label htmlFor="item">
          Item <RequiredMark title="Required" />
        </label>
        <input id="item" required />
      </>,
    );
    expect(screen.getByRole("textbox", { name: "Item" })).toBeRequired();
  });
});

describe("RequiredNote", () => {
  it("explains the asterisk", async () => {
    const { container } = render(<RequiredNote>required</RequiredNote>);
    expect(screen.getByText("required")).toBeVisible();
    expect(container.querySelector("[aria-hidden]")).toHaveTextContent("*");
    await expectNoAxeViolations(container);
  });
});
