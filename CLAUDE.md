# Dinner Planner

A local-first weekly dinner planner: keep recipes, assign one dinner per day, and
get a single consolidated grocery list for the week.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
Prisma 7 + Postgres. Single user, no auth.

It runs in the developer's own machine only: Postgres in Docker for `npm run dev`
and tests, and Docker Desktop's Kubernetes for the real thing. `documentation/README.md` indexes
the chapters; each rule below ends in the chapter that holds the details. Read it before changing that area.

## Things worth knowing before changing code

Area rules (week plan, recipes, grocery list, styling, tests, Kubernetes) are in `.claude/rules/` and load by themselves when you work
on matching files; `documentation/` holds the long chapters. What applies everywhere:

- **Dates are calendar days, not instants.** A planner day is a `Date` at UTC midnight (`PlannedMeal.date` is the key): build days with
  `lib/week.ts` (`today()`, `parseDayKey()`, `startOfWeek()`), never a bare `new Date()`, and format with `timeZone: "UTC"`.
  Weeks start Monday.
- **A `"use server"` file may only export async functions**; shared constants and types live in `lib/`. Every action calls
  `await requireAccess()` first (every route handler `accessRefusal()`; `tests/infra/access.test.ts` fails when one is missing) and
  `revalidatePath` for every view it touches. `documentation/backend/forms-and-actions.md`, `access-key.md`.
- **The `pg` driver adapter ignores `?schema=`.** Every `PrismaClient` gets its adapter from `createPgAdapter()`
  (`lib/prisma-adapter.ts`); building one by hand is how tests once wrote into the development data.
- **Every page sets its own title** with `generateMetadata` returning only its part (the layout adds " - Dinner Planner");
  `tests/infra/page-titles.test.ts` fails without one.
- **Translations: always `t(i18n)`, never a bare `t` or `plural`.** Server pages get the instance from `getServerI18n()` (call it
  first), client components from `useLingui()`; server actions return errors as `msg` descriptors. After changing a message run
  `npm run i18n:extract` and translate the German entry. `@lingui/swc-plugin` is pinned to the version matching Next's SWC: re-check
  it on every Next.js upgrade. `documentation/backend/i18n.md`.

## Commands

`package.json` lists all of them and the README the everyday ones. The ones that matter here (also: `npm run docs:screenshots`, not
part of the check, `documentation/backend/doc-screenshots.md`):

```bash
npm run check        # the pre-push/pre-merge check: build, lint, Vitest, then typecheck + Playwright, time-limited, no retries
npm run i18n:extract # collect the source's messages into locales/*/messages.po (compiling runs by itself)
npm run db:migrate -- --name <what-changed>   # edit schema, then run this
npm run k8s:deploy   # the normal deploy; k8s:backup first when risky; k8s:access-link prints the private link
npx vitest run tests/unit/lib/week.test.ts -t "Monday"   # one file / one test during development
```

## Layout

```
app/                    pages (page.tsx = week plan, recipes/, groceries/, groceries/categories/), actions/ (server actions), healthz/
components/             client components; week-nav and recipe-photo are plain components that server pages use too
lib/                    helpers: week.ts, grocery*.ts, ingredients/, recipe-import/, i18n/, prisma-adapter.ts, tags.ts, planner.ts …
locales/                gettext catalogs: {en,de}/messages.po (messages.ts is compiled, git-ignored)
tests/                  unit/ (mirrors the source tree), infra/ (scripts, manifests), support/ (helpers), e2e/ (Playwright)
prisma/                 schema.prisma, migrations, seed.ts; generated/prisma/ is the generated client: never edit, never commit
k8s/                    manifests + deploy.sh and the other scripts
scripts/                check.ts (npm run check), ensure-env.ts
.github/workflows/      check.yml: `npm run check` on every pull request and push to main
CHANGELOG.md            per release day; documentation/ holds the chapters (ui/, backend/)
```

`AGENTS.md` is generated and re-added by `next dev`: leave it alone and commit it with your work rather than deleting it.

## Rules

