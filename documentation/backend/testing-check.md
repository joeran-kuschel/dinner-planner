# The pre-push / pre-merge check

`npm run check` is the whole check that has to pass before every push and every merge: typecheck, lint, the Vitest
suite and the Playwright specs. It is what the `test-engineer` agent runs (`.claude/agents/test-engineer.md`), and you can
run it yourself. On the developer's Mac it takes about a minute (56 s when this was written), most of it Playwright's
build and run.

```bash
npm run check
```

```
Stage       Result                              Seconds
i18n        passed                              0.4
typecheck   passed                              2.4
lint        passed                              4.1
vitest      passed                              8.4
playwright  passed                              47.3

Check passed in 56.1 s
```

The exit code is 0 only when every stage passed. The code is in `scripts/check.ts` (the command) and
`scripts/check-lib.ts` (running the stages); `tests/infra/check.test.ts` tests it with small fake stages.

The same command runs on GitHub for every pull request: [github-actions.md](github-actions.md).

## Order

1. **i18n**: compiles the translation catalogs once. `npm run typecheck` is not used, because it compiles them again
   (`pretypecheck`), and Vitest's global setup would compile them a third time while the typecheck reads the files.
   The script sets `CHECK_CATALOGS_COMPILED`, which makes that setup skip its own compile.
2. **typecheck, lint and vitest**, together.
3. **playwright**, on its own: its build would compete with the others for the processor. It gets 10 seconds per
   test (the default is 30) and stops at the first failure, so a locator that no longer matches costs 10 seconds
   and not minutes.

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
touched, whatever their age. `tests/infra/stale-test-schemas.test.ts` covers this.

## Time limits

| Stage | Limit |
|---|---|
| i18n | 1 minute |
| typecheck | 2 minutes |
| lint | 2 minutes |
| vitest | 3 minutes |
| playwright (build and all specs) | 5 minutes |
| the whole check | 8 minutes |

A stage that reaches its limit counts as failed. It first gets SIGINT, as if Ctrl+C was pressed, because Playwright stops
the web server it started (which runs in a process group of its own) on SIGINT and on nothing else. Two seconds later
everything left in the stage's own process group is killed. After a timeout, port 3100 is free again for the next run.
The table says whether it was the stage's own limit or the limit of the whole check.

Ctrl+C, or a kill of `npm run check`, stops all running stages the same way and exits with 1. A stage that has exited
is final: if it left a background process behind, that process is killed, and a stage that exited 0 is still reported as
passed.

## No retries

- A stage runs once. A failed or timed-out stage is reported as it is, and is never run again to see whether it passes.
- When a stage has failed, the later phases are skipped (shown as `skipped`): the first failure is the one to fix.
- For each stage that failed or timed out, the report adds the last 20 lines of its output and the path of its full log
  (in the system's temporary folder). Skipped stages have no output and print nothing.

The `test-engineer` agent follows the same rules: no re-run unless a named infrastructure cause (a port in use, the
database not started) was the reason, and never with changed flags.

## When to change it

The limits and flags are in `PHASES` in `scripts/check-lib.ts`. `tests/infra/check.test.ts` pins the limits and the two
Playwright flags, so changing them is a deliberate step. A stage that keeps getting close to its limit should be made
faster, not given more time.
