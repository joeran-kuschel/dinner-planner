# Changelog

`CHANGELOG.md` at the repository root says what changed in the app, in the
[Keep a Changelog](https://keepachangelog.com) layout. It answers "what is in the version at
`http://dinner.local`, and what did the last deploy bring in?"

## Layout

- `## [Unreleased]` on top: everything merged since the last release.
- Below it one `## YYYY-MM-DD` section per release, newest first.
- Inside a section the groups **Added**, **Changed**, **Fixed** and **Removed**, in that order; leave out empty ones.

There are no version numbers. `deploy.sh` tags every image with a UTC timestamp (`20261001114820`) that starts with
the day of the deploy, so a running image matches the section of that day (`npm run k8s:status` shows the tag). Name a
section by the UTC day of its deploy; a deploy just after midnight in Berlin still carries the previous UTC day.

## Writing an entry

- Every feature, fix or removal adds its entry to `Unreleased` **in the same branch**; the code-reviewer checks it.
- Write for the user of the app: "Recipes can have tags", not "Add Tag model". A change to tooling or tests is one
  short line under Changed, starting with "Tooling:".
- End with the issue and the implementing commit where there are any: `([#13](…/issues/13), [942bdaf](…/commit/942bdaf))`.
  Both are optional (tooling lines and early work have neither). The commit hash only exists after committing, so add
  it in a follow-up commit on the branch, or leave the link out.

## Cutting a release

When you deploy, rename `## [Unreleased]` to the day's date (`## 2026-10-02`) and put a fresh empty
`## [Unreleased]` with no groups above it. A release with several deploys on one day is one section.

## Test

`tests/infra/changelog.test.ts` checks that `Unreleased` comes first, that the dated sections follow newest first,
that the groups use only the four names, once each and in the order above, and that every group and every dated section has an entry.
