import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ShelfForm, type ShelfFormValues } from "@/components/shelf-form";
import { MAX_SHELF_NAME, MAX_SHELF_UNIT } from "@/lib/shelf";
import { expectNoAxeViolations } from "@/tests/support/axe";
import { renderWithI18n } from "@/tests/support/render";

const EMPTY: ShelfFormValues = { label: "", quantity: null, unit: null, category: "OTHER", boughtOn: "2026-10-14" };

function renderForm(values: ShelfFormValues = EMPTY, extra: { id?: string; onSubmit?: () => void } = {}, locale: "en" | "de" = "en") {
  const action = vi.fn<(formData: FormData) => Promise<void>>(async () => {});
  const user = userEvent.setup();
  const result = renderWithI18n(<ShelfForm action={action} values={values} submitLabel="Add" {...extra} />, { locale });
  return { user, action, ...result };
}

describe("ShelfForm", () => {
  it("starts with the day it is given and no amount, and limits what can be typed", () => {
    renderForm();
    expect(screen.getByLabelText(/^Bought on/)).toHaveValue("2026-10-14");
    expect(screen.getByRole("textbox", { name: "Amount" })).toHaveValue("");
    expect(screen.getByRole("textbox", { name: /^Item/ })).toHaveAttribute("maxlength", String(MAX_SHELF_NAME));
    expect(screen.getByRole("textbox", { name: "Unit" })).toHaveAttribute("maxlength", String(MAX_SHELF_UNIT));
    expect(screen.getByRole("textbox", { name: /^Item/ })).toBeRequired();
    expect(screen.getByLabelText(/^Bought on/)).toBeRequired();
  });

  it("posts what was typed, and the id only when an entry is changed", async () => {
    const { user, action } = renderForm();
    await user.type(screen.getByRole("textbox", { name: /^Item/ }), "Milk");
    await user.type(screen.getByRole("textbox", { name: "Amount" }), "1,5");
    await user.type(screen.getByRole("textbox", { name: "Unit" }), "l");
    await user.selectOptions(screen.getByRole("combobox", { name: "Category" }), "DAIRY_EGGS");
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const data = Object.fromEntries(action.mock.calls[0][0] as FormData);
    expect(data).toEqual({ label: "Milk", quantity: "1,5", unit: "l", boughtOn: "2026-10-14", category: "DAIRY_EGGS" });
  });

  it("fills itself from the entry it changes and posts its id, and tells its caller when it is sent", async () => {
    const onSubmit = vi.fn();
    const { user, action } = renderForm(
      { label: "Rice", quantity: 500, unit: "g", category: "PASTA_RICE", boughtOn: "2026-10-01" },
      { id: "e1", onSubmit },
    );
    await user.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(Object.fromEntries(action.mock.calls[0][0] as FormData)).toEqual({
      id: "e1",
      label: "Rice",
      quantity: "500",
      unit: "g",
      boughtOn: "2026-10-01",
      category: "PASTA_RICE",
    });
  });

  it("has no axe violations, in English and German", async () => {
    const english = renderForm();
    await expectNoAxeViolations(english.container);
    english.unmount();
    const german = renderForm(EMPTY, {}, "de");
    expect(screen.getByLabelText(/^Gekauft am/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /^Artikel/ })).toBeInTheDocument();
    await expectNoAxeViolations(german.container);
  });
});
