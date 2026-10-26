# Leaving a form with unsaved changes

The recipe form (`components/recipe-form.tsx`) asks before it is left with changes that are not saved
([#42](https://github.com/joeran-kuschel/dinner-planner/issues/42), the visitor's side: [Recipes](../ui/recipes.md#leaving-the-form-with-changes)).
The work is in `components/leave-guard.tsx`, which sits inside the form, so another form can use it the same way (the grocery
list's "Add something else" does not yet).

## What counts as changed

`snapshotForm()` (`lib/form-snapshot.ts`) turns the form's fields into one string: every named field in order, a chosen file by its name,
size and date (not its bytes), a file field with nothing chosen as one constant (the empty file the browser makes has a date of "now"),
and without the hidden `next` field. The guard takes a snapshot when it mounts and compares later ones with it, so a change that is undone
is no change, and rows or tags that come and go (they add and remove fields without an `input` event) are seen by a `MutationObserver`.
The baseline stays when a refused save re-draws the fields with what was typed: the form is still not saved. `startChanged` makes a
form count as changed at once (a recipe read from a link).

The guard is off while a save is under way (`saving`, the form's pending state): the save's own redirect must not be asked about.

## The three ways out

1. **The browser's own** (`beforeunload`): a listener that calls `preventDefault()` and sets `returnValue`, present only while the form
   is changed and not saving. Reload, closing the tab and an address typed in the bar are covered, and so is a link to another site.
2. **The app's links:** Next.js has no hook for blocking a navigation, so a capture-phase `click` listener on `document` runs before
   the router's own. It lets through a click that is no plain navigation (another mouse button, a modifier key, `target` other than
   `_self`, `download`, another origin, the same path with a jump) and stops the rest to open the dialog.
3. **The back and forward buttons:** the Navigation API's `navigate` event, cancelled when it is a `traverse` that is `cancelable`.
   A browser lets a page cancel only a step to an entry of the same document, which is every step the app made itself (links and the
   router); an entry reached by a full page load (an address typed, a reload, another site) is another document, so the step is not
   cancelable and goes through `beforeunload`, i.e. the browser's own prompt (1). **Leave without saving** goes to the entry with
   `navigation.traverseTo(key)`. The API is used only where `window.navigation` has `addEventListener` and `traverseTo`; it is checked
   in Chromium, other browsers follow their own support for it, and without it a step back leaves like any other (or asks through
   `beforeunload` when it leaves the document). A browser may also refuse to cancel a step that is not a user's own.

The guard goes back on at the next edit when a leave did not happen (`bypass`): an entry that was gone, or a navigation that was
cancelled, does not switch it off until a reload.

## The dialog and "Save and leave"

A native modal `<dialog>` (focus goes to the first button, **Stay**; Escape closes it and means stay; the focus goes back to the link).
**Leave without saving** opens the address with the router (or the history entry) with the guard bypassed. **Save and leave** checks the
form (`checkValidity`; an incomplete one closes the dialog and `reportValidity()` says what is missing), writes the address into the
hidden `next` field and calls `requestSubmit()`, so the normal submit runs. `createRecipe` and `updateRecipe` redirect to
`safeSitePath(formData.get("next"))` when it is a path of this site, else to the recipe as before. The field is cleared when the save
ends without leaving, so the next save does not carry it.

## `safeSitePath()`

`lib/safe-path.ts` accepts only a path that starts with a single `/` and stays on this site once resolved (`//host`, `/\host`, a scheme,
a backslash or a control character, an empty value and anything over 2048 characters give `null`). The field can be set by anyone who can
send a request, so this is what keeps "Save and leave" from being an open redirect.

## Tests

Unit tests for the helpers, the guard (links, modifier clicks, the browser prompt, fields that come and go, the Navigation API with a
fake, axe, German) and the form around it, and the actions' redirects; `tests/e2e/unsaved-changes.spec.ts` runs it in Chromium, back
button and `beforeunload` included.
