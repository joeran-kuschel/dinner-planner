# Look and layout

The look of the whole app: one palette, two typefaces, one focus ring and a handful of page layouts. The proposal it
came from is a design canvas ([#33](https://github.com/joeran-kuschel/dinner-planner/issues/33)); this page describes
what is built.

## Colour

Warm paper with a tomato accent. The colours are CSS custom properties on `:root` in `app/globals.css`, redefined for
`prefers-color-scheme: dark`, and reached through Tailwind (`bg-surface`, `text-muted`, `border-field`, …). Never
hard-code a colour in a component.

| Token | Use |
| ----- | --- |
| `background`, `surface`, `surface-muted` | The page, a card or field, a quiet fill (tags, the language switch) |
| `border` | Dividers and card edges. Decorative, so quiet (about 1.4:1) |
| `field-border` (`border-field`) | The edge of an input or select, and the current language. 3:1 or more on every background (WCAG 1.4.11). Checkboxes are the browser's own |
| `foreground`, `muted` | Text. `muted` keeps 4.5:1 on the page, on cards and on `surface-muted` |
| `accent`, `accent-hover`, `accent-soft` | The primary button, today's row, the active tab on a phone |
| `accent-text` | Accent-coloured **text** on `accent-soft`; plain `accent` is 4.3:1 there, short of AA |
| `herb`, `herb-soft` | "Done": the grocery progress bar and a ticked box. Tomato means "do this", herb means "done" |
| `ochre`, `ochre-soft` | A third tile colour for recipes without a photo |
| `danger*` | Destructive actions only ([Buttons](buttons.md)) |

Text on every pair above keeps at least 4.5:1 in both colour schemes.

## Type

Fraunces (display) for page titles, section titles, day dates and the grocery count; Hanken Grotesk for everything
else, 16 px base. Both come from `next/font/google`: they are downloaded when the app is built and served by the app
itself, so the running app makes no request to Google. Use `.page-title` for an `h1` and `.section-title` for an `h2` of
a section; `font-display` for any other serif number or heading.

## Shapes

Buttons and tags are pills (fully rounded), cards 16 px, fields 12 px. Every control is at least 44 px high, and the
primitives (`.btn-*`, `.field`, `.card`, `.pill`) carry this, so a page rarely needs its own classes.

## Focus

One indicator for every link, button and field: a 3 px ring in the text colour with a 2 px offset, set once in
`app/globals.css` (`:focus-visible`). It is at least 3:1 against every background. A control must not remove it.

## Navigation

`SiteNav` is one `<nav aria-label="Main">`. From the `sm` breakpoint (640 px) it sits in the header: the active page is a
dark pill. Below it, the same element is a **tab bar fixed to the bottom edge** with an icon and a word per page, where a
thumb reaches; the active tab is tomato. The language switch stays in the header, before the links in the keyboard order; the current language has a visible outline as well as darker text. The page leaves room under its content
(`pb-28`) and `scroll-padding-bottom` for the bar.

## Icon

The browser tab, bookmarks and the phone's home screen show the logo from the header: a tomato disc with a plate. `app/icon.svg`
is the source (Next.js links it by itself); `app/apple-icon.png` (180 px) and `app/favicon.ico` are rendered from it for
browsers that do not use SVG. Change the SVG, then render the other two again.

## Pages

- **Week plan** ([Week plan](week-plan.md)): one card with seven rows instead of seven cards. Each row has the day and date
  on the left (a dark-on-soft tint and "today" for the current day) and the dinner, servings, note and actions on the
  right; on a phone the day sits above them.
- **Recipes** ([Recipes](recipes.md)): a three-column card grid. A recipe without a photo gets a flat colour tile with a
  fork and knife (decorative, hidden from screen readers), cycling through tomato, herb and ochre.
- **Recipe**: the title and facts in the display type, a rounded photo, ingredients and method side by side, numbered steps.
- **Grocery list** ([Grocery list](groceries.md)): "n of m ticked off" in the display type with a progress bar (the words are
  the status; the bar is hidden from assistive technology), and the shop sections in two columns from `md`.

## Related

- [Buttons](buttons.md): the button kinds and touch targets.
