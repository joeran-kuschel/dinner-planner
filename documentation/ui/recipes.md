# Recipes

Recipes live under **Recipes** in the menu. They are what the [week plan](week-plan.md) suggests for each day and what
the [grocery list](groceries.md) is built from.

The labels below are the English ones; see [Language](language.md) for the German interface.

## The photo

A recipe can have one photo. It is shown at the top of the recipe's card in the list and above the ingredients on the
recipe's page. A recipe without a photo has no image and no empty space for one.

In the form, the **Photo** section holds:

- the current photo, if there is one, with **Remove photo**;
- a file field: **Photo file**, or **Replace photo** when there is one. JPEG, PNG or WebP, up to 5 MB;
- **Description of the photo**: what it shows, for people who cannot see it (at most 200 characters). Every photo needs one,
  and it is what screen readers read in place of the image. With a photo already there you can change only the
  description.

Saving scales the photo down (the recipe page's image to 1200 px on the long edge, the card's to a 3:2 crop of 480 x 320)
and removes what the camera wrote into it, such as the position. Photos are kept in the database and included in the
backups; see [Recipe photos](../backend/recipe-photos.md) for how.

**Mistakes are caught before anything is sent.** The description is required as soon as a file is chosen, and a file over
5 MB is refused on the spot with the limit named, so nothing large is uploaded for nothing.

**A refused form keeps the photo.** If the server refuses the form for another reason, for example a missing name, the
message is shown and everything stays as it was: the chosen file, its description, the other fields. Fix the one thing
and save again; the photo is uploaded with that retry. (Without JavaScript a browser cannot keep a chosen file, so there
the photo has to be chosen again.) If the file itself is refused, because it is no image or not one of the three types,
the form says so and you choose another.

## The list

