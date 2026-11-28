---
paths:
  - "app/page.tsx"
  - "app/actions/meals.ts"
  - "components/day-card*.tsx"
  - "lib/planner.ts"
  - "lib/week.ts"
  - "lib/cook-again.ts"
  - "lib/leftovers.ts"
  - "components/cook-again.tsx"
  - "components/leftovers-dialog.tsx"
---

# Week plan

Details: `documentation/backend/planned-meals.md`, `forms-and-actions.md`, `documentation/ui/week-plan.md`.

- **React 19 resets a form after its action resolves.** `DayCard` auto-saves through `useAutoSave` (`onSubmit` cancels the submit and
  calls the action in a transition) and `useServerSync` updates every field except the focused one. Servings and note stay
  uncontrolled; never re-key the fields (a remount drops the keyboard focus).
- The dinner field is a Downshift combobox and the one controlled field: update its text in the input's own `onChange`. Picking a
  suggestion, Enter and leaving the field save (`settle()`); an emptied field puts the planned dinner back; a pointer press on
  "Leftovers" / "Clear day" (`data-replaces-dinner`) discards the typed text. A failed save shows an alert and refreshes the router.
- The card's first submit button is a hidden one, so Enter saves; without it Enter would submit through "Clear day".
- **A typed dinner name is resolved on the server** (`setPlannedMeal`, `isSameDinner`): the picked recipe while the text still names it,
  then a recipe with that name, then a new one if asked, else a one-off `customTitle`.
