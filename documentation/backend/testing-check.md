# The pre-push / pre-merge check

`npm run check` is the whole check that has to pass before every push and every merge: typecheck, lint, the Vitest
suite and the Playwright specs. It is what the `test-engineer` agent runs (`.claude/agents/test-engineer.md`), and you can
run it yourself. On the developer's Mac it takes about three minutes (184 s on 2026-10-26, with about 250 Playwright specs and a warm build cache; it was
56 s when this was written), most of it the Playwright run (about 150 s).

```bash
npm run check
```

```
Stage       Result                              Seconds
i18n        passed                              0.4
build       passed                              8.3
lint        passed                              9.1
vitest      passed                             33.9
typecheck   passed                              1.7
playwright  passed                            149.5

Check passed in 183.9 s
```

The exit code is 0 only when every stage passed. The code is in `scripts/check.ts` (the command) and
`scripts/check-lib.ts` (running the stages); `tests/infra/check.test.ts` tests it with small fake stages.

The same command runs on GitHub for every pull request, and `main` requires that run (`check`) to pass before a pull request
can be merged: [github-actions.md](github-actions.md).

## Order

1. **i18n**: compiles the translation catalogs once. `npm run typecheck` is not used, because it compiles them again
   (`pretypecheck`), and Vitest's global setup would compile them a third time while the typecheck reads the files.
   The script sets `CHECK_CATALOGS_COMPILED`, which makes that setup skip its own compile.
2. **build, lint and vitest**, together. The build is the production build (`npx next build`) that Playwright's server runs
   on; it used to be made at the start of the Playwright stage, a minute or more of waiting on its own. It is `next build` and not
   `npm run build`, which would compile the catalogs again while Vitest reads them. The build also type-checks the whole
   project, so a type error stops the check here.
3. **typecheck and playwright**, together. `tsc --noEmit` only reads the route types the build wrote, so it can run beside
   Playwright (and stays as the explicit gate). Playwright's servers start from the finished build: the stage sets
   `E2E_PREBUILT=1` (the global setup, `tests/e2e/support/global-setup.ts`, then leaves `npm run build` out; `npm run test:e2e`
   alone still builds, so it keeps working by itself). It runs several workers side by side (below), gets 10 seconds per test (the
   default is 30) and stops at the first failure, so a locator that no longer matches costs 10 seconds and not minutes.

Before anything starts, the script checks that something answers on the host and port of `DATABASE_URL`. If not, it
stops at once with "the database does not answer" instead of letting tests hang. Start the database with `npm run db:up`.

## Independent end-to-end tests

Every Playwright worker has a server and a schema of its own, so the specs run side by side (about 49 s for the 233 tests with
4 workers; they took 147 s on one). The worker fixture `server` in `tests/e2e/support/test.ts` creates the schema `e2e_<n>` from
the migrations when the worker starts (`n` is the worker slot, `parallelIndex`), starts the standalone server on port
`3100 + n` against that schema (`tests/e2e/support/server.ts`) and stops it when the worker is done. `baseURL` is that server's
address. A spec that needs the schema asks for `server` (`server.schema`); the address comes from `baseURL`, never a typed port.
A port that is already in use (on `127.0.0.1` or `::1`) stops the run with a message: a server someone else started could be using the real database. A worker that is killed without its teardown takes its server with it (an exit hook).
When a test fails, Playwright starts a new worker in the same slot, after the old server has stopped, so the port and the
schema are free again. That relies on Playwright freeing a worker slot only when the old worker has exited; check it after a Playwright upgrade (a failing test followed by passing ones, with `--workers=1`).

Within a worker, `tests/e2e/support/test.ts` empties the schema before every test: an automatic fixture calls `emptySchema()`
(`tests/support/migrate.ts`), which truncates every table of that schema in one statement. The tables come from
`pg_tables`, so a new model is covered without a change here. It qualifies each table with the schema name, refuses
`public`, and leaves other schemas alone.

So a test never sees what another one left, and it does not matter which weeks or names tests use or in which order they
run. That is what makes `npx playwright test --repeat-each=3` pass, and it is the reason to import `test` from
`tests/e2e/support/test.ts` rather than from `@playwright/test` (`tests/infra/e2e-isolation.test.ts` fails a spec that does
not). `tests/e2e/isolation.spec.ts` shows the effect: run as a whole file, its second test fails when the reset is switched off.

### How many workers

`E2E_WORKERS` sets it (a whole number of 1 or more; anything else is an error). Without it, a third of the cores, at least 1 and at
most 4 (`tests/e2e/support/workers.ts`), since every worker is a browser plus a server and the tests are timing-sensitive.
Measured on a 14-core Mac, 233 tests: 1 worker 147 s, 2 workers 72 s, 3 workers 56 s, 4 workers 49 s, 6 workers 44 s, and five runs
in a row at 4 workers passed. GitHub's workflow sets `E2E_WORKERS` itself (`.github/workflows/check.yml`), because a runner has
4 cores and a third of that would be one worker. Three workers on a 4-core runner (with the typecheck beside them) is not measured on GitHub yet: if a run fails on the 10 s limit with no test at fault, set it to 2.

