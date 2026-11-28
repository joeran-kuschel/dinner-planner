---
paths:
  - "app/recipes/**"
  - "app/actions/recipes.ts"
  - "lib/recipe*.ts"
  - "lib/recipe-import/**"
  - "lib/tags.ts"
  - "lib/cook-again.ts"
  - "lib/form-snapshot.ts"
  - "components/recipe-*.tsx"
  - "components/new-recipe-screen.tsx"
  - "components/leave-guard.tsx"
  - "lib/safe-path.ts"
  - "lib/form-data.ts"
  - "components/tag-input.tsx"
  - "components/import-recipe-dialog.tsx"
  - "components/new-recipe-menu.tsx"
  - "components/favorite-button.tsx"
---

# Recipes

Details: `documentation/backend/recipe-photos.md`, `recipe-import.md`, `recipe-tags.md`, `favorites.md`, `unsaved-changes.md`, `forms-and-actions.md`.

- **Recipe photos live in the database and nothing uploaded is served as it came in.** Always through `processPhoto()`
  (`lib/recipe-photo.ts`, re-encoded WebP) and `recipePhotoUrl()`; queries must not select `full` or `thumb` except to serve the image.
  The limits stay in order: `MAX_PHOTO_BYTES` (5 MB) < `serverActions.bodySizeLimit` (6 MB) <= `proxy-body-size` (8 MB, this Ingress
  only; `tests/infra/k8s.test.ts` checks). `RecipeForm` submits through a transition so the photo field survives React 19's form reset. Pages reach a photo only through
  `recipePhotoUrl()` (the version is in the address, cached for good). `sharp` is a runtime dependency (its native binary ships in the
  Alpine app image): never move it to `devDependencies`.
- **Only `lib/recipe-import/safe-fetch.ts` fetches an address a user typed** (`fetchPage()`, `fetchImage()`); never call `fetch` or
  `node:http(s)` for a user-supplied URL elsewhere (`tests/infra/recipe-import.test.ts` checks). `RECIPE_IMPORT_ALLOW_PRIVATE=1` is for
  the Playwright server alone and must never appear in a manifest.
- **Tags** go through `normalizeTag()` / `parseTags()` (`lib/tags.ts`, lowercase) and are pruned when unused, in the same transaction.
- **Favorites and "last planned" are read, not stored**, and every text says "planned" (`lib/recipe-activity.ts`, `lib/cook-again.ts`).
- **Leaving the recipe form with changes asks first** (`components/leave-guard.tsx`, `lib/form-snapshot.ts`); a `next` path is followed
  only through `safeSitePath()`.
- **Deleting a recipe clears the days that only pointed at it** (same transaction); **recipe edits replace the ingredient set**
  (`deleteMany` + `create`, row order is authoritative).
- On a validation error the form re-fills from `RecipeFormState.values`, re-keyed on `attempt`.
