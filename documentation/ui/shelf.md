# On the shelf

**On the shelf** (`/shelf`, in the menu next to **Groceries**; German: **Im Regal**) lists what you have at home, so you can
see it before you plan dinners and shop. It is a list you keep yourself: nothing is worked out from the plan, and nothing
comes off the shelf unless you remove it.

The labels below are the English ones; see [Language](language.md) for the German interface.

## What is on it

- **Purchases.** Each entry is one purchase: a name, an optional amount (quantity and unit), the day it was bought and a
  shop section. The same name can be on the shelf many times, each time with its own day and amount (milk bought on two
  days is two entries).
- **Staples.** The [pantry staples](groceries.md) are listed too, marked **Staple**. A staple without a purchase says "No
  purchase noted. Ticking it off on the grocery list adds one."

Nothing is added from the grocery list except pantry staples, and no amount ever comes from the list: you usually buy more
than a recipe needs, so a ticked staple has a day and no amount (you can add one with **Edit**).

## The page

- The header says what the page is for. **Add to the shelf** is a form that is always open:
  **Item** (required), **Amount**, **Unit**, **Bought on** (required, a date, today at first) and **Category**. **Add** puts
  the purchase on the shelf and clears the form for the next one.
- The shelf is grouped by the same shop sections as the [grocery list](groceries.md), in the same order, each with a
  heading and the number of names in it ("Dairy and eggs (1)"); **Other** is last. A section with nothing in it is not shown.
- Under a section, each name has a block: its name as a heading, **Staple** when it is one, and its purchases, newest
  first, as "1.5 l · bought 12 Oct 2026" (or just "bought 5 Oct 2026" without an amount). A name sits in the section of its
  newest purchase, and a staple with no purchase in **Other**.
- **Edit** on a purchase opens the same form with its values, **Save** keeps them. **Remove** asks first ("Remove Milk,
  bought 1 Oct 2026, from the shelf?"). Every button names its entry for a screen reader ("Edit Milk, 12 Oct 2026").
- **Remove** on a staple asks "Stop treating … as a staple?": the staple goes, its grocery lines show on the list again, and
  its purchases stay on the shelf. It does not put anything on the grocery list.

Removing an entry or a staple puts the keyboard focus on the page heading. A purchase that cannot be saved (more than
1000 entries, or a request the browser would not have sent) is ignored without a message, as on the grocery list's
**Add something else**.

An empty shelf says "Nothing on the shelf yet. Add what you have at home, or tick off a pantry staple on the grocery list."

## On the grocery list

A line of the grocery list whose name has a purchase on the shelf says **On the shelf** in its second line, which a screen
reader reads with the checkbox. It is a note, the line stays where it is, and it goes away when the line is ticked off.
Only lines worked out from the plan carry it; a line you added by hand does not. Names are compared like those of pantry
staples: whole name, any case, the unit does not matter.

## A staple ticked off

Ticking a **pantry staple** line makes an entry: its name and section, today's date, no amount. That works wherever the line
is visible (the hidden staples are shown with "Show the … hidden items", and a staple added by hand is always shown).
Unticking the line takes exactly that entry off again. Entries you added yourself are never touched by ticking, and
editing a ticked entry (an amount, say) keeps it tied to its line.