## Leftover Vitest schemas

Every Vitest file creates a schema of its own, `test_` and 12 hex digits, and drops it in its `afterAll`
(`tests/support/setup-server.ts`). A run that is killed (Ctrl-C, a time limit, a crash) never reaches that, and the
schemas stayed in the development database. So `createMigratedSchema()` stamps each schema with its creation time
(`COMMENT ON SCHEMA … IS 'created <ISO time>'`), and the global setup `tests/support/drop-stale-schemas.ts` calls
`dropStaleTestSchemas()` once at the start of every run: it drops the schemas named exactly like that whose stamp is
more than an hour old. A run takes minutes, so a younger schema may belong to another run that is still going (another
terminal, another worktree) and stays, as does one without a stamp or with one that cannot be read. `public`, the `e2e_<n>` schemas and every other name are never
touched, whatever their age. The cleanup is best effort: the setup also runs for the component tests, which need no database, so a database that cannot be reached or a drop that fails only prints a warning. `tests/infra/stale-test-schemas.test.ts` covers this.

## Time limits

| Stage | Limit |
|---|---|
| i18n | 1 minute |
| build | 4 minutes |
| typecheck | 2 minutes |
| lint | 2 minutes |
| vitest | 3 minutes |
| playwright (all specs; the build is its own stage) | 8 minutes |
| the whole check | 11 minutes |

