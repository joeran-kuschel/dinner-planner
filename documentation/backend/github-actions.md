# GitHub Actions: the check on every pull request

`.github/workflows/check.yml` runs [`npm run check`](testing-check.md) on GitHub for every pull request and every push
to `main`: typecheck, lint, the Vitest suite and the Playwright specs. It is the same command the `test-engineer`
agent runs on the developer's machine, so a green run there and a green run here mean the same thing.

## What the job does

1. Starts a throwaway Postgres as a service container: the image, login and host port of `compose.yaml`, so the
   `DATABASE_URL` is the one in `.env.example`.
2. Installs Node 24 (the version of the Docker image) and the dependencies with `npm ci`.
3. Generates the Prisma client (`npm run db:generate`; `generated/prisma` is not committed), installs Chromium for
   Playwright and runs `npm run check`.
4. When the check fails, uploads `playwright-report/` and `test-results/` (traces, screenshots) as the artifact
   `playwright-report`, kept for 7 days.

A newer push to the same branch cancels the run in progress, and a run stops after 20 minutes.

## Safe for pull requests from forks

The workflow runs on `pull_request`, never `pull_request_target`, so a fork's code runs with a read-only token
(`permissions: contents: read`) and no secrets. It uses none: the database login is the throwaway one in the repository.
`tests/infra/github-actions.test.ts` checks these properties, and that the service container and the Node version
still match `compose.yaml`, `.env.example` and the `Dockerfile`.

In the repository's settings (Settings → Actions → General), "Require approval for first-time contributors" keeps
a stranger's first pull request from running before you have looked at it.

## Making it a gate

The workflow only reports. To keep a red run from being merged, protect `main` (Settings → Branches, or Rules) and
require the status check **Check / check** before merging.

## Limits

The check's own time limits (`scripts/check-lib.ts`: 10 s per Playwright test, 5 minutes for the stage, 8 minutes in
total) apply here too. GitHub's runners are slower than a Mac, so if a stage starts to hit a limit, raise it there,
not in the workflow.
