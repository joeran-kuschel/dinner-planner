# Dinner Planner

A local-first weekly dinner planner: keep recipes, assign one dinner per day, and
get a single consolidated grocery list for the week.

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript · Tailwind v4 ·
Prisma 7 + Postgres. Single user, no auth.

It runs in the developer's own machine only: Postgres in Docker for `npm run dev`
and tests, and Docker Desktop's Kubernetes for the real thing. See "Kubernetes".

## Things worth knowing before changing code

**Dates are calendar days, not instants.** Every planner day is a `Date` pinned to
UTC midnight, and `PlannedMeal.date` is the primary key. Build days with the
helpers in `lib/week.ts` (`today()`, `parseDayKey()`, `startOfWeek()`) — a bare
`new Date()` will land on a local-time instant that matches no row. All display
formatting is pinned to `timeZone: "UTC"` for the same reason. Weeks start Monday.

**The grocery list is derived, never stored.** `aggregateIngredients()` recomputes
it from the week's planned meals on every render, scaling each recipe by
`meal.servings / recipe.servings`. `GroceryEntry` rows persist only tick-off state
and hand-added extras; a derived line has no row until it is first ticked. This is
why editing a recipe corrects the list immediately. Ingredients merge only when
both name and unit match, and one unquantified ingredient makes the whole line
read "to taste" rather than silently under-reporting.

**React 19 resets a form after its action resolves.** Keep this in mind when
touching forms. What is already handled:

- `DayCard` auto-saves while the user keeps typing, so it avoids the reset: its
  `onSubmit` cancels the submit and calls the server action in a transition
  (`useAutoSave`); the form's `action` props only serve browsers without
  JavaScript. Servings and note stay uncontrolled, and when the server value
  changes `useServerSync` updates every field except the focused one. Don't
  re-key the fields instead: a remount drops the keyboard focus after every
  auto-save.
- The dinner field is a Downshift combobox and the one controlled field: its
  text must update in the input's own `onChange` (Downshift's
  `onInputValueChange` comes a render late and fast typing drops characters).
  Picking a suggestion saves, and so do Enter and leaving the field
  (`settle()`): another recipe's exact name plans that recipe, any other text
  becomes a one-off dinner, and an emptied field puts the planned dinner back,
  so it never clears the day. Escape twice also puts it back. A press of the
  pointer on "Leftovers" or "Clear day" (`data-replaces-dinner`) discards the
  text being typed instead, so it is never planned first; a blur while the
  window has lost focus or an IME is composing settles nothing. A failed save
  is caught in `useAutoSave`: the card shows an alert, falls back to the saved
  dinner and refreshes the router.
- The card's first submit button is a hidden one, so Enter in a text field
  saves. Without it, Enter would submit through "Clear day" and wipe the day.
- On a validation error the reset throws away everything the user typed, so the
  recipe actions echo the submitted values back in `RecipeFormState.values` and
  the form re-fills from those, re-keyed on `attempt`.

**A `"use server"` file may only export async functions.** Exporting a constant
or an object from `app/actions/*` compiles and type-checks, then fails at
runtime. Shared constants and types live in `lib/` (`planner.ts`,
`recipe-form.ts`).

**A typed dinner name is resolved on the server.** The day card posts the text
as `dinner`, the picked recipe as `recipeId` and `newRecipe=1` for "Add as a new
recipe". `setPlannedMeal` prefers the picked recipe while the text still names
it, then a recipe with that name (case-insensitive, `isSameDinner` in
`lib/planner.ts`), then creates one if asked, and otherwise stores a one-off
`customTitle`. Details: `documentation/backend/planned-meals.md`.

**Deleting a recipe clears the days that only pointed at it.** The schema says
`onDelete: SetNull`, which on its own would leave days naming nothing at all:
invisible in the week view but still counted as planned. `deleteRecipe` removes
those rows in the same transaction.

**Recipe edits replace the ingredient set.** Rows have no stable identity in the
form, so `updateRecipe` does `deleteMany` + `create` and row order is
authoritative.

