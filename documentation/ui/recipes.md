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
servings, the number of ingredients, the prep time and how often it is planned. **New recipe** opens the form. With no
recipes yet, the page says what a recipe needs: a name and its ingredients; the method is optional.

## A recipe

A recipe's page shows its photo (if it has one), its facts (with a link to the source, if it has one), the ingredients with their amounts, the
method as numbered steps, and the days it is planned for, from the current week on. **Edit** opens the form again; **Back to the plan**
returns to the current week.

## The form

Creating and editing use the same form.

- **Name** is required. Description, prep time (**Minutes**) and **Source** (a web address) are optional.
- **Serves** is the number of people the ingredient amounts are for. The grocery list scales them to the servings
  planned for each day.
- **Ingredients** are rows of amount, unit and name. Leave the amount blank for "to taste". **Add ingredient** adds a
  row, ✕ removes one (the last row stays).
- **Method** is free text, one step per line.

Saving replaces the recipe's ingredients with the rows in the form, in that order. When the server rejects the form, for
example for a blank name, the message is announced and everything typed is still in the form.

## Deleting a recipe

**Delete** on the recipe's page does not delete at once. It opens a small question below the button (as a sheet at the bottom of the screen when the screen is narrower than 640
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
