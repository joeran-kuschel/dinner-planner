# GitHub Actions: the check on every pull request

`.github/workflows/check.yml` runs [`npm run check`](testing-check.md) on GitHub for every pull request and every push
to `main`: the build, lint, the Vitest suite, the typecheck and the Playwright specs (the build runs next to lint and Vitest; the stages and
their order are in [testing-check.md](testing-check.md)). It is the same command the `test-engineer`
agent runs on the developer's machine, so a green run there and a green run here mean the same thing.

## What the job does

1. Runs the job inside Playwright's own image (`container:`, "The browser" below), which has the browser and its system libraries.
2. Starts a throwaway Postgres as a service container: the image, user and database of `compose.yaml`, with
   a password that exists only on the runner (compose reads its own from `.env`, which a fresh checkout does not
   have). The job runs in a container, so the database is reached by the service's name on Postgres's own port: the
   `DATABASE_URL` is `.env.example`'s, with that password and the host `postgres:5432`.
3. Installs Node 24 (the version of the Docker image) and the dependencies with `npm ci`.
4. Generates the Prisma client (`npm run db:generate`; `generated/prisma` is not committed) and the route types
   (`npx next typegen`: the typecheck reads `PageProps` and `LayoutProps` from `.next/types`, which only `next dev` and
   `next build` write, so a fresh checkout has none) and runs `npm run check`.
5. When the check fails, uploads `test-results/` (traces and screenshots of a failed Playwright test) as the artifact
   `test-results`, kept for 7 days. The check runs Playwright with the line reporter, so there is no HTML report; the
   last lines of any failing stage are in the job log.

A newer push to the same pull request cancels the run in progress; runs on `main` are never cancelled. A run stops
after 20 minutes.

The actions are pinned to a commit (`uses: …@<sha> # v4`), not to a tag that can move, and checkout does not keep the
token in `.git/config`. `.github/dependabot.yml` opens a pull request weekly when an action has a new version. It does not cover the Playwright image ("The browser" below): that one is bumped by hand, with Playwright.

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

## The browser: Playwright's image

The job runs in `mcr.microsoft.com/playwright:v<version>-noble`, Playwright's own image: it has the Chromium that Playwright drives (the very
revision of that Playwright version, the one `npm run check` uses on a Mac) and every system library it needs. Nothing is installed from apt at run time.

**Why.** Until 2026-10-27 the job ran `npx playwright install --with-deps chromium`, which downloads about 40 packages from Ubuntu's mirror
on every run, since a runner starts empty. It normally takes 25 s, but it stalled more than once with nothing wrong in the code: on 2026-10-26 one run
waited 11 minutes, and the `apt-get` that Playwright starts through `sudo` kept the dpkg lock when `timeout` stopped the attempt, so the next attempts failed
at once ("Could not get lock /var/lib/dpkg/lock-frontend"); on 2026-10-27 all three attempts of 120 s stalled and the run failed before any test. A cache for the
browser, a timeout with three attempts and a cleanup of the leftover apt (never removing a lock file by hand) made it recover more often, but not reliably
([#100](https://github.com/joeran-kuschel/dinner-planner/issues/100)). With the image there is no apt, no cache and no retry loop to keep.

**The pin.** The image is named by its tag *and* its digest (`…:v1.63.0-noble@sha256:…`), as the actions are pinned to a commit: the pull gets exactly the
same layers every time. The tag has to be the version of `@playwright/test` in `package.json`, since a browser of another revision would not be the one Playwright
expects; `tests/infra/github-actions.test.ts` compares the tag with the installed `playwright-core` and says what to set when they differ. **A Playwright upgrade
therefore needs the image changed in the same pull request** (Dependabot does not read the `container:` image of a workflow, so it is also what keeps the image's operating system and browser build current: bump it when Playwright is upgraded, and from time to time otherwise): set the tag to the new version and the digest to the one of `docker buildx imagetools inspect
mcr.microsoft.com/playwright:v<version>-noble` (the line `Digest:` of the multi-platform index).

**The pull.** GitHub's runner pulls the image itself, before the first step, and a job container has no pull policy (`IfNotPresent` and the like are
Kubernetes' concept): the settings of a container are `image`, `credentials`, `env`, `ports`, `volumes` and `options`, and `options` are arguments to `docker create`, which runs after the runner's own `docker pull`. A runner
starts empty, so "only if missing" would always mean "always" anyway. If a pull ever fails, the job fails at its start and **re-running the job** is the remedy (a pull that
hangs ends the job at the latest when `timeout-minutes: 20` runs out, so a retry may cost that wait). If that turns out to happen, the next step would be to pull by hand with `docker pull` in a step with
retries and run the check with `docker run`; that was left out because it brings host networking for Postgres and `node_modules` made on the host and run by the image's Node.

**Node.** The image's Node is 24, the same major as `setup-node`'s, which stays for `cache: npm` (the downloaded packages are kept between runs); the Dockerfile test still reads its version.

**The options.** `--ipc=host` (Chromium's shared memory: the container's default `/dev/shm` is 64 MB) and `--init` (stray browser processes are reaped) are
Playwright's advice for Chromium in a container. The image runs as root, so there is no `sudo`, and the workspace (owned by the runner's user) has to be trusted for git before the check (`git config --global --add safe.directory "$GITHUB_WORKSPACE"`): without it git refuses it as "dubious ownership" and the infra tests that run `git ls-files` fail (the first run of this setup did).

To try the image on a Mac: `docker run --rm -it --ipc=host mcr.microsoft.com/playwright:v1.63.0-noble bash`, copy the repository in without `node_modules`, `.next` and `generated`, set
`DATABASE_URL` to the host's Postgres (`host.docker.internal:5433`) and run `npm ci`, `npm run db:generate` and `npx playwright test`.

## Limits

The check's own time limits (`scripts/check-lib.ts`: 10 s per Playwright test, 8 minutes for the stage, 11 minutes in
total) apply here too. GitHub's runners are slower than a Mac, so if a stage starts to hit a limit, raise it there,
not in the workflow.
