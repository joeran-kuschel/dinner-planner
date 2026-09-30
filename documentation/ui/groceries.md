# Grocery list

The grocery page (`/groceries`) shows one shopping list for one week, Monday to Sunday. It is worked out from the
week's plan every time the page opens, so there is nothing to keep in step: plan or change a dinner, or edit a recipe,
and the list follows. Open it from **Grocery list for this week** on the plan page, or from **Groceries** in the menu.

The labels below are the English ones; see [Language](language.md) for the German interface.

## The week

The header shows the week (for example "28 Sept – 4 Oct 2026") and how many recipes the list is built from.

- **←** and **→** open the week before and after, and **This week's list** returns to the current one. They work like
  the same buttons on the [week plan](week-plan.md) and stay on the grocery list. Screen readers hear the arrows as
  "Previous week" and "Next week". The middle button is not called "This week" here, because the menu's **This week**
  opens the plan and two links with one name and different targets would be confusing.
- **Edit the plan** opens the plan of the week you are looking at.

The week is in the address (`/groceries?week=2027-01-04`); any day of a week opens that week from its Monday, and a
missing or malformed value shows the current week.

## The list

Every line is one ingredient with its amount on the right and, in small text, the recipes that need it. The lines are
grouped by where they are found in the shop, and inside a group they are in alphabetical order.

### Shop sections

Each section has a heading with the number of open lines, for example "Dairy and eggs (2)". The sections come in the
order of a walk through the shop: **Fruit and vegetables**, **Bakery**, **Meat and fish**, **Dairy and eggs**,
**Pantry**, **Frozen**, **Drinks** and **Other**. A section with no open line is not shown. The set is fixed; the
German names are "Obst und Gemüse", "Backwaren", "Fleisch und Fisch", "Milchprodukte und Eier", "Vorräte",
"Tiefkühlware", "Getränke" and "Sonstiges".

The section of a recipe's ingredient is chosen in the [recipe form](recipes.md); a new ingredient starts in **Other**,
and so does everything that existed before sections were introduced. When recipes file the same merged ingredient
differently, the one that comes first in the shop order wins (**Other** never does). A line added by hand gets its section from the **Category**
field of the form below.

- The same ingredient from several recipes becomes one line with the amounts added up, scaled by the servings planned
  for each day. Ingredients merge only when name and unit match; one ingredient without an amount makes the whole
  line read "to taste".
- **Tick a line** to move it to **In the basket**, under the sections. The basket shows each line's section in small
  text, because the line has left its section. Untick it to move it back. The ticks are saved, so they are still there
  after a reload, and changing an ingredient's section never unticks it.
- When everything is ticked off, the open list says so.
- **Untick everything** appears once something is ticked and starts the week's shopping over.

## Adding something else

**Add something else** puts a line on the list that no recipe asks for, such as washing-up liquid. Fill in the item
and, if you like, an amount, a unit and a **Category** (**Other** unless you choose one). Lines added by hand are marked "added by hand" and are the only ones with a ✕
to remove them; lines that come from the plan cannot be deleted, since they would return with the plan.

The **Item** is the only mandatory field. It carries an "*" in the accent colour in its label, and the line "* required" above
the fields explains the mark (see "Mandatory fields" in [recipes](recipes.md)).

## Accessibility

- Each section is a landmark region named by its heading, so screen reader users can jump from section to section by
  heading or region. **In the basket** is one too.
- Each checkbox is named after its item ("Tick off Rice"), and each ✕ after the line it removes.
- Ticked lines are struck through and muted rather than faded, which keeps their text at AA contrast.
- The week buttons are ordinary links, so they work with the keyboard and without JavaScript.

## Related

- [Week plan](week-plan.md): where the dinners and servings that feed this list are set.