**Recipe photos live in the database, and nothing uploaded is served as it came
in.** A photo is a `RecipePhoto` row (`bytea`), not a file: the app stays stateless
and every backup covers it. `processPhoto()` (`lib/recipe-photo.ts`) decodes each
upload with `sharp` and encodes it again as WebP — a 1200 px image and a 480x320
3:2 thumbnail. That checks the real image type (JPEG, PNG, WebP only), drops EXIF
such as the GPS position, and means an uploaded SVG or script can never reach a
visitor. Never store or serve the uploaded bytes. Pages reach a photo only through
`recipePhotoUrl()` (`/recipes/[id]/photo?size=…&v=<updatedAt>`, cached for good
because the version is in the address), and queries must not select `full` or
`thumb` except to serve the image, so listing recipes never reads image bytes.
A photo travels in the recipe form's request, so three limits must stay in order:
`MAX_PHOTO_BYTES` (5 MB) < `serverActions.bodySizeLimit` (6 MB, `next.config.ts`)
<= `proxy-body-size` (8 MB, on this app's Ingress only — nginx's default of 1 MB
answers 413, and the controller is shared and never changed);
`tests/infra/k8s.test.ts` checks it. `RecipeForm` submits through a transition so
React 19's form reset does not empty the file field, which a browser cannot fill in
again; without that, a refused form loses the photo and the retry saves the recipe
without one. Keep that when touching the form. `sharp` is a runtime dependency (its
native binary ships in the Alpine app image). Details:
`documentation/backend/recipe-photos.md`.

**Grocery lines are grouped by a fixed `GroceryCategory` enum.** Ingredients and
hand-added extras carry one (default `OTHER`, which stays last). The category is
not part of a line's key, so it never touches tick state; merged lines take the
category that comes first in the enum wins. A category from a form goes through
`parseGroceryCategory()`, never straight to Prisma. Details:
`documentation/backend/grocery-categories.md`.

**Tags are a `Tag` table, stored normalised and pruned when unused.** Every tag
goes through `normalizeTag()` / `parseTags()` (`lib/tags.ts`): lowercase, so the
case-sensitive unique index means one tag. `updateRecipe` and `deleteRecipe` delete
tags no recipe uses in the same transaction. The recipe list's search is a GET form
over `lib/recipe-search.ts`, which escapes `%` and `_` for `contains`. Details:
`documentation/backend/recipe-tags.md`.

**One shared access key guards the whole app.** `proxy.ts` lets a request through only with a valid `dp_access` cookie
(`lib/access.ts`: `v1.<expires>.<HMAC>`, signed with a secret derived from `ACCESS_KEY`, so it cannot be forged and a new
key logs every device out). `/healthz` (the probes) and `/access` (which hands the cookie out) are the only open paths.
Every server action calls `await requireAccess()` first and every route handler `accessRefusal()` (`lib/access-guard.ts`),
because the proxy should not be the only gate; `tests/infra/access.test.ts` fails when one is missing, so a new action
needs the call. Without a key the app is open outside production (`npm run dev`, Vitest) and refuses everything with 503
in production (the image sets `NODE_ENV=production`), so a missing Secret never leaves it open. The key is a Secret
(`dinner-planner-access`) that `deploy.sh` makes once; `npm run k8s:access-link` prints the private link
`https://dinner.local/access#<key>` (the key after `#` never reaches a server or a log) and `npm run k8s:rotate-access-key`
replaces it. Playwright runs with a test key and every browser context starts with its cookie (`use.storageState` in
`playwright.config.ts`); `access.spec.ts` starts with none. Details: `documentation/backend/access-key.md`.

**Hand-added grocery entries carry over to the next week, worked out when the list renders.** An entry still
unticked at the end of its week appears in the following weeks until it is ticked (`carriedEntries()` in
`lib/grocery-carry.ts`); nothing is stored for the weeks it passes through. A tick writes a row for that week and
ends it; deleting a carried line writes a `dismissed` row, so the earlier weeks keep it. Details:
`documentation/backend/grocery-carry-over.md`.