The Playwright stage no longer includes the build, so its time is shorter than the figures below (they were measured with it); the 360 s trigger
of [#64](https://github.com/joeran-kuschel/dinner-planner/issues/64) is therefore further away than it was.

The limits are set for GitHub's runners, which need roughly two to three times as long as a Mac: with 182 specs the Playwright
stage took 105 to 130 s on the Mac and 220 to 300 s on the runner, and the earlier 5 minutes failed the check when the stage
reached 300.7 s (the spec that was running then was only the one cut off). A slow test is still a failing test: the 10 s per
test and the stop at the first failure did not change. The limits do not nest exactly (1 + 3 + 8 minutes is more than 11), so
the whole-check limit can end a slow run first; the table then says "whole-check limit". When the Playwright stage keeps getting close to its limit, the next step is to
split it over several CI jobs and not to raise the limit again; the rule for when is under
[Keeping an eye on the time](#keeping-an-eye-on-the-time), the plan in [#64](https://github.com/joeran-kuschel/dinner-planner/issues/64).

A stage that reaches its limit counts as failed. It first gets SIGINT, as if Ctrl+C was pressed, because Playwright stops
the web server it started (which runs in a process group of its own) on SIGINT and on nothing else. Two seconds later
everything left in the stage's own process group is killed. After a timeout, port 3100 is free again for the next run.
The table says whether it was the stage's own limit or the limit of the whole check.

Ctrl+C, or a kill of `npm run check`, stops all running stages the same way and exits with 1. A stage that has exited
is final: if it left a background process behind, that process is killed, and a stage that exited 0 is still reported as
passed.

## Keeping an eye on the time

The Playwright stage grows with every feature (the time is spread over all tests, there is no slow few to fix), and
GitHub's runners vary a lot: the same suite took 170 to 327 s there. So the check shows how close each stage is to its
limit instead of only whether it passed:

- The report has a **% of limit** column for every stage that ran.
- From **60%** of its limit (`WARN_SHARE`) a passed stage gets a `Slow:` line under the table.
- From **75%** (`SPLIT_SHARE`, 360 s for Playwright) the line says what to do: for Playwright, that two runs in a row
  mean it is time to split it over several CI jobs ([#64](https://github.com/joeran-kuschel/dinner-planner/issues/64)
  holds the plan and the trigger); for any other stage, to speed it up or raise its limit in `scripts/check-lib.ts`.
- On GitHub Actions the same lines appear as **warning annotations** on the run, and the stage times as a table in the
  run's **summary** (`publishToGitHub()`), so the trend is visible without opening the log. Nothing is written
  anywhere else.

Splitting is a change to `scripts/check-lib.ts` and the workflow, not just a flag: each job has a database of its own, but
each would repeat the build, and `--max-failures=1` would then apply per job.

A warning is not a failure: the check still passes below the limit. The decision rule is **two runs in a row on `main`
above 75% of the Playwright limit: split it** (a single slow run is mostly the runner). To look at the history:
`gh run list --workflow Check --limit 20`, then `gh run view <id> --log` and the table near the end.

## No retries

- A stage runs once. A failed or timed-out stage is reported as it is, and is never run again to see whether it passes.
- When a stage has failed, the later phases are skipped (shown as `skipped`): the first failure is the one to fix.
- For each stage that failed or timed out, the report adds the last 20 lines of its output and the path of its full log
  (in the system's temporary folder). Skipped stages have no output and print nothing.

The `test-engineer` agent follows the same rules: no re-run unless a named infrastructure cause (a port in use, the
database not started) was the reason, and never with changed flags.

One exception keeps the gate fast: because Playwright stops at the first failure, a change that makes several tests stale
(a new line on a card, a new query parameter in an address) used to cost one full check run per stale test (#7: four runs,
about twelve minutes). When the Playwright stage fails on a test, the agent runs the specs once outside the gate, without
`--max-failures` (`E2E_PREBUILT=1 npx playwright test --timeout=10000 --reporter=line`), fixes every test that is merely
out of date and then runs `npm run check` once more. That listing run is a diagnosis, not a retry: it never decides that a
push is ready, and the report names both runs. Before the gate the agent does not run Playwright: it finds the specs a change
makes stale by searching `tests/e2e` and `tests/unit` for the page's address, labels, roles and selectors, since a run of the
affected specs (or the whole suite) beforehand only doubles the slowest stage; the listing run above is what finds the rest.
Only a new spec being written is run alone, while it is written.

## What the suite is for, and what it leaves out

Playwright is the slowest stage, and its time is the sum of its tests (no test is slow: the median is 0.4 s; 336 tests took 192 s
before [#117](https://github.com/joeran-kuschel/dinner-planner/issues/117) took 104 of them out, which were checking again what
a unit or component test or another e2e test already checks). So every e2e test has to name what **no cheaper layer covers**: a
rule of an action or a helper (a limit, an order, a fallback, a text in both languages) is a unit test; what a component shows or
announces is a component test; the e2e spec of a page keeps the main flows (each action's happy path, one refusal, what shows up
elsewhere in the app, keyboard use, persistence across a reload), and what only a real browser shows (contrast, forced colours,
focus rings, print, clipboard, layout at a phone width). One axe sweep (`redesign.spec.ts`) covers every page in both colour
schemes at two widths, so a feature spec checks axe only for a state the sweep does not reach (a dialog or a question open).

**The slow infra tests are left out when nothing they guard changed.** Four Vitest files run real shell scripts and real
timeouts (`k8s-deploy-scripts`, `db-backup-scripts`, `db-rotate-script`, `check.test`, in `SLOW_INFRA_TESTS` in
`scripts/check-lib.ts`): about a quarter of the suite's time, for files that rarely change. `npm run check` compares the branch
with `main` (`changedFiles()`: committed, uncommitted and new files) and leaves them out of the Vitest stage unless a changed file is
under `k8s/`, `scripts/`, `.github/`, `tests/infra/` or `tests/support/`, or is `Dockerfile`, `.dockerignore`, `compose.yaml`,
`package.json`, the lockfile or the Vitest and TypeScript configuration. It says so before the table. It runs everything when it
cannot tell (no `main` to compare with) and always on a push to `main` on GitHub, where the checkout fetches the whole history so
a pull request has its merge base.

## When to change it

The limits and flags are in `PHASES` in `scripts/check-lib.ts`. `tests/infra/check.test.ts` pins the limits and the two
Playwright flags, so changing them is a deliberate step. A stage that keeps getting close to its limit should be made
faster, not given more time.

## How Playwright runs (details kept out of CLAUDE.md)

- It runs the same standalone server as the Docker image (`node .next/standalone/server.js`, with `public/` and `.next/static`
  copied in), not `next start`, which Next.js does not support with `output: "standalone"`. Inside `npm run check` the build is its own
  stage (`E2E_PREBUILT=1`); `npm run test:e2e` builds and starts its own server on :3100.
- The schema `e2e` is recreated from the migrations on every run, so the development data in `public` is never touched. The browser
  asks for `en-GB`, so specs run in English.
- Every test starts with an empty database: the automatic fixture in `tests/e2e/support/test.ts` truncates every table of the `e2e`
  schema before each test (`emptySchema()` in `tests/support/migrate.ts`), so tests are independent, can use any week and can be
  repeated (`--repeat-each`). This relies on one worker: with several, each would need a schema of its own.
- The app's access key is a test key and every browser context starts with its cookie (`use.storageState` in `playwright.config.ts`);
  `access.spec.ts` starts with none.
- Vitest: every test file gets its own schema with the migrations applied (`tests/support/setup-server.ts`,
  `tests/support/migrate.ts`), emptied before each test and dropped afterwards; the macros of Lingui are compiled with the Babel
  plugin (`tests/support/lingui-macro.mts`); tests run in `Europe/Berlin`, not UTC, to catch planner days built from local time.

