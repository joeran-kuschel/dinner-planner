# GitHub Actions: the check on every pull request

`.github/workflows/check.yml` runs [`npm run check`](testing-check.md) on GitHub for every pull request and every push
to `main`: typecheck, lint, the Vitest suite and the Playwright specs. It is the same command the `test-engineer`
agent runs on the developer's machine, so a green run there and a green run here mean the same thing.

## What the job does

1. Starts a throwaway Postgres as a service container: the image, user, database and host port of `compose.yaml`, with
   a password that exists only on the runner (compose reads its own from `.env`, which a fresh checkout does not
   have), so the `DATABASE_URL` is `.env.example`'s with that password.
2. Installs Node 24 (the version of the Docker image) and the dependencies with `npm ci`.
3. Generates the Prisma client (`npm run db:generate`; `generated/prisma` is not committed) and the route types
   (`npx next typegen`: the typecheck reads `PageProps` and `LayoutProps` from `.next/types`, which only `next dev` and
   `next build` write, so a fresh checkout has none), installs Chromium for Playwright ("Installing the browser" below) and runs `npm run check`.
4. When the check fails, uploads `test-results/` (traces and screenshots of a failed Playwright test) as the artifact
   `test-results`, kept for 7 days. The check runs Playwright with the line reporter, so there is no HTML report; the
   last lines of any failing stage are in the job log.

A newer push to the same pull request cancels the run in progress; runs on `main` are never cancelled. A run stops
after 20 minutes.

The actions are pinned to a commit (`uses: …@<sha> # v4`), not to a tag that can move, and checkout does not keep the
token in `.git/config`. `.github/dependabot.yml` opens a pull request weekly when an action has a new version.

## Safe for pull requests from forks

The workflow runs on `pull_request`, never `pull_request_target`, so a fork's code runs with a read-only token
(`permissions: contents: read`) and no secrets. It uses none: the database password is the runner's throwaway.
`tests/infra/github-actions.test.ts` checks these properties, and that the service container and the Node version
still match `compose.yaml`, `.env.example` and the `Dockerfile`.

In the repository's settings (Settings → Actions → General), choose "Require approval for all external contributors":
the weaker options only cover people new to GitHub or to the repository, and a run on GitHub's runners is
still a free machine for whoever can start one.

## Making it a gate

The workflow only reports; `main` is what makes it a gate. The ruleset **Protect main** (Settings → Rules) applies to the
default branch and requires a pull request (no approvals are needed) and the status check **check** to pass, and it
forbids force-pushes and deleting `main`. It does not require the branch to be up to date with `main`. Repository admins
can bypass the ruleset, so a direct `git push origin main` still works for them (GitHub then prints "Bypassed rule
violations"); that is not how changes get in, and the project's rules (`CLAUDE.md`) say to open a pull request instead.
So the flow for every change is: branch, the local pre-push check, push the branch, `gh pr create`, wait for `check` to be
green, merge the pull request (a merge commit, with the branch deleted afterwards; the ruleset allows squash and rebase too, the
merge commit is the project's convention).

## Code scanning with CodeQL

[CodeQL](https://codeql.github.com) reads the source for security problems (injection, unsafe regular expressions,
missing escaping, unsafe use of untrusted input and the like) and, for the workflow files, for unsafe uses of Actions. It
is switched on through GitHub's **default setup**, a repository setting, so there is no workflow file for it in
`.github/workflows/`: GitHub runs it as its own "CodeQL" workflow on pushes to `main`, on pull requests into it and once a
week (`schedule: weekly` in the setup), so a new alert can also appear on a quiet week, when a new query is added.
Hard-coded secrets are the job of GitHub's separate **secret scanning** (with push protection), which is on too.

- **Settings** (Settings → Advanced Security → Code scanning, or `gh api repos/<owner>/<repo>/code-scanning/default-setup`):
  languages `javascript-typescript` (the app and its tests) and `actions` (the workflow files), query suite `default`,
  threat model `remote` (data that comes in over the network is untrusted, which is what this app's forms, routes and
  `/access` handle).
- **Reading the results:** the repository's Security tab, "Code scanning", and, for an alert a pull request introduces, as
  an annotation on the changed line. The scan does not block a merge: only the status check **check** does (see "Making it a gate"). To make CodeQL
  results required, an admin adds "Code scanning results" to the ruleset **Protect main**; it is not done, so a finding is
  a thing to look at, not a red pull request.
- **What to do with a finding:** a real problem becomes an issue (or a fix in the pull request that introduced it); a
  false positive is dismissed in the Security tab with a reason ("false positive", "won't fix" or "used in tests"), so it
  does not come back with every scan. Code that stays flagged on purpose gets a comment next to it saying why.
- **Next to the other reviews:** it does not replace the `code-reviewer` agent, which also checks the project's own rules
  (tests, documentation, translations, accessibility); CodeQL is a second, mechanical pair of eyes on the same changes.
- **To turn it off or change it:** the same settings page, or `gh api -X PATCH
  repos/<owner>/<repo>/code-scanning/default-setup -f state=not-configured`.

## The summary and the warnings

The run's summary page shows the stage times as a table with the share of each stage's limit, and a stage above 60% of its
limit gets a warning annotation (`publishToGitHub()` in `scripts/check-lib.ts`, which does nothing outside GitHub
Actions). See [testing-check.md](testing-check.md#keeping-an-eye-on-the-time) for the thresholds and what to do about them.

## Installing the browser

Two steps before `npm run check`.

- **The cache.** The downloaded browser (`~/.cache/ms-playwright`, about 150 MB) is kept between runs by `actions/cache`, under a key made of
  the hash of Playwright's `package.json` (so only a new Playwright version downloads it again). That saves the download, nothing more:
  the cache is saved when the whole job succeeds, so a run whose check fails downloads again next time, and a pull request's cache
  is its own (a fork cannot write into the scope that `main` reads).
- **The install with a limit.** `npx playwright install --with-deps chromium` also installs the browser's system libraries, which comes from
  apt on every run, since a runner starts empty. That is the part that stalled: on 2026-10-26 one run waited 11 minutes for it (a normal run
  takes about 25 s), with nothing wrong in the code. So in essence (the real script is in `check.yml`):

  ```bash
  for attempt in 1 2 3; do
    timeout --kill-after=10 120 npx playwright install --with-deps chromium && exit 0
    # a warning on the run, and between attempts: timeout 30 sudo dpkg --configure -a
  done
  exit 1
  ```

  An attempt that takes more than 120 s (apt, plus the download when the cache was empty) is stopped and tried again, three times at most,
  and a retry shows up as a warning on the run. The step as a whole is limited to 10 minutes (`timeout-minutes`). A stuck mirror then costs a
  few minutes instead of a quarter of an hour, and when all three attempts fail the step fails, so the check never runs without a browser.

What is not known: whether `timeout` reaches an apt that Playwright started through `sudo` (the first signal is relayed by `sudo`;
the later `--kill-after` may not reach a root process), and so whether a retry can still find the apt lock held. A real stuck run will show;
the warning on the run says when a retry happened. `tests/infra/github-actions.test.ts` runs the script with a fake `timeout` and
checks the cases of a first-time success, a retry and three failures.

## Limits

The check's own time limits (`scripts/check-lib.ts`: 10 s per Playwright test, 8 minutes for the stage, 11 minutes in
total) apply here too. GitHub's runners are slower than a Mac, so if a stage starts to hit a limit, raise it there,
not in the workflow.