**A grocery line is what it is whatever it was called: the same ingredient in another spelling or
language, and a synonym unit, is one line.** A line's key is `<name id>|<unit id>`
(`lib/ingredients/canonical.ts`): a name in the bundled dictionary (`lib/ingredients/names.ts`, English and German, the first
name of a language is the one shown) is `~<group>`, the user's merges (`GroceryMergeRule`, applied at render time) go on top,
and a unit in `lib/ingredients/measures.ts` counts in its base ("kg" in "g", "EL" and "tbsp" are one). **Units are never converted**
except a metric unit and its own multiple, since a tablespoon of salt and one of mustard seeds weigh differently. A name belongs
to one dictionary group only (a test checks): Kümmel is caraway, Kreuzkümmel is cumin. Stored `GroceryEntry` rows keep their old
keys and are read through `keyOfStored()` / `canonicalRows()`; build a key with the canonicaliser, never by hand. The page names
lines and units in the page language, and `aggregateIngredients(meals, canon)` without a canonicaliser (`PLAIN_NAMES`) is the old
behaviour. The order of the list is: add up, merge (also hand-added amounts), then `small` (a pinch or spoon amount, or a weight under 100 g, loses its amount on screen, in the copy and in print; decided on the merged total, `isSmallAmount()` in `measures.ts`). Details: `documentation/backend/grocery-merge.md`.

**Pantry staples hide derived grocery lines at render time and store nothing on
the lines.** `PantryStaple` is a global table of normalised names (the same
`normalize` as tags); `splitStaples()` (`lib/pantry.ts`) runs after the aggregation,
matches the ingredient name only (not the unit, not a part of the name) and never
hides a hand-added extra. Details: `documentation/backend/pantry-staples.md`.

**Only `lib/recipe-import/safe-fetch.ts` fetches an address a user typed.** The app runs inside the
cluster, so a pasted link must never reach a private address: `fetchPage()` allows only http(s) on ports 80/443, refuses
private and reserved IPs in the socket's own `lookup` (so DNS tricks fail too), re-checks every redirect (3 at most),
and limits time (10 s) and size (2 MB after decompression). A downloaded picture goes through `fetchImage()` and
`sniffPhotoType()` (JPEG, PNG or WebP by its bytes) and is re-encoded by `processPhoto()` on save. Never call
`fetch` or `node:http(s)` for a user-supplied URL anywhere else (`tests/infra/recipe-import.test.ts` checks). `RECIPE_IMPORT_ALLOW_PRIVATE=1` lifts the rule for the
Playwright server alone and must never appear in a manifest. Details: `documentation/backend/recipe-import.md`.

