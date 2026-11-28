# Forms and server actions

## Server actions

- **A `"use server"` file may only export async functions.** Exporting a constant or an object from `app/actions/*` compiles and
  type-checks, then fails at runtime. Shared constants and types live in `lib/` (`planner.ts`, `recipe-form.ts`).
- **Mutations must revalidate every view they touch.** The plan, the recipes and the grocery list all read the same data; each action
  calls `revalidatePath` for all the affected routes.
- **Deleting a recipe clears the days that only pointed at it.** The schema says `onDelete: SetNull`, which on its own would leave days
  naming nothing at all: invisible in the week view but still counted as planned. `deleteRecipe` removes those rows in the same transaction.
- **Recipe edits replace the ingredient set.** Rows have no stable identity in the form, so `updateRecipe` does `deleteMany` + `create`
  and row order is authoritative.

## React 19 resets a form after its action resolves

Keep this in mind when touching forms. What is already handled:

- `DayCard` auto-saves while the user keeps typing, so it avoids the reset: its `onSubmit` cancels the submit and calls the server
  action in a transition (`useAutoSave`); the form's `action` props only serve browsers without JavaScript. Servings and note stay
  uncontrolled, and when the server value changes `useServerSync` updates every field except the focused one. Don't re-key the fields
  instead: a remount drops the keyboard focus after every auto-save.
- The dinner field is a Downshift combobox and the one controlled field: its text must update in the input's own `onChange`
  (Downshift's `onInputValueChange` comes a render late and fast typing drops characters). Picking a suggestion saves, and so do Enter
  and leaving the field (`settle()`): another recipe's exact name plans that recipe, any other text becomes a one-off dinner, and an
  emptied field puts the planned dinner back, so it never clears the day. Escape twice also puts it back. A press of the pointer on
  "Leftovers" or "Clear day" (`data-replaces-dinner`) discards the text being typed instead, so it is never planned first; a blur while
  the window has lost focus or an IME is composing settles nothing. A failed save is caught in `useAutoSave`: the card shows an alert,
  falls back to the saved dinner and refreshes the router.
- The card's first submit button is a hidden one, so Enter in a text field saves. Without it, Enter would submit through "Clear day" and
  wipe the day.
- On a validation error the reset throws away everything the user typed, so the recipe actions echo the submitted values back in
  `RecipeFormState.values` and the form re-fills from those, re-keyed on `attempt`.
- `RecipeForm` submits through a transition so the reset does not empty the photo's file field, which a browser cannot fill in again;
  see [Recipe photos](recipe-photos.md).

## Dates and the database client

- **Dates are calendar days, not instants.** Every planner day is a `Date` pinned to UTC midnight, and `PlannedMeal.date` is the primary
  key. Build days with the helpers in `lib/week.ts` (`today()`, `parseDayKey()`, `startOfWeek()`): a bare `new Date()` lands on a
  local-time instant that matches no row. All display formatting is pinned to `timeZone: "UTC"` for the same reason. Weeks start Monday.
- **The `pg` driver adapter ignores `?schema=`.** Only the Prisma CLI honours that parameter; the driver treats it as an unknown
  connection option and silently uses `public`. Every `PrismaClient` must therefore get its adapter from `createPgAdapter()` in
  `lib/prisma-adapter.ts`, which parses the schema out of `DATABASE_URL` and passes it to `PrismaPg` explicitly. Building a client by
  hand is how the test suite ended up writing into the development data.
