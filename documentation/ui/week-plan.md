# Week plan

The home page (`/`) shows one week, Monday to Sunday, as a card per day. Each card holds the day's dinner, how many
people it is for, an optional note, and a button to clear the day. Everything saves by itself; there is no save button.

The labels below are the English ones; see [Language](language.md) for the German interface.

## Moving between weeks

**←** and **→** above the cards open the week before and after, and **This week** returns to the current one; screen
readers hear "Previous week" and "Next week". The week is in the address (`/?week=2027-01-04`): any day of a week opens
that week from its Monday, and a missing or malformed value shows the current week. The
[grocery list](groceries.md) has the same buttons.

## Planning a dinner

Each day has a single dinner field that suggests as you type.

- **Clicking the field** lists every recipe.
- **Typing** narrows the list to recipes whose name or one of whose [tags](recipes.md) contains the text, ignoring
  upper and lower case. When a tag made the match, it is shown after the name ("Chickpea curry vegan"). Picking the
  recipe puts its name in the field, never the tag.
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
**Serves**); when the save has gone through this turns into "Saved ✓" and goes away after three seconds. A later save
replaces it with "Saving…" and restarts the three seconds when it is done. A failed save shows no "Saved" but the
message below.

- The words appear on the card only while a dinner is planned, since **Serves** and **Note** are shown then too. Screen
  readers hear them either way (see Accessibility).
- **Clear day** has no "Saved": the card is empty afterwards. It says "Day cleared" and offers **Undo** instead (see
  Clearing).
- Saves can overlap, for example a note left while the servings are still saving. Only the latest save reports back;
  an older one that finishes late neither confirms nor blames what the user has since changed.

## Clearing

**Clear day** empties one day at once, without asking, because it can be undone. Afterwards the card says "Day cleared"
with an **Undo** button, and the focus moves to it, since the **Clear day** button that had it is gone.

- **Undo** puts the day back as it was: the dinner (a recipe or a one-off title), the servings and the note. Afterwards
  the focus is on the dinner field.
- The offer stays until the next save on that card, however long that takes; there is no timer to beat. Reloading the
  page or leaving the week ends it.
- If the undo cannot be saved, for example because the recipe was deleted in the meantime, the card shows the usual
  "could not be saved" message.

**Clear the whole week** (bottom of the page, only when something is planned) asks first, because it cannot be undone:
a small question opens above the button (on a screen narrower than 640 px, as a sheet at the bottom of the screen, so it
never runs off the side), "Remove 3 planned dinners from this week?", with **Clear week** and **Cancel**.
Cancel, Escape, or using the button again closes the question and puts the focus back on the button. Once confirmed, the button goes away with the plan, so the focus moves to the page heading; the confirm button is off while the week is being cleared, so a double click cannot run it twice. The same question
pattern is used for deleting a recipe; see [Recipes](recipes.md).

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
- Save progress is announced by a polite live region that is on every card from the start, even before a dinner is
  planned, so a screen reader is already listening when the first save of an empty day finishes. It says "Saving…"
  while a save is in flight and "Saved" when it has gone through. The words shown beside **Serves** are the same text,
  hidden from assistive technology so nothing is read twice; the check mark is decoration.
- Saving never moves the keyboard focus, and the page never focuses a field on load. Only clearing a day does, to Undo
  and then to the dinner field, because the focused button is removed.

## Without JavaScript

The dinner field is a plain text field. Pressing Enter saves the day: a name that matches a recipe plans that recipe,
anything else is planned for that day only. Adding a new recipe from the day card needs JavaScript. **Clear the whole
week** asks first without JavaScript too; **Undo** for a cleared day needs it.

## Related

- [Planned meals](../backend/planned-meals.md): how the server stores what the card sends.
- [Grocery list](groceries.md): the shopping list worked out from the week, with the same week buttons.
- [Recipes](recipes.md): the recipe pages, including deleting a recipe.
