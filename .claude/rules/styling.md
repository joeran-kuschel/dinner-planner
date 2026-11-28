---
paths:
  - "app/globals.css"
  - "components/**"
  - "app/**/*.tsx"
---

# Styling

Colours are CSS custom properties on `:root` in `app/globals.css`, redefined under `prefers-color-scheme: dark`, and exposed to
Tailwind through `@theme inline`. Use the tokens (`bg-surface`, `text-muted`, `border-border`, `bg-accent`) and the `.card` /
`.field` / `.btn-*` / `.label` primitives rather than hard-coding colours.

- Tailwind v4 cannot `@apply` one custom class inside another, which is why the shared button base is a selector list.
- Destructive actions use `.btn-danger-quiet` (starts one) and `.btn-danger` (confirms it), never the primary look; a symbol-only
  button is `.btn-icon`.
- Every button is at least 44 px on a touch screen (`pointer: coarse`, at the end of the components layer), so a new button primitive
  joins that list.
- The UI has to meet WCAG 2.2 level AA: contrast in light and dark, a visible focus ring, touch targets, keyboard use.

More: `documentation/ui/buttons.md`, `documentation/ui/design.md`.
