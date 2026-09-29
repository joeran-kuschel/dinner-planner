# Language

The app speaks English and German. Everything the app itself writes is translated: page titles, headings, buttons,
field labels and placeholders, the dinner suggestions, error messages, the "page not found" page, what screen readers
announce, and the dates and amounts. What you type yourself (recipe names, ingredients, units, notes) stays as you wrote it.

## Switching

The header has two buttons, **English** and **Deutsch**, each named in its own language. The current language is the
highlighted one. Pressing the other switches the page in place:

- The page does not reload. What you have typed so far (a half-filled recipe, a note) and the keyboard focus stay where
  they were.
- A message already on screen, such as a recipe form's validation error, changes language too.
- The browser tab's title changes with the page.

Without JavaScript the buttons still work: the browser posts the choice and gets the page back in the new language.

## Which language you get

1. The language you picked with the switcher, remembered for a year in this browser.
2. Otherwise the first language in your browser's settings that the app has (German for `de`, `de-AT`, `de-CH` and so
   on).
3. Otherwise English.

The choice is per browser, not per person: another browser or device starts from its own settings.

## Dates and numbers

| | English | German |
| --- | --- | --- |
| Week | 28 Sept – 4 Oct 2026 | 28. Sept. – 4. Okt. 2026 |
| Weekday and date | Monday · 28 Sept | Montag · 28. Sept. |
| Amounts | 1.5 kg | 1,5 kg |

Dates stay the same calendar day whatever your time zone (see "Dates" in `CLAUDE.md`); only their spelling changes.
Weeks start on Monday in both languages. Amounts have no thousands separator in either language ("1500 g").

## Accessibility

- The page's language (`<html lang>`) always matches the text, so screen readers pronounce it correctly, and it changes
  with the switch.
- The two buttons form a group labelled "Language" / "Sprache". The current one is marked `aria-pressed="true"`, and
  each button carries its own `lang`, so "Deutsch" is read in German on an English page and vice versa.
- The switcher sits in the header next to the app name, outside the main navigation: it changes the language and goes
  nowhere. On narrow screens the navigation links move to a row of their own, so nothing needs sideways scrolling at
  320 px, even with the longer German labels. The keyboard follows the same order on every screen size: app name,
  switcher, then the links.
- The header stays at the top while scrolling. The page keeps room for it, so a field that gets the keyboard focus is
  never hidden underneath (WCAG 2.4.11).
- The German pages are checked with axe (WCAG 2.2 AA, including contrast) like the English ones.