**Every page sets its own title, and the layout adds " - Dinner Planner".** A page exports `generateMetadata` returning only its part (the same text as its `<h1>`; a recipe's name through `recipeTitle()` in `lib/page-title.ts`, cut at 60 characters); the template is in `app/layout.tsx`, and not-found keeps the bare app name. `tests/infra/page-titles.test.ts` fails for a `page.tsx` without one. Details: `documentation/ui/page-titles.md`.

**Mutations must revalidate every view they touch.** The plan, the recipes and the
grocery list all read the same data; each action calls `revalidatePath` for all
the affected routes.

**Translations: always `t(i18n)`, never a bare `t` or `plural`.** Lingui's global
instance is shared by every request on the server and never activated, so the
bare macros throw there. Server pages and layouts get the instance from
`getServerI18n()` (which also enables Lingui's server `<Trans>`, so call it
first), client components from `useLingui()` in `@lingui/react`. Date helpers
take the language, text helpers the instance. Server actions return errors as
`msg` descriptors for the client to translate. After changing a message, run
`npm run i18n:extract` and translate the German entry; the strict compile and
`tests/infra/i18n.test.ts` fail otherwise. `@lingui/swc-plugin` is pinned to the
version whose Wasm matches Next's SWC — re-check it on every Next.js upgrade.
Details: `documentation/backend/i18n.md`.

**The `pg` driver adapter ignores `?schema=`.** Only the Prisma CLI honours that
parameter; the driver treats it as an unknown connection option and silently
uses `public`. Every `PrismaClient` must therefore get its adapter from
`createPgAdapter()` in `lib/prisma-adapter.ts`, which parses the schema out of
`DATABASE_URL` and passes it to `PrismaPg` explicitly. Building a client by hand
is how the test suite ended up writing into the development data.

## Commands

```bash
npm run db:up        # local Postgres in Docker (host port 5433), first creates .env with a random password — needed by dev and tests
npm run dev          # dev server on :3000
npm run build        # production build (also type-checks)
npm run typecheck    # tsc --noEmit
npm run lint         # eslint
npm run db:down      # stop the local Postgres

npm run i18n:extract # collect the source's messages into locales/*/messages.po
npm run i18n:compile # compile the catalogs (runs by itself before dev, build, typecheck and Vitest)

npm run db:migrate -- --name <what-changed>   # edit schema, then run this
npm run db:generate  # regenerate the client without migrating
npm run db:seed      # sample recipes + a few planned days (safe to re-run)
npm run db:studio    # browse the database

npm run k8s:deploy   # build, import into the cluster, apply k8s/ — the normal deploy
npm run k8s:seed     # sample data into the cluster's database (one-off Job)
npm run k8s:backup   # dump the cluster's database to ~/DinnerPlannerBackups
npm run k8s:rotate-db-password   # backs up, then gives the cluster's database a new random password
npm run k8s:renew-tls            # a fresh mkcert certificate for https://dinner.local, when it has expired
npm run k8s:access-link          # the private link that gives a device access (open it once per device)
npm run k8s:rotate-access-key    # a new access key: every device is logged out until it opens the new link
npm run k8s:restore -- <file.sql.gz>   # replace all cluster data with a backup
npm run k8s:status   # pods, services, ingress
npm run k8s:logs     # follow the app's logs
npm run k8s:delete   # tear the namespace down

npm test             # Vitest: lib helpers, server actions, components
npm run check        # the pre-push/pre-merge check: typecheck, lint, Vitest, Playwright — about 2 min, time-limited, no retries
npm run test:e2e     # Playwright: builds and starts its own server on :3100
npx vitest run tests/unit/lib/week.test.ts -t "Monday"   # one file / one test during development
```

## Layout

```
app/
  page.tsx              week plan (the home page)
  recipes/              list, new, [id] detail, [id]/edit, [id]/photo/route.ts (serves a photo)
  groceries/            derived shopping list
  actions/              server actions: meals, recipes, groceries, locale
  healthz/route.ts      readiness probe — 503 while Postgres is unreachable
components/             client components (day-card, recipe-form, grocery-list, site-nav,
                        language-switcher, i18n-provider, confirm-action — the question
                        before a destructive action); week-nav (previous/this/next week,
                        shared by the plan and the grocery list) and recipe-photo (the
                        <img>) are plain components that server pages use too
lib/
  db.ts                 Prisma client singleton
  database-url.ts       requireDatabaseUrl() — one clear error when it is unset
  prisma-adapter.ts     builds the pg adapter, honouring ?schema= — see "Things worth knowing"
  week.ts               day/week helpers — see "Dates" above
  grocery.ts            grocery aggregation, grouping + formatting
  grocery-category.ts   the shop-section enum's order, labels and form parsing; safe for client code
  ingredients/          canonical.ts (a line's key and name), names.ts (the English/German dictionary), measures.ts (units), merge-rules.ts, rows.ts; server.ts loads the user's merges
  planner.ts            dinner-name matching, shared by the day card and setPlannedMeal
  recipe-form.ts        recipe form state types (kept out of the "use server" file)
  tags.ts               tag rules (normalising, limits, parsing a form's tags); safe for client code
  recipe-search.ts      the recipe list's search + tag filter, tagNames() — server only
  units.ts              the recipe form's unit suggestions: the common units plus those in use — server only
  recipe-import/        "Add from a link": safe-fetch.ts is the only code that fetches a user-supplied address — server only except errors.ts and messages.ts
  recipe-facts.ts       "Serves 4 · 3 ingredients · …", shared by the recipe pages
  recipe-photo.ts       processPhoto(): decodes and re-encodes an upload (sharp) — server only
  recipe-photo-shared.ts  photo limits, sizes and recipePhotoUrl(); safe for client code
  i18n/                 languages, locale detection, catalogs — see "Translations" above
CHANGELOG.md           what changed, per release day — see "Rules" and documentation/backend/changelog.md
locales/                gettext catalogs: {en,de}/messages.po (messages.ts is compiled, git-ignored)
tests/
  unit/                 Vitest, mirrors the source tree (lib/, app/, components/, prisma/)
  infra/                Vitest: k8s manifests, deploy/backup scripts, test setup
  support/              Vitest setup and helpers (db, axe, next mocks, migrations)
  e2e/                  Playwright specs
    support/            Playwright helpers and prepare-db.ts
prisma/
  schema.prisma         Recipe, RecipePhoto, Ingredient, PlannedMeal, GroceryEntry
  seed.ts
generated/prisma/       generated client — never edit, never commit
Dockerfile              two targets: `app` (Next standalone) and `migrator`
compose.yaml            Postgres for local development only
k8s/                    manifests + deploy.sh / seed.sh / rotate-db-password.sh — see "Kubernetes"
scripts/                check.ts (npm run check), ensure-env.ts (creates .env for npm run db:up)
.github/workflows/      check.yml: `npm run check` on every pull request and push to main — documentation/backend/github-actions.md
```

## Styling

Colours are CSS custom properties on `:root` in `app/globals.css`, redefined under
`prefers-color-scheme: dark`, and exposed to Tailwind through `@theme inline`. Use
the tokens (`bg-surface`, `text-muted`, `border-border`, `bg-accent`) and the
`.card` / `.field` / `.btn-*` / `.label` primitives rather than hard-coding
colours. Tailwind v4 cannot `@apply` one custom class inside another, which is why
the shared button base is a selector list. Destructive actions use `.btn-danger-quiet`
(starts one) and `.btn-danger` (confirms it), never the primary look; a symbol-only
button is `.btn-icon`. Every button is at least 44 px on a touch screen
(`pointer: coarse`, at the end of the components layer), so a new button primitive
joins that list. Details: `documentation/ui/buttons.md`.

## Kubernetes

The app runs in **Docker Desktop's Kubernetes** (context `docker-desktop`), in
the `dinner-planner` namespace. `npm run k8s:deploy` is the whole workflow: it
checks the cluster and the ingress controller, builds both image targets,
imports them into the cluster node and applies `k8s/`. Re-run it to push a code
change.

- **Images are imported into the node, not pulled.** Docker Desktop runs
  Kubernetes as a kind node with its own image store, and it routes pulls
  through a registry mirror that cannot see local images. So `deploy.sh` pipes
  each image into the node (`docker save … | docker exec -i <node> ctr -n k8s.io
  images import -`), and the manifests use `imagePullPolicy: Never`.
  `tests/infra/k8s.test.ts` checks both.
- **Every script pins `--context docker-desktop`.** Never let a deploy follow
  whatever context happens to be current (`tests/infra/k8s.test.ts` checks this too).
- **The nginx ingress controller is shared** with other apps on this cluster
  (e.g. the time tracking tool). `deploy.sh` only checks that it exists and
  prints the install command if not; it never installs or changes it.
- **Migrations run as an init container**, not as a Job, so a pod can never
  serve traffic against a schema it does not understand. `prisma migrate deploy`
  only applies what is unrecorded, so repeating it is a no-op. Seeding is
  separate and manual (`npm run k8s:seed`) — it must not resurrect sample
  recipes on every restart.
- **Postgres is a StatefulSet with a PersistentVolumeClaim.** `PGDATA` points at
  a subdirectory because Postgres refuses to initialise into a volume that
  already contains `lost+found`.
- **Every build gets a fresh timestamp tag.** With a fixed `:dev` tag the pod
  spec does not change, so Kubernetes sees nothing to roll out and the old pod
  keeps running. `deploy.sh` builds `repo:<timestamp>` and substitutes it into
  the rendered manifests; the checked-in manifests keep `:dev`. `k8s/seed.sh`
  reads the tag back off the running Deployment rather than guessing.
- **The database password is in no file of the repository.** Locally `npm run db:up` runs `scripts/ensure-env.ts`,
  which writes a random one into the git-ignored `.env` (an older `.env` keeps its password: the volume has it). In
  the cluster the `dinner-planner-db` Secret is not a manifest: `deploy.sh` creates it once from `k8s/db-secret.sh`
  and then leaves it alone, because Postgres reads `POSTGRES_PASSWORD` only when it creates the data directory, so
  a new password in the Secret alone locks the app out. `npm run k8s:rotate-db-password` backs up, changes the password
  in the Secret and in Postgres, and restarts both. Never `kubectl apply -k k8s` by hand (no Secret, Postgres
  does not start). CI uses a throwaway of its own. Details: `documentation/backend/database-credentials.md`.
- **`prisma`, `tsx` and `dotenv` are runtime dependencies, not dev ones.** The
  migrator image installs with `--omit=dev`; moving any of them to
  `devDependencies` breaks migrations and seeding in the cluster with
  `Cannot find module 'dotenv/config'`.
- **Access is via Ingress at `https://dinner.local`.** Docker Desktop publishes
  the ingress controller's LoadBalancer on `localhost:80` and `:443`, so `/etc/hosts` needs
  `127.0.0.1 dinner.local` **and** `::1 dinner.local`: without the IPv6 line,
  macOS asks Bonjour about the `.local` name first and every request takes 5
  seconds longer. `deploy.sh` prints missing lines; it never edits `/etc/hosts`.
- **The access key is a Secret that is no manifest either.** `deploy.sh` makes `dinner-planner-access` once
  (`k8s/access-secret.sh`, `kubectl create`, never `apply`) and keeps it; the app container reads it as `ACCESS_KEY`
  and does not start without it. After the first deploy open `npm run k8s:access-link`'s link once on each device:
  until then the app answers 401 there. Details: `documentation/backend/access-key.md`.
- **The certificate is mkcert's, in a Secret that is no manifest.** `deploy.sh` makes the `dinner-planner-tls`
  Secret once (`k8s/tls-secret.sh`: `mkcert` for `dinner.local`, then `kubectl create secret tls`, never `apply`,
  which would copy the key into an annotation) and keeps it; the Ingress names it and redirects http to https
  (this Ingress only, never the shared controller). No certificate or key is ever in the repository
  (`tests/infra/k8s.test.ts` checks). Without mkcert and its certificate authority (`brew install mkcert && mkcert
  -install`) the first deploy stops with those commands and installs nothing. `npm run k8s:renew-tls` replaces the
  certificate when it expires (about two years and three months). Details: `documentation/backend/tls.md`.
- **The database volume lives inside the kind node.** Resetting or updating
  Docker Desktop's Kubernetes deletes it, and so does `npm run k8s:delete`,
  which removes the whole namespace. A launchd job (`npm run k8s:backup:install`)
  dumps it hourly to `~/DinnerPlannerBackups`, keeping every dump of the last 24
  hours and then one a day for 30 days (photos do not compress, so keeping every
  hourly dump would grow with every recipe); run `npm run k8s:backup` before
  anything risky. Details and restore: `documentation/backend/database-backups.md`.
- The two images are separate on purpose: the app image runs Next's standalone
  output and carries no Prisma CLI, schema or `tsx`; the migrator image has
  those and no Next server.

## Testing

- **Every test case lives in `tests/`**, never next to the code:
  `tests/unit/` mirrors the source tree (`tests/unit/lib/week.test.ts` tests
  `lib/week.ts`), `tests/infra/` covers the scripts and manifests, and
  `tests/e2e/` holds the Playwright specs. Tests import the code under test via
  `@/…`. Vitest setup and helpers are in `tests/support/`, Playwright helpers
  in `tests/e2e/support/`.
- **Vitest** (`vitest.config.mts`) has two projects. `server` (Node) runs the
  `*.test.ts` files in `tests/unit/` and `tests/infra/` against the local Postgres (`DATABASE_URL`): every test file
  gets its own schema with the migrations applied (`tests/support/setup-server.ts`,
  `tests/support/migrate.ts`), emptied before each test and dropped afterwards; `next/cache` and `next/navigation` are mocked, use
  `expectRedirect` from `tests/support/next.ts` and `formData` from `tests/support/db.ts`. `dom`
  (jsdom) runs `*.test.tsx` component tests with Testing Library; mock the server
  actions the component imports and call `expectNoAxeViolations` from `tests/support/axe.ts`.
  Render through `renderWithI18n(ui, { locale })` from `tests/support/render.tsx`
  (English by default) and add German cases; server tests get an instance from
  `testI18n(locale)` in `tests/support/i18n.ts`. Vitest compiles Lingui's macros
  with the Babel plugin (`tests/support/lingui-macro.mts`).
- Tests run in `Europe/Berlin`, not UTC, to catch planner days built from local time.
- **Playwright** (`playwright.config.ts`, specs in `tests/e2e/`) runs the same
  standalone server as the Docker image (`node .next/standalone/server.js`, with
  `public/` and `.next/static` copied in; not `next start`, which Next.js does
  not support with `output: "standalone"`) against the schema `e2e`, recreated from the migrations on every run, so it never
  touches the development data in `public`. The browser asks for `en-GB`, so specs
  run in English; German lives in `tests/e2e/language.spec.ts`. **Every test starts with an empty database**: specs import `test` and
  `expect` from `tests/e2e/support/test.ts`, whose automatic fixture truncates every
  table of the `e2e` schema before each test (`emptySchema()` in
  `tests/support/migrate.ts`), so tests are independent, can use any week and can be
  repeated (`--repeat-each`). Never import `test` from `@playwright/test` in a spec
  (`tests/infra/e2e-isolation.test.ts` checks). This relies on one worker: with
  several, each would need a schema of its own. Check pages with `expectAccessible()`
  (axe incl. contrast) from `tests/e2e/support/helpers.ts`; `unique()` is still handy
  for names within one test.
- A test that documents a known bug is marked `it.fails` / `test.fail` with a
  `// BUG:` comment until the bug is fixed.

`AGENTS.md` is generated and re-added by `next dev` — leave it alone and commit it
with your work rather than deleting it.

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
- Delete all test data after every test run: tests and sample data never stay in the real database (the cluster's, or `public` locally). Tests use their own schemas (`e2e`, one per Vitest file), and if a run, a seed or a manual check put sample recipes, planned days or other rows into the real database, remove them right after the run, before reporting it as done. Look at what you delete first (name, creation time) and never touch the user's own recipes
- Do not commit and push without being asked; pushing a branch and opening a pull request count as pushing
- Every change (fix, new feature, refactoring, docs) goes into its own branch and reaches `main` only through a pull request. `main` is protected (the ruleset "Protect main": a pull request is required, the status check `check` has to pass, no force-push, no deletion). Admins can bypass it, so a direct `git push origin main` would work, but it is not how changes get in: never push to `main`, and never merge a branch into `main` locally to push it. Open the pull request with `gh pr create`, with `Fixes #<number>` for every issue it implements in the description
- Before every push (a branch for a pull request, or an update to it) and before a pull request is merged, run the `test-engineer` agent (`.claude/agents/test-engineer.md`) in its pre-push/pre-merge check: it runs `npm run check` (the entire test suite, typecheck and lint, with time limits and no retries; `documentation/backend/testing-check.md`) and makes sure everything the push or merge brings in is tested. Push or merge only when it reports "ready". The pull request's `check` run on GitHub repeats it and has to be green before the merge
- Before a pull request is opened, also run the `code-reviewer` agent (`.claude/agents/code-reviewer.md`) on the new and changed code, i.e. everything the pull request brings in (`git diff main...<branch>`). Fix its findings or discuss them before opening it
- Order before a pull request: first the `code-reviewer`, then fix its findings, then run `npm run i18n:extract` (commit the catalogs) and the `test-engineer`, so the one gate run sees the tree that is merged, then push the branch and open the pull request. Do not run them in parallel, since a review that changes code makes a check run beside it worthless. Exception: a change with no code in it (docs or translations only) may run both at once. A branch that has fallen behind `main` is brought up to date by merging `main` into the branch (resolve conflicts there, `CHANGELOG.md` is the usual one), and the `test-engineer` runs again on the result
- Every feature, fix or removal adds an entry to `Unreleased` in `CHANGELOG.md` in the same branch, written for the app's user; the `code-reviewer` checks it (`documentation/backend/changelog.md`)
- Before a feature's pull request is merged, show it to the user in the browser and merge only after they approve it. Merging a pull request into `main` always needs the user's go-ahead: merge with `gh pr merge <number> --merge --delete-branch` (a merge commit, like the rest of the history) once `check` is green, and never enable auto-merge unless asked. If the branch is checked out in a worktree, remove the worktree first: otherwise the merge succeeds on GitHub but `gh` fails on deleting the local branch
- Once a pull request is merged, the issues it names with `Fixes #<number>` close by themselves; add a comment to each linking the merge commit, e.g. `gh issue comment <number> --body "Implemented in https://github.com/joeran-kuschel/dinner-planner/commit/<sha>"` (close an issue by hand with `gh issue close <number> --comment …` only if it did not)
