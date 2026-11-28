---
paths:
  - "tests/**"
  - "playwright.config.ts"
  - "vitest.config.mts"
  - "scripts/check*.ts"
---

# Testing

How tests are written here. How the whole suite is run before a push or merge is in `documentation/backend/testing-check.md`.

- **Every test case lives in `tests/`**, never next to the code: `tests/unit/` mirrors the source tree (`tests/unit/lib/week.test.ts`
  tests `lib/week.ts`), `tests/infra/` covers the scripts and manifests, and `tests/e2e/` holds the Playwright specs. Tests import the
  code under test via `@/…`. Vitest setup and helpers are in `tests/support/`, Playwright helpers in `tests/e2e/support/`.
- **Vitest** (`vitest.config.mts`) has two projects. `server` (Node) runs the `*.test.ts` files in `tests/unit/` and `tests/infra/`
  against the local Postgres (`DATABASE_URL`): every file gets its own schema with the migrations applied, emptied before each test and
  dropped afterwards; `next/cache` and `next/navigation` are mocked, use `expectRedirect` from `tests/support/next.ts` and `formData`
  from `tests/support/db.ts`. `dom` (jsdom) runs `*.test.tsx` component tests with Testing Library; mock the server actions the
  component imports and call `expectNoAxeViolations` from `tests/support/axe.ts`.
- Render components through `renderWithI18n(ui, { locale })` (English by default) and add German cases; server tests get an instance
  from `testI18n(locale)`. Tests run in `Europe/Berlin`, not UTC, to catch planner days built from local time.
- **Playwright** (`playwright.config.ts`) runs the standalone server against the schema `e2e` with one worker; specs run in English
  (German lives in `tests/e2e/language.spec.ts`). Specs import `test` and `expect` from `tests/e2e/support/test.ts`, never from
  `@playwright/test` (`tests/infra/e2e-isolation.test.ts` checks): its fixture empties the schema before each test. Check pages with
  `expectAccessible()` (axe incl. contrast); `unique()` is handy for names within one test.
- `emptySchema()` and `resetDatabase` leave the seeded `GroceryCategory` rows alone. Playwright runs with a test access key: every browser
  context starts with its cookie (`use.storageState` in `playwright.config.ts`); `access.spec.ts` starts with none.
- **Keep the suite fast: every e2e test names what no cheaper layer covers.** A rule of an action or helper is a unit test, what a
  component shows a component test; a page's e2e spec keeps the main flows and what only a browser shows (contrast, focus, print,
  layout). One axe sweep (`redesign.spec.ts`) covers every page; a feature spec adds axe only for a state the sweep does not reach.
  Four slow infra Vitest files run only when what they guard changed (`documentation/backend/testing-check.md`).
- A test that documents a known bug is marked `it.fails` / `test.fail` with a `// BUG:` comment until the bug is fixed. A `test.fail`
  fails the run when the test starts to pass.
- During development run only the new tests and those the change touches; the whole suite runs in `npm run check`.
