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
   Playwright (and stays as the explicit gate). Playwright starts its server from the finished build: the stage sets
   `E2E_PREBUILT=1` (`playwright.config.ts` then leaves `npm run build` out of the server's command; `npm run test:e2e` alone still
   builds, so it keeps working by itself). It gets 10 seconds per test (the default is 30) and stops at the first failure, so a
   locator that no longer matches costs 10 seconds and not minutes.

Before anything starts, the script checks that something answers on the host and port of `DATABASE_URL`. If not, it
stops at once with "the database does not answer" instead of letting tests hang. Start the database with `npm run db:up`.

## Independent end-to-end tests

The Playwright specs run on one schema (`e2e`), recreated from the migrations at the start of the run. Within the run,
`tests/e2e/support/test.ts` empties it before every test: an automatic fixture calls `emptySchema()`
(`tests/support/migrate.ts`), which truncates every table of that schema in one statement. The tables come from
`pg_tables`, so a new model is covered without a change here. It qualifies each table with the schema name, refuses
`public`, and leaves other schemas alone.

So a test never sees what another one left, and it does not matter which weeks or names tests use or in which order they
run. That is what makes `npx playwright test --repeat-each=3` pass, and it is the reason to import `test` from
`tests/e2e/support/test.ts` rather than from `@playwright/test` (`tests/infra/e2e-isolation.test.ts` fails a spec that does
not). `tests/e2e/isolation.spec.ts` shows the effect: run as a whole file, its second test fails when the reset is switched off. The
fixture also throws when `workers` is above 1, because the reset would then empty another worker's data.

The reset assumes one worker (`playwright.config.ts` sets `workers: 1`, and the fixture throws otherwise). With several
workers sharing the schema a reset would pull the data from under a test that is running; running in parallel would need one
schema per worker.

## Leftover Vitest schemas

Every Vitest file creates a schema of its own, `test_` and 12 hex digits, and drops it in its `afterAll`
(`tests/support/setup-server.ts`). A run that is killed (Ctrl-C, a time limit, a crash) never reaches that, and the
schemas stayed in the development database. So `createMigratedSchema()` stamps each schema with its creation time
(`COMMENT ON SCHEMA … IS 'created <ISO time>'`), and the global setup `tests/support/drop-stale-schemas.ts` calls
`dropStaleTestSchemas()` once at the start of every run: it drops the schemas named exactly like that whose stamp is
more than an hour old. A run takes minutes, so a younger schema may belong to another run that is still going (another
terminal, another worktree) and stays, as does one without a stamp or with one that cannot be read. `public`, `e2e` and every other name are never
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
push is ready, and the report names both runs. Before the gate, the agent also runs the specs that open the changed pages
together.

## When to change it

The limits and flags are in `PHASES` in `scripts/check-lib.ts`. `tests/infra/check.test.ts` pins the limits and the two
Playwright flags, so changing them is a deliberate step. A stage that keeps getting close to its limit should be made
faster, not given more time.