`/recipes` shows a card per recipe in alphabetical order: its photo (if it has one), name, a short description (two lines at most), and small facts such as the
servings, the number of ingredients, the prep time and the next day it is planned for ("next Tue 6 Oct": the earliest planned day from today on, today included). A recipe with no planned day from today on shows no such fact, and the number of days it has been planned is not shown. (The recipe's own page lists the days it is planned for from the start of the current week, so it can name an earlier day of this week that the card leaves out.) **New recipe** opens the form. With no
recipes yet, the page says what a recipe needs: a name and its ingredients; the method is optional.

### Searching

Above the cards, the **Search recipes** form finds recipes by **name, tag or ingredient**: type a word and press
**Search**. The tags in use are shown as checkboxes in a **Tags** disclosure under it ("Only recipes with all of these tags"), closed so a long list does not push the recipes down. It opens by itself while a tag filters, and then the summary counts them ("Tags (2 selected)"; the count follows the applied filter, so it changes when you press **Search**). It is a native `<details>`, so it works with the keyboard and without JavaScript, and ticked tags are sent with the form also while it is closed. With several
ticked, a recipe must have every one of them. The word and the tags work together. The header then reads "3 of 12
recipes", and **Clear** starts over. When nothing matches, the page says so. The search is an ordinary form, so it works
without JavaScript, and the result has an address of its own (`/recipes?q=lentil&tag=quick&tag=vegan`) that can be
bookmarked. A tag in the address that no recipe has any more still filters, so it appears among the checkboxes, ticked, and can be
unticked. Only the first 100 characters of the word and up to ten tags are read. Capital letters do not matter; `%` and `_` are searched for as the characters they are. Only the name,
tags and ingredient names are searched, not the description or the method.

**Suggestions:** from the **third letter** on, the field lists up to eight recipe names, tags and ingredients that
contain what you typed (those that start with it first), each marked "recipe", "tag" or "ingredient". Fewer letters
would match too much to help, and a line under the field says so. Picking a suggestion, with the mouse or with the arrow
keys and Enter, fills the field and runs the search. Enter with nothing highlighted searches for what is typed, and Tab
leaves the field without picking. The number of suggestions is announced. Without JavaScript the field is a plain one.

A card shows the recipe's tags under its description.

## A recipe

A recipe's page shows its photo (if it has one), its facts (with a link to the source, if it has one), the ingredients with their amounts, the
method as numbered steps, and the days it is planned for, from the current week on. **Edit** opens the form again; **Back to the plan**
returns to the week the recipe was opened from: the day card's **View recipe** link carries its week
(`/recipes/<id>?week=2027-01-04`), and a missing or malformed value means the current week, as when the recipe is opened
from the list. The week is not carried through **Edit** and **Save**: a recipe page reached that way leads back to the
current week. Its tags are links to the list filtered by that tag.

## The form

Creating and editing use the same form.

- **Name** is required (see "Mandatory fields" below). Description, prep time and **Source** (a web
  address) are optional.
- **Serves** is the number of people the ingredient amounts are for. The grocery list scales them to the servings
  planned for each day.
- **Prep time (min)** is how many minutes the recipe takes.
- **Ingredients** are rows of amount, unit, name and category, with the column names above them (on a phone each
  field has its own small name above it). Leave the amount blank for "to taste"; the note under the heading says so, and
  screen readers read it with every amount field.
  - **Unit** suggests the common ones (g, kg, ml, l, EL, TL, tbsp, tsp, cup, piece, pinch, clove) and every other unit your recipes
    already use (the common ones in the page's language, except "EL" and "TL", which are offered in both languages and
    listed once in German; the grocery list does not merge "EL" with "tbsp" or "TL" with "tsp"), so "g" and "grams" do not end up as two lines on the grocery list. You can still type any unit.
  - The **category** (the section of the shop, "Other" by default) decides where the ingredient sits on the
    [grocery list](groceries.md); screen readers hear it as "Category for ingredient 2".
  - **Enter** in an amount, unit or name field jumps to the first field of the next row, and after the last row it adds
    one. Enter in a row with nothing in it saves the recipe, so the keyboard never gets stuck in the list.
  - **Add ingredient** adds a row, ✕ removes one (the last row stays).
- **Tags** label the recipe ("vegetarian", "quick") so it can be found again. Type a tag and press **Enter** or type
  a **comma**: it becomes a chip under the field. A chip's ✕ ("Remove tag vegetarian") takes it away again; the focus moves on to the next chip's ✕, or to the field
  when none is left. A recipe
  has up to 10 tags of up to 30 characters. Tags are lowercased ("Quick" and "quick" are one tag) and a tag is only
  added once. The tags already used by other recipes are offered while you type. Enter with nothing typed sends the
  form like in any other field, and text still in the field when you save is added as a tag. Chips appearing and
  disappearing are announced to screen readers ("Added tag quick", "Removed tag quick"). Without JavaScript, type the
  tags into the field separated by commas.
- **Method** is free text, one step per line.

Saving replaces the recipe's ingredients with the rows in the form, in that order. When the server rejects the form, for
example for a blank name, the message is announced and everything typed is still in the form.

## Adding a recipe from a link

On the recipe list, **New recipe** is a split button. The main part opens the empty form, as always; the arrow beside it
("More ways to add a recipe") opens a short menu with **Add from a link**. It leads to the New recipe page with a dialog
already open, and the page has the same **Add from a link** button above the form for another go.

**The dialog** is a modal dialog titled "Add from a link": it asks for the **Link to the recipe** (focus starts there),
with **Import** and **Cancel**. Everything behind it is inert, Tab stays inside, and Escape or **Cancel** closes it and
puts the focus back on the button that opened it.

- A typo (anything that does not start with `http://` or `https://`) is answered at once, inside the dialog, without
  asking the server. The dialog stays open and the focus goes back to the field.
- While the page is being fetched the dialog says "Fetching the page…" (announced to screen readers) and the button
  reads "Importing…". **Cancel** (or Escape) stops the wait: the request to the server is cancelled and the dialog
  closes. A page that takes more than 10 seconds counts as too slow.
- A problem comes back as a message in the dialog, which stays open for a corrected address: the page could not be
  fetched, took too long, is too large (over 2 MB) or is no web page, the address points to this computer or a private
  network (which is never fetched), or the page has no recipe data.
- On success the dialog closes, the form is filled in and the focus is on its name. "Recipe imported. Check it, then
  press “Create recipe”." is announced. **Nothing is saved** until you press **Create recipe**; going away keeps nothing.
  Importing again replaces the form with the new recipe.

**What is filled in** (from the recipe data the website publishes for search engines): the name, a one-line description,
how many people it serves, the prep time (the total time when there is no prep time), the page's address as the source,
the method (one step per line), up to six tags (category and cuisine first, then the site's keywords) and the
ingredients. Each ingredient line is split into amount, unit and name: "200 g flour", "1½ cups rice" or "½ TL Salz"
become 200 / g / flour, 1.5 / cup / rice and 0.5 / TL / Salz, in English and German. A range ("2–3 cloves") is shopped
for at its upper end, notes after a comma or in brackets are dropped from the name ("garlic, minced" → "garlic"), and
what cannot be read stays in the name. Every ingredient starts in **Other**.

**The photo** comes along when the page names a picture for the recipe: after the recipe, the dialog says "Fetching the
photo…" and puts the picture in the form's **Photo file** field as if you had chosen it (you see its name, for example
`lemon-pancakes.jpg`). The **Description of the photo** starts as the recipe's name, a starting point only: it is required
for every photo, so change it to say what the picture shows. Saving uploads the photo like any other and re-encodes it
(see [The photo](#the-photo)); take it away by choosing another file, or use the form without it. A picture has to be a
JPEG, PNG or WebP of at most 5 MB. When it is none of these or cannot be fetched, the recipe is imported anyway, the
photo field stays empty and the page says "Recipe imported, but its photo could not be fetched." (The page without
JavaScript cannot fill the file field: there the photo has to be chosen yourself.) The photo belongs to the website; the
source link stays on the recipe. Always check the result: websites word things in their own way.

**Without JavaScript** the same thing is a plain form. **Add from a link** in the menu leads to the New recipe page,
which then shows a **Link to the recipe** field with an **Import** button above the form. Sending it opens the page
again with the form filled in (`/recipes/new?from=<link>`); a problem is shown as a message beside the field. How it
works and what it will not fetch: [Recipe import](../backend/recipe-import.md).

## Mandatory fields

A field that has to be filled in shows a "*" after its label, and the line "* required" at the top of the form explains
it. The mark is text, not just a colour, and it is drawn by the shared `RequiredMark` and `RequiredNote`
(`components/required-mark.tsx`), so every form marks its mandatory fields the same way. `Field` adds the mark by itself
whenever its input is `required`.

- The asterisk has a title ("Required" / "Pflichtfeld") for mouse users. Touch and keyboard users get the note instead,
  since a title does not show for them.
- Screen readers skip the asterisk (`aria-hidden`): the `required` attribute already announces the field, so it is not
  read twice.
- **Description of the photo** is marked only while it is required: once a file is chosen, or while the current photo
  stays. Ticking "Remove photo" takes the mark away again.

## Deleting a recipe

**Delete** on the recipe's page (red, see [Buttons](buttons.md)) does not delete at once. It opens a small question below the button (as a sheet at the bottom of the screen when the screen is narrower than 640
px): "Delete “Name”?
Days that only plan it are cleared too." with **Delete recipe** and **Cancel**.

- **Delete recipe** removes the recipe, its ingredients and its photo. A day that only planned this recipe is emptied. A day that
  has its own one-off title keeps it.
- **Cancel**, Escape, or using **Delete** again closes the question without deleting, and the focus returns to
  **Delete**.
- While the recipe is being deleted, **Delete recipe** is off, so a double click cannot delete twice.
- The question is a disclosure button that screen readers announce as collapsed or expanded, and it works without
  JavaScript; Cancel and Escape need it.

## Related

- [Week plan](week-plan.md): where a recipe is picked for a day, and the same kind of question for clearing a week.
