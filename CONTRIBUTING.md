# Contributing

Thanks for taking an interest. The dinner planner is a small, local-first app for one person's kitchen:
recipes, one dinner per day, one grocery list for the week. Bug reports, fixes and focused improvements are
welcome. A feature that turns it into something else (accounts, a hosted service) is probably not the right fit,
so open an issue and ask before you spend time on it.

## Before you start

- **Look at the existing issues** and open one for anything bigger than a small fix, so we can agree on it first.
- **Security problems do not belong in a public issue.** Use [private vulnerability reporting](https://github.com/joeran-kuschel/dinner-planner/security/advisories/new)
  (the repository's Security tab → "Report a vulnerability").
- The project is under the [MIT license](LICENSE); by contributing you agree your work is released under it.

## Setting up

You need Node.js 24, Docker (for Postgres) and a recent npm.

```bash
npm install
npm run db:up                       # Postgres in Docker; creates .env with a random password
npm run db:migrate -- --name init   # create the schema
npm run db:seed                     # optional: a few recipes to start from
npm run dev                         # http://localhost:3000
```

`.env` holds the database password and is never committed. See
[documentation/backend/database-credentials.md](documentation/backend/database-credentials.md).

## Making a change

1. Fork the repository and make a branch for your change: one fix or feature per branch.
2. Keep the code lean: no duplicated code, no tight coupling, and no refactoring beyond what the change needs.
3. **Add tests for what you change.** Every test case lives in `tests/` (`tests/unit/` mirrors the source tree,
   `tests/e2e/` holds the Playwright specs). A test that documents a known bug is marked `it.fails` or `test.fail`
   with a `// BUG:` comment.
4. **Keep the UI accessible**, to WCAG 2.2 level AA: labels, focus, contrast, touch targets of at least 44 px.
   Check pages with `expectAccessible()` in e2e specs and `expectNoAxeViolations` in component tests.
5. **Translations:** the app is in English and German. Wrap text with Lingui as described in
   [documentation/backend/i18n.md](documentation/backend/i18n.md), run `npm run i18n:extract`, translate the
   German entry in `locales/de/messages.po` and commit both catalogs. The build fails on a missing translation.
6. **Document it** in `documentation/` (`ui/` or `backend/`), and **add a line to `Unreleased` in
   [CHANGELOG.md](CHANGELOG.md)** for any change a user would notice, written for the app's user
   ([how](documentation/backend/changelog.md)).
7. Read the "Things worth knowing before changing code" section of [CLAUDE.md](CLAUDE.md) for the traps that cost
   the most time: calendar days as UTC dates, the derived grocery list, React 19 resetting forms after an action,
   and the rule that only `lib/recipe-import/safe-fetch.ts` may fetch an address a user typed.

## Checking your change

```bash
npx playwright install chromium     # once
npx next typegen                    # once on a fresh clone: the typecheck reads the generated route types
npm run check                       # typecheck, lint, Vitest and Playwright: about two minutes
```

`npm run check` is the same check that runs on GitHub, with the same time limits and no retries
([details](documentation/backend/testing-check.md)). While you work, run only the tests you touched, for example
`npx vitest run tests/unit/lib/week.test.ts`.

Tests run against your local Postgres in their own schemas and never touch the `public` data. If a test or a manual
check leaves rows in your real database, remove them again.

## Opening a pull request

- Open it against `main`, with a short description of what changed and why, and link the issue.
- The `Check` workflow has to pass before it can be merged. For a pull request from a fork, the maintainer has to
  approve the workflow run first.
- Do not include your `.env`, backups, personal recipes or photos, or any secret in a commit. Secret scanning is on
  and push protection will refuse a known token, but it does not catch everything.
- Expect review comments about tests, translations, accessibility and the changelog entry: they are the project's rules.
