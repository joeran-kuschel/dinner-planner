import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { I18nClientProvider } from "@/components/i18n-provider";
import { CATALOGS } from "@/lib/i18n/catalogs";
import type { Locale } from "@/lib/i18n/config";

/** A client component with its own state, like a half-filled day card. */
function Note() {
  const { i18n } = useLingui();
  const [value, setValue] = useState("");
  return (
    <label>
      {t(i18n)`Note (optional)`}
      <input value={value} onChange={(event) => setValue(event.target.value)} />
    </label>
  );
}

function tree(locale: Locale) {
  return (
    <I18nClientProvider locale={locale} messages={CATALOGS[locale]}>
      <Note />
    </I18nClientProvider>
  );
}

describe("I18nClientProvider", () => {
  it("translates client components into the given language", () => {
    render(tree("de"));
    expect(screen.getByRole("textbox", { name: "Notiz (optional)" })).toBeInTheDocument();
  });

  it("switches language in place, keeping what was typed and the focus", async () => {
    const user = userEvent.setup();
    const { rerender } = render(tree("en"));
    await user.type(screen.getByRole("textbox", { name: "Note (optional)" }), "Bring wine");

    // What the root layout does after the language cookie changed.
    rerender(tree("de"));

    const field = screen.getByRole("textbox", { name: "Notiz (optional)" });
    expect(field).toHaveValue("Bring wine");
    expect(field).toHaveFocus();
  });
});
