# Changelog

What changed in the dinner planner, newest first. Format: [Keep a Changelog](https://keepachangelog.com).
Sections are headed by the release day; the image a deploy puts on the cluster is tagged with a UTC timestamp that
starts with that day. How to write an entry and cut a release: [documentation/backend/changelog.md](documentation/backend/changelog.md).

## [Unreleased]

### Added

- The source is open under the MIT license (the `LICENSE` file).
- "Add from a link" also brings the recipe's photo along, when the page has one: it lands in the photo field for you to check, described with the recipe's name until you change it ([#5](https://github.com/joeran-kuschel/dinner-planner/issues/5)).
- A recipe can be added from a link: "Add from a link" in the New recipe menu fetches the page and fills the recipe form for you to check, with a clear message when a page has no recipe ([#5](https://github.com/joeran-kuschel/dinner-planner/issues/5)).
- The recipe search folds its tag list away until a tag filters, and then counts the selected tags ([#30](https://github.com/joeran-kuschel/dinner-planner/issues/30)).
- A line on the week plan says that "Serves" scales the grocery list ([#19](https://github.com/joeran-kuschel/dinner-planner/issues/19)).
- The recipe form's ingredient rows have visible column names instead of example text, suggest units, and Enter jumps to the next row's first field (adding a row after the last) ([#14](https://github.com/joeran-kuschel/dinner-planner/issues/14)).
- A changelog (this file), checked by a test ([#32](https://github.com/joeran-kuschel/dinner-planner/issues/32)).

### Changed

- Tooling: browser tests check the week buttons and the questions of "Clear the whole week" and "Delete" at 320 px in German ([#25](https://github.com/joeran-kuschel/dinner-planner/issues/25)).
- Tooling: Vitest drops the test schemas that a cut-off run left behind in the development database.
- The database password is no longer in the source: `npm run db:up` creates a random one in your own `.env`, and the Kubernetes setup creates its own on the first deploy. `npm run k8s:rotate-db-password` changes the cluster's password later, after a backup.
- On the grocery list, "Add something else" moved above the list as a closed fold-out, so a forgotten item no longer needs a scroll past everything ([#21](https://github.com/joeran-kuschel/dinner-planner/issues/21)).
- A recipe card shows the next day the recipe is planned for ("next Tue 6 Oct") instead of how many times it has been planned ([#15](https://github.com/joeran-kuschel/dinner-planner/issues/15)).
- The grocery list's header counts distinct recipes and says how many typed dinners add nothing ([#20](https://github.com/joeran-kuschel/dinner-planner/issues/20)).
- A new look for the whole app: warm paper colours with a tomato accent, serif headings, rounded buttons, and a clearer focus ring on everything you tab to ([#33](https://github.com/joeran-kuschel/dinner-planner/issues/33)).
- On a phone the menu is a tab bar at the bottom of the screen.
- The browser tab and the home-screen icon show the app's logo, the tomato disc with the plate.
- The week plan is one list of days instead of seven cards; recipes without a photo get a coloured tile; the grocery list shows a progress bar and two columns on wide screens.
- The prep time field of the recipe form is labelled "Prep time (min)" ([#14](https://github.com/joeran-kuschel/dinner-planner/issues/14)).

### Fixed

- On a day card, "Saving…" no longer shows for a moment next to the message that a save failed ([#53](https://github.com/joeran-kuschel/dinner-planner/issues/53)).
- The recipe form suggests the units "EL" and "TL" on the English page too, next to g, kg, ml and l ([#44](https://github.com/joeran-kuschel/dinner-planner/issues/44)).
- Typing several words into the recipe search, such as two tags (`vegetarian quick`), now finds the recipes that match all of them; a quoted phrase ("one pot") stays together ([#46](https://github.com/joeran-kuschel/dinner-planner/issues/46)).
- Removing a tag in the recipe form puts the cursor back in the tag field, so pressing Enter afterwards no longer removes the next tag as well ([#41](https://github.com/joeran-kuschel/dinner-planner/issues/41)).
- Removing a pantry staple puts the cursor in the "Add a staple" field, so pressing Enter afterwards no longer removes the next staple as well ([#52](https://github.com/joeran-kuschel/dinner-planner/issues/52)).
- "Back to the plan" on a recipe opened from a day card returns to that card's week instead of the current one ([#23](https://github.com/joeran-kuschel/dinner-planner/issues/23)).
- Undo after "Clear day" no longer overwrites a dinner planned for that day in another tab in the meantime ([#24](https://github.com/joeran-kuschel/dinner-planner/issues/24)).
- On the grocery list, a tick box could show the opposite of what was saved once the save finished, and a tap in the first moment after the page opened was lost. The box now stays as saved, and it is greyed out until the page is ready ([#51](https://github.com/joeran-kuschel/dinner-planner/issues/51)).

## 2026-10-01

### Added

- Pantry staples: names you always have at home (salt, oil) can be listed on the grocery page, and matching lines are hidden from the list ([#2](https://github.com/joeran-kuschel/dinner-planner/issues/2), [c8036b4](https://github.com/joeran-kuschel/dinner-planner/commit/c8036b4)).

### Changed

- The grocery list is easier to read and tick off: bigger rows you can tick anywhere, ticked items stay in place, a count of what is left ([#13](https://github.com/joeran-kuschel/dinner-planner/issues/13), [942bdaf](https://github.com/joeran-kuschel/dinner-planner/commit/942bdaf)).
- Buttons that delete or clear are red, and every button is at least 44 px on a touch screen ([#17](https://github.com/joeran-kuschel/dinner-planner/issues/17), [9bc93fe](https://github.com/joeran-kuschel/dinner-planner/commit/9bc93fe)).
- Tooling: every end-to-end test starts with an empty database ([#26](https://github.com/joeran-kuschel/dinner-planner/issues/26), [9d09493](https://github.com/joeran-kuschel/dinner-planner/commit/9d09493)).

### Removed

- The "Untick everything" button on the grocery list ([#17](https://github.com/joeran-kuschel/dinner-planner/issues/17)).

## 2026-09-30

### Added

- Recipe tags, a recipe search and recipe suggestions from the third letter ([#1](https://github.com/joeran-kuschel/dinner-planner/issues/1), [8161bf2](https://github.com/joeran-kuschel/dinner-planner/commit/8161bf2)).
- The grocery list is grouped by shop section, and every ingredient has one ([#3](https://github.com/joeran-kuschel/dinner-planner/issues/3), [77e70a4](https://github.com/joeran-kuschel/dinner-planner/commit/77e70a4)).

### Changed

- Mandatory fields are marked with an asterisk and a note ([#27](https://github.com/joeran-kuschel/dinner-planner/issues/27), [e5b56cc](https://github.com/joeran-kuschel/dinner-planner/commit/e5b56cc)).
- Tooling: `npm run check`, a time-limited check without retries ([#28](https://github.com/joeran-kuschel/dinner-planner/issues/28), [64fea1d](https://github.com/joeran-kuschel/dinner-planner/commit/64fea1d)); a launch config for the dev preview; the review comes before the check.

## 2026-09-29

### Added

- A photo for every recipe ([#8](https://github.com/joeran-kuschel/dinner-planner/issues/8), [5ff3980](https://github.com/joeran-kuschel/dinner-planner/commit/5ff3980)).
- The plan is available in German and English, switchable without a reload ([d1d9713](https://github.com/joeran-kuschel/dinner-planner/commit/d1d9713)).
- A planned day links to its recipe ([#11](https://github.com/joeran-kuschel/dinner-planner/issues/11), [011ffa4](https://github.com/joeran-kuschel/dinner-planner/commit/011ffa4)).
- "Saved" confirms a finished auto-save ([#10](https://github.com/joeran-kuschel/dinner-planner/issues/10), [ba75f69](https://github.com/joeran-kuschel/dinner-planner/commit/ba75f69)).
- Previous week and "This week" on the grocery list ([#12](https://github.com/joeran-kuschel/dinner-planner/issues/12), [ad4cbdd](https://github.com/joeran-kuschel/dinner-planner/commit/ad4cbdd)).
- Undo for "Clear day" ([#9](https://github.com/joeran-kuschel/dinner-planner/issues/9), [4d4db66](https://github.com/joeran-kuschel/dinner-planner/commit/4d4db66)).

### Changed

- Deleting a recipe or clearing a week asks first ([#9](https://github.com/joeran-kuschel/dinner-planner/issues/9), [4d4db66](https://github.com/joeran-kuschel/dinner-planner/commit/4d4db66)).
- The project is called dinner-planner ([654a761](https://github.com/joeran-kuschel/dinner-planner/commit/654a761)).

## 2026-09-28

### Added

- The first version: recipes with ingredients, one dinner per day, a grocery list for the week, kept in Postgres and deployable to Kubernetes ([1b76451](https://github.com/joeran-kuschel/dinner-planner/commit/1b76451)).
- Recipe suggestions while planning a dinner, and dinners that are no recipe ([da86baf](https://github.com/joeran-kuschel/dinner-planner/commit/da86baf)).

### Changed

- Tooling: tests moved into `tests/`, end-to-end tests run against the same server as the image.

### Fixed

- "1 ingredients" now reads "1 ingredient" ([a7256ba](https://github.com/joeran-kuschel/dinner-planner/commit/a7256ba)).