- Plan first, ask before changing code
- Don't refactor without permission
- Data has to be persistently stored somewhere
- The app must be deployable to Kubernetes (container image + manifests). The app itself stays stateless; persistent data lives in PostgreSQL, configured via `DATABASE_URL`
- The app runs in the local Kubernetes environment: **Docker Desktop's Kubernetes** (context `docker-desktop`), namespace `dinner-planner`, reached at `https://dinner.local`. Deploy with `npm run k8s:deploy`; never target a context other than `docker-desktop`. Keep it working there — a change that cannot be deployed and reached in that cluster is not finished
- Add test cases for everything we implement
- The UI has to be accessible and adhere to W3C and WAI standards (target: WCAG 2.2 level AA)
- Be lean in the code: avoid duplicated code and tight coupling
- Documentation is key: document every feature in Markdown files in `documentation/`, in dedicated chapters, split into UI (`documentation/ui/`) and Backend (`documentation/backend/`)
- The tool is available in German and English. Use a gettext-style translation tool; switching the language must not reload the page
- During development, only run new tests and the tests affected by the changed code, not the entire test suite
- Before changing anything, find what the change touches, and fix or run what turns up in the same pass: search the repository for every user of the file, markup, text, address, setting or script you change (`tests/e2e` and `tests/unit`, `documentation/`, the `Dockerfile` and `.dockerignore`, `k8s/`, `.github/workflows/`). A change to a screen means running the Playwright specs that open it together, not only the new one; the gate stops at the first failure, so each stale test costs a whole run. A new file in the repository root, or a new import path, is checked against the image build (`.dockerignore`, `docker build --target app .`): `npm run check` and GitHub's `check` never build the image, so only a deploy shows the break
- Delete all test data after every test run: tests and sample data never stay in the real database (the cluster's, or `public` locally). Tests use their own schemas (`e2e`, one per Vitest file), and if a run, a seed or a manual check put sample recipes, planned days or other rows into the real database, remove them right after the run, before reporting it as done. Look at what you delete first (name, creation time) and never touch the user's own recipes
- Do not commit and push without being asked; pushing a branch and opening a pull request count as pushing
- Every change (fix, new feature, refactoring, docs) goes into its own branch and reaches `main` only through a pull request. `main` is protected (the ruleset "Protect main": a pull request is required, the status check `check` has to pass, no force-push, no deletion). Admins can bypass it, so a direct `git push origin main` would work, but it is not how changes get in: never push to `main`, and never merge a branch into `main` locally to push it. Open the pull request with `gh pr create`, with `Fixes #<number>` for every issue it implements in the description
- Before every push (a branch for a pull request, or an update to it) and before a pull request is merged, run the `test-engineer` agent (`.claude/agents/test-engineer.md`) in its pre-push/pre-merge check: it runs `npm run check` (the entire test suite, typecheck and lint, with time limits and no retries; `documentation/backend/testing-check.md`) and makes sure everything the push or merge brings in is tested. Push or merge only when it reports "ready". The pull request's `check` run on GitHub repeats it and has to be green before the merge
- Before a pull request is opened, also run the `code-reviewer` agent (`.claude/agents/code-reviewer.md`) on the new and changed code, i.e. everything the pull request brings in (`git diff main...<branch>`). Fix its findings or discuss them before opening it
- Order before a pull request: first the `code-reviewer`, then fix its findings, then run `npm run i18n:extract` (commit the catalogs) and the `test-engineer`, so the one gate run sees the tree that is merged, then push the branch and open the pull request. Do not run them in parallel, since a review that changes code makes a check run beside it worthless. Exception: a change with no code in it (docs or translations only) may run both at once. A branch that has fallen behind `main` is brought up to date by merging `main` into the branch (resolve conflicts there, `CHANGELOG.md` is the usual one), and the `test-engineer` runs again on the result
- Every feature, fix or removal adds an entry to `Unreleased` in `CHANGELOG.md` in the same branch, written for the app's user; the `code-reviewer` checks it (`documentation/backend/changelog.md`)
- Before a feature's pull request is merged, show it to the user in the browser and merge only after they approve it. Merging a pull request into `main` always needs the user's go-ahead: merge with `gh pr merge <number> --merge --delete-branch` (a merge commit, like the rest of the history) once `check` is green, and never enable auto-merge unless asked. If the branch is checked out in a worktree, remove the worktree first: otherwise the merge succeeds on GitHub but `gh` fails on deleting the local branch
- Once a pull request is merged, the issues it names with `Fixes #<number>` close by themselves; add a comment to each linking the merge commit, e.g. `gh issue comment <number> --body "Implemented in https://github.com/joeran-kuschel/dinner-planner/commit/<sha>"` (close an issue by hand with `gh issue close <number> --comment …` only if it did not)
