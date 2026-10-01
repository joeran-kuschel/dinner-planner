# Buttons and touch targets

Every button on a page is one of a few kinds, so people can tell at a glance what an action does, and every one of
them can be hit with a fingertip.

## The kinds

| Kind | Looks like | Used for |
| ---- | ---------- | -------- |
| Primary (`.btn-primary`) | Solid tomato pill | The one main action of a page or form: **Save changes**, **Create recipe**, **Add**, **Grocery list for this week** |
| Secondary (`.btn-secondary`) | Outlined | Other actions: **Edit**, **Cancel**, the week arrows, **This week** |
| Ghost (`.btn-ghost`) | Plain muted text | Harmless extras such as **Clear** (the search) |
| Icon (`.btn-icon`) | A ✕ without a frame | Taking one thing out of a list: an ingredient row, a grocery extra, a tag chip |
| Danger, quiet (`.btn-danger-quiet`) | Red text, pink on hover | The buttons that start a destructive action: **Delete**, **Clear the whole week**, **Clear day** |
| Danger (`.btn-danger`) | Solid dark red | The button that confirms a question: **Delete recipe**, **Clear week** |

Red is kept for what removes something. It is deeper and bluer than the terracotta of the primary button, so the confirming
button of a question never looks like **Save**. The colours are the `--danger*` tokens in `app/globals.css`, with a light
red on dark backgrounds in dark mode; text on them keeps at least 4.5:1 contrast in both colour schemes.

**Clear day** acts at once, and offers **Undo** ([Week plan](week-plan.md)). **Delete** and **Clear the whole week** ask
first, with a small question that has the solid danger button ([Recipes](recipes.md), [Week plan](week-plan.md)).

## Touch targets

- With a **mouse**, a ✕ is a 36 px circle and every other button at least 44 px high. Nothing is smaller than the
  24 px that WCAG 2.2 asks for (success criterion 2.5.8).
- On a **touch screen** (the browser reports a coarse pointer) every button is at least **44 px wide and high**, the size of
  a fingertip (the stricter criterion 2.5.5): the week arrows, the ✕ buttons, the tag chips' remove buttons, **Delete**,
  **Clear day** and the rest. Rows that hold such a button become a little taller.

The week arrows ← and → have no visible words, as people know them; a screen reader says "Previous week" and "Next week".

## Keyboard focus

Every button, link and field shows the same solid ring when reached with the keyboard: 3 px in the text colour, 2 px away,
at least 3:1 against every background ([Look and layout](design.md)).

## Not covered here

The tick boxes of the grocery list and the tag filter's checkboxes are small controls that are not buttons; their size is
part of the grocery list's own improvements. They meet the 24 px minimum through their labels.

## Related

- [Week plan](week-plan.md), [Recipes](recipes.md) and [Grocery list](groceries.md): where the buttons are used.
