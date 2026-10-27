# Screenshots in the documentation

The pages in `documentation/ui/` show the screens they describe. The pictures are in `documentation/images/`, WebP files named for what they show (`week-plan.webp`, `grocery-merge-dialog.webp`). They are made by a script, so they can be made again when a screen changes, and a hand-taken picture never goes out of date unnoticed.

| Picture | Page |
| ------- | ---- |
| `week-plan.webp`, `week-plan-phone.webp`, `leftovers-dialog.webp`, `cook-again.webp` | [Week plan](../ui/week-plan.md) |
| `recipes.webp`, `recipe-form.webp` | [Recipes](../ui/recipes.md) |
| `groceries.webp`, `grocery-merge-dialog.webp` | [Grocery list](../ui/groceries.md) |

## Making them again

```bash
npm run docs:screenshots
```

Run it after a change to a screen with a picture, and commit the changed files. It is not part of `npm run check` or the GitHub check, so a picture is never what fails a pull request.

- **It starts the same server as the end-to-end tests**: the standalone build and the separate `e2e` schema (`playwright.screenshots.config.ts`, which builds on `playwright.config.ts`), so the real data is never in a picture. The script is `tests/screenshots/documentation.shots.ts`.
- **The data is made by the script**: eight sample recipes, this week's plan with a leftovers day, two favorites, one recipe planned five weeks ago and one twelve weeks ago, and a grocery list with a hand-added item and two ticked lines. Nothing in it is a real recipe.
- **The days are the real current week.** The server's "today" cannot be pinned without production code, so the week plan shows the day the script ran, and "last planned" reads relative to it.
- **The build takes minutes, the pictures seconds.** The first run builds the app. To run the script again without building, after a build: `E2E_PREBUILT=1 npm run docs:screenshots`.
- **Size:** each picture is a WebP at quality 85, 1280 px wide (390 px for the phone view), made with `sharp`. Whole pages are shot with a window as tall as the page, so the sticky menu stays at the top.
- Language and colours: English, light.

## Adding a picture

Add a step to the script that ends in `shoot()` or `shootPage()`, run it, and show the file on a page with a Markdown image whose path is `../images/<name>.webp`. The alt text says what the picture shows (at least a sentence), because it is what a screen reader reads.

## The test

`tests/infra/documentation-images.test.ts` runs with the other infra tests. It checks that every image a page shows is a file in `documentation/images/`, that it has alt text, that no file there is unused, and that none is over 300 KB. It does not run the script.
