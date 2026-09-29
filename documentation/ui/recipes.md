# Recipes

Recipes live under **Recipes** in the menu. They are what the [week plan](week-plan.md) suggests for each day and what
the [grocery list](groceries.md) is built from.

The labels below are the English ones; see [Language](language.md) for the German interface.

## The list

`/recipes` shows a card per recipe in alphabetical order: name, a short description (two lines at most), and small facts such as the
servings, the number of ingredients, the prep time and how often it is planned. **New recipe** opens the form. With no
recipes yet, the page says what a recipe needs: a name and its ingredients; the method is optional.

## A recipe

A recipe's page shows its facts (with a link to the source, if it has one), the ingredients with their amounts, the
method as numbered steps, and the upcoming days it is planned for. **Edit** opens the form again; **Back to the plan**
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

**Delete** on the recipe's page does not delete at once. It opens a small question below the button: "Delete “Name”?
Days that only plan it are cleared too." with **Delete recipe** and **Cancel**.

- **Delete recipe** removes the recipe and its ingredients. A day that only planned this recipe is emptied. A day that
  has its own one-off title keeps it.
- **Cancel**, Escape, or using **Delete** again closes the question without deleting, and the focus returns to
  **Delete**.
- The question is a disclosure button that screen readers announce as collapsed or expanded, and it works without
  JavaScript; Cancel and Escape need it.

## Related

- [Week plan](week-plan.md): where a recipe is picked for a day, and the same kind of question for clearing a week.
