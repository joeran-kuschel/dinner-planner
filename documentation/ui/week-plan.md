# Week plan

The home page (`/`) shows one week, Monday to Sunday, as a card per day. Each card holds the day's dinner, how many
people it is for, an optional note, and a button to clear the day. Everything saves by itself; there is no save button.

The labels below are the English ones; see [Language](language.md) for the German interface.

## Planning a dinner

Each day has a single dinner field that suggests as you type.

- **Clicking the field** lists every recipe.
- **Typing** narrows the list to recipes whose name contains the text, ignoring upper and lower case.
- **A name that is not a recipe yet** gets two extra choices below the list:
  - **Plan "…" for this day only**: the day gets that dinner, and nothing else changes. Good for leftovers, eating out,
    or something you are trying once. It adds nothing to the grocery list.
  - **Add "…" as a new recipe**: a recipe with just that name is created and planned for the day. It then appears in the
    recipe list and in the suggestions on other days. Open it from the recipe list to add ingredients, which then show
    up on the grocery list.

  If the text is exactly a recipe's name (ignoring case), these two choices are not offered, so a recipe cannot be
  created twice by accident.

Picking a suggestion saves the day at once. Typing alone never saves.

**Leaving the field without picking:**

| What the field holds                                  | What happens                                          |
| ----------------------------------------------------- | ----------------------------------------------------- |
| The planned dinner's name (in any case)               | Nothing changes, even if another recipe has that name. |
| Exactly another recipe's name (in any case)           | That recipe is planned.                               |
| Anything else, or nothing                             | The planned dinner is shown again; nothing is saved.  |

Emptying the field never clears the day. Use **Clear day** for that.

## Keyboard

| Key                   | In the dinner field                                                                  |
| --------------------- | ------------------------------------------------------------------------------------ |
| Typing                | Opens and narrows the suggestions.                                                   |
| Down / Up arrow       | Moves through the suggestions (opens them if closed).                                |
| Enter                 | Picks the highlighted suggestion. With none highlighted: plans the recipe whose exact name is typed, or opens the choices for a new name. |
| Escape                | Closes the suggestions; a second Escape puts the planned dinner back.                |
| Tab                   | Leaves the field (see above). It does not pick a highlighted suggestion.             |

Enter in the servings or note field saves the day, like leaving the field does.

## Servings and note

Once a dinner is planned, the card shows **Serves** (1–99) and **Note**. Both save when you leave the field or press
Enter. The servings scale the recipe's ingredients on the grocery list.

## Opening the recipe

A day planned with a recipe has a **View recipe** link at the bottom of its card, next to **Clear day**. It opens the
recipe's page (ingredients and method), so the recipe is one click away while cooking. The link follows the dinner field:
it changes when another recipe is picked and is not shown for a one-off dinner, which has no recipe. For screen
readers the link is named after the day ("View recipe for Monday"), so the seven links can be told apart; the spoken
name starts with the visible text (WCAG 2.5.3).

## Knowing it saved

There is no save button, so the card says when a save is done. While a save is in flight it reads "Saving…" (next to
**Serves**); when the save has gone through this turns into "Saved ✓" and goes away after three seconds. The next save
replaces it with "Saving…" again. A failed save shows no "Saved" but the message below. The words appear on the card
only while a dinner is planned, since **Serves** and **Note** are shown then too.

## When a save fails

If a save does not go through, for example because the picked recipe was just deleted in another tab, the card says
"This day could not be saved", shows what is saved, and reloads the week's data so the suggestions are current again.
The message is announced to screen readers (`role="alert"`) and disappears with the next save.

## Accessibility

- The dinner field follows the WAI-ARIA combobox pattern with a list popup: the field has the role `combobox`, the
  suggestions a `listbox`, and the highlighted suggestion is announced through `aria-activedescendant`. A polite live
  region announces how many suggestions there are. With nothing to suggest (no recipes and nothing typed), the field
  stays collapsed rather than announcing an empty list.
- Every field is labelled with its weekday ("Dinner for Monday", "Note for Monday") for screen readers.
- "Saving…" is announced in a polite live region while a save is in flight, and "Saved" replaces it in the same region
  when the save has gone through. The check mark next to it is decoration and is not read out.
- Saving never moves the keyboard focus, and the page never focuses a field on load.

## Without JavaScript

The dinner field is a plain text field. Pressing Enter saves the day: a name that matches a recipe plans that recipe,
anything else is planned for that day only. Adding a new recipe from the day card needs JavaScript.

## Related

- [Planned meals](../backend/planned-meals.md): how the server stores what the card sends.
