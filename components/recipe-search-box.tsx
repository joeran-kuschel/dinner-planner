"use client";

import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCombobox } from "downshift";
import { useRef, useState } from "react";
import { MIN_SUGGESTION_LENGTH, type SearchTerm, searchSuggestions } from "@/lib/recipe-search-terms";

/**
 * The recipe list's search field. From the third letter on it suggests recipe names, tags and
 * ingredients (the WAI-ARIA combobox pattern, via Downshift); before that it is a plain field, and
 * without JavaScript it stays one. Picking a suggestion fills the field and runs the search, since
 * picking one is asking for it. Enter with nothing highlighted just sends the form.
 */
export function RecipeSearchBox({ initial, terms }: { initial: string; terms: SearchTerm[] }) {
  const { i18n } = useLingui();
  const [text, setText] = useState(initial);
  const suggestions = searchSuggestions(terms, text);
  const wrapper = useRef<HTMLDivElement>(null);

  const { isOpen, highlightedIndex, getLabelProps, getInputProps, getMenuProps, getItemProps } = useCombobox<SearchTerm>({
    items: suggestions,
    inputValue: text,
    selectedItem: null,
    itemToString: (term) => term?.text ?? "",
    inputId: "q",
    labelId: "q-label",
    menuId: "q-options",
    getA11yStatusMessage: ({ isOpen: open }) => {
      const count = suggestions.length;
      return open ? t(i18n)`${plural(count, { one: "# suggestion", other: "# suggestions" })}` : "";
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (!selectedItem) return;
      // Downshift reports the pick after the render, too late for state to reach the field before
      // the form is read, and the text may not change at all (the pick can be what was typed). So
      // the field is set directly, and React's state follows.
      const input = wrapper.current?.querySelector("input");
      if (input) input.value = selectedItem.text;
      setText(selectedItem.text);
      wrapper.current?.closest("form")?.requestSubmit();
    },
    stateReducer: (state, { type, changes }) => {
      // Tabbing away from a highlighted suggestion does not pick it.
      const next =
        type === useCombobox.stateChangeTypes.InputBlur
          ? { ...changes, selectedItem: state.selectedItem, inputValue: state.inputValue }
          : changes;
      // An open menu with nothing in it would announce "expanded" over nothing.
      const empty = searchSuggestions(terms, next.inputValue ?? text).length === 0;
      return next.isOpen && empty ? { ...next, isOpen: false } : next;
    },
  });

  return (
    <div ref={wrapper} className="relative">
      <label {...getLabelProps()} className="label">
        {t(i18n)`Search recipes`}
      </label>
      <input
        // As in the day card: the text follows every keystroke here, not Downshift's later callback.
        {...getInputProps({
          onChange: (event) => setText(event.currentTarget.value),
          onKeyDown: (event) => {
            // Downshift would swallow Enter while the list is open; with nothing highlighted it is
            // the way to send the search.
            if (event.key === "Enter" && highlightedIndex < 0) {
              Object.assign(event.nativeEvent, { preventDownshiftDefault: true });
            }
          },
          "aria-describedby": "q-hint",
        })}
        name="q"
        type="search"
        className="field mt-1"
        autoComplete="off"
        placeholder={t(i18n)`Name, tag or ingredient`}
      />
      <p id="q-hint" className="mt-1 text-xs text-muted">
        {t(i18n)`Suggestions appear after ${MIN_SUGGESTION_LENGTH} letters.`}
      </p>
      <ul
        {...getMenuProps({ onMouseDown: (event) => event.preventDefault() })}
        hidden={!isOpen}
        className="absolute z-10 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
      >
        {isOpen &&
          suggestions.map((term, index) => (
            <li
              key={`${term.kind}-${term.text}`}
              {...getItemProps({ item: term, index })}
              className={`flex cursor-pointer items-baseline justify-between gap-3 px-3 py-2 ${
                highlightedIndex === index ? "bg-accent-soft" : ""
              }`}
            >
              {term.text}
              <span className="text-xs text-muted">{kindLabel(term.kind, i18n)}</span>
            </li>
          ))}
      </ul>
    </div>
  );
}

function kindLabel(kind: SearchTerm["kind"], i18n: ReturnType<typeof useLingui>["i18n"]): string {
  switch (kind) {
    case "recipe":
      return t(i18n)`recipe`;
    case "tag":
      return t(i18n)`tag`;
    case "ingredient":
      return t(i18n)`ingredient`;
  }
}
