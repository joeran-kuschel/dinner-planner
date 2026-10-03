# Recipe import

"Add from a link" ([Recipes](../ui/recipes.md)) fetches a web page for the visitor and turns the recipe on it into the
recipe form's values. It is the only place where the app fetches an address somebody typed, so most of this page is
about the rules that keep that safe.

## The flow

1. The dialog (`components/import-recipe-dialog.tsx`) posts `{ "url": "…" }` to `POST /recipes/import`
   (`app/recipes/import/route.ts`) with an `AbortController`, so **Cancel** also cancels the work on the server: the route
   passes `request.signal` on.
2. `importRecipe()` (`lib/recipe-import/index.ts`) fetches the page (`fetchPage`) and reads the recipe (`recipeFromHtml`).
3. The route answers `{ ok: true, values }` with a `RecipeFormValues`, or `{ ok: false, error: <code> }`. A failure is a
   normal 200 answer with a code; only a malformed request is a 400 (invalid JSON, no `url`, an invalid address) or a 415
   (a body that is not JSON: requiring JSON also makes a request from another website a cross-origin one that the browser
   must ask about first).
4. `NewRecipeScreen` gives the values to a fresh `RecipeForm` as `initialValues` (keyed per import, so everything starts
   over) and moves the focus to its name. Nothing is written to the database.

Without JavaScript, `app/recipes/new/page.tsx` does the same on the server when the address has `?from=<link>`, and
shows the failure beside the plain form (the form is inside `<noscript>` for `?import=1`, so a browser with JavaScript
only ever shows the dialog).

The error codes (`lib/recipe-import/errors.ts`, safe for client code) map to translated messages in
`lib/recipe-import/messages.ts`: `invalid-url`, `blocked`, `timeout`, `too-large`, `not-html`, `not-image`,
`unreachable`, `no-recipe`, `cancelled`. (`not-image` is only ever answered by the photo route; the dialog does not show it, since a
photo that cannot be had is told as "its photo could not be fetched"; the table of messages stays complete.)

### The photo

`importRecipe()` also returns `photoUrl`: the first usable address in the recipe's `image` (a string, an object with a
`url` or `contentUrl`, or a list of those; relative addresses are resolved against the page, only http(s) and at most 2048
characters count). The dialog then asks `POST /recipes/import/photo` (`app/recipes/import/photo/route.ts`, the same
`{ "url": "…" }` request as the recipe's, read by `lib/recipe-import/request.ts`) for the picture, with the same
`AbortController`, so Cancel stops this wait as well.

- **`importPhoto()`** fetches it with `fetchImage()` in `safe-fetch.ts`: the same address rules, redirects and timeout as
  a page, a size limit of `MAX_PHOTO_BYTES` (5 MB, after decompression), and an answer whose `Content-Type` is
  `image/*`. What it really is comes from its first bytes (`sniffPhotoType`): only a JPEG, PNG or WebP is handed on, whatever
  the server calls it. An SVG (which can hold a script), a GIF or an HTML page posing as a picture is `not-image`.
- **The route** answers with the bytes, `Content-Type` from the sniffing, `X-Content-Type-Options: nosniff` and
  `Cache-Control: no-store`; nothing is stored. Saving the recipe is what keeps the photo, and it goes through
  `processPhoto()` like every upload, so it is decoded and re-encoded as WebP and nothing downloaded is ever served as it
  came ([Recipe photos](recipe-photos.md)).
- **In the browser** (`ImportRecipeDialog`) the answer becomes a `File` named after the recipe, and `NewRecipeScreen` puts
  it in the new form's file field with `attachFile()` (`lib/attach-file.ts`: a `DataTransfer` and a bubbling `change` event,
  so the form's own handlers, such as making the description required, run), and starts the description as the recipe's
  name. A picture that cannot be had never fails the import: the recipe is filled in and the page says the photo could not
  be fetched.
- The page without JavaScript imports the recipe only: a server cannot fill a file field.

## What may be fetched

The app runs inside the cluster, so a pasted link to `localhost`, a pod, the node or a cloud metadata address must not
be followed. `lib/recipe-import/address.ts` and `lib/recipe-import/safe-fetch.ts` enforce:

- **Only `http` and `https`**, on the ports of the web (80 and 443, or none), without a user name or password in the
  address, at most 2048 characters.
- **Only public addresses.** `isPublicAddress()` refuses the private and reserved IPv4 ranges (`0/8`, `10/8`,
  `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.168/16`, the documentation and benchmarking ranges, multicast,
  reserved and broadcast) and the IPv6 ones (unspecified, loopback, unique local, link-local, multicast, documentation,
  Teredo), and looks inside the IPv6 forms that carry an IPv4 address (mapped `::ffff:a.b.c.d`, compatible, NAT64 and
  6to4). `URL` already turns `2130706433`, `0x7f000001` and `0177.0.0.1` into `127.0.0.1`.
- **Checked when the connection is made.** A name that resolves to a private address is refused by the socket's own
  `lookup` hook, which sees every answer and refuses all of them if one is private. That is also what stops a DNS name
  that changes its answer between a check and the connection (rebinding): there is no check separate from the connection.
- **Redirects are followed at most three times**, and each target goes through the same rules (`nextHop()`), so a public
  page cannot send the import to a private address.
- **Limits:** the whole fetch takes at most 10 seconds (`FETCH_TIMEOUT_MS`); the page is at most 2 MB (`MAX_PAGE_BYTES`),
  counted after decompression (gzip, deflate and Brotli are unpacked), so a small download cannot unpack into a large one;
  only `text/html` and `application/xhtml+xml` come back; any status outside 2xx is a failure.
- The request carries no cookies and nothing of the visitor's; it introduces itself as `DinnerPlanner/1.0`.

The same care goes to what comes back, because a page is hostile input and the app runs on one thread: nothing that reads
a page uses a regular expression that can backtrack. The JSON-LD blocks are found by literal searches
(`extractJsonLd`), tags are removed by a scanner that never goes back (`stripTags`), every text is cut to 100 000
characters before it is cleaned, an ingredient line to 300, and nested data is read at most six levels deep.
`tests/unit/lib/recipe-import/jsonld.test.ts` feeds 200 KB of `<script `, `<`, `&` and `(` to each and requires an answer
in under a second.

The route reads at most 4096 bytes of body (413 beyond that). The no-JavaScript page fetches on a plain GET
(`/recipes/new?from=…`), so it ignores `?from=` when the browser reports `Sec-Fetch-Site: cross-site`: a link on another
website cannot make the app fetch anything; a link typed, bookmarked or sent from the app's own form can.

Nothing else in the app may fetch a user-supplied address. `tests/infra/recipe-import.test.ts` checks that no other file
opens connections or calls `fetch`, and that `fetchPage` has the one caller.

### The test switch

The end-to-end tests serve a sample recipe website from this machine, which the rules above would refuse. For that,
`RECIPE_IMPORT_ALLOW_PRIVATE=1` (read only in `lib/recipe-import/index.ts`) lifts the private-address rules. It is set in
`playwright.config.ts` for the test server and nowhere else: `tests/infra/recipe-import.test.ts` fails if the Dockerfile,
`compose.yaml`, any manifest in `k8s/` or `.env` mentions it. Never set it for a real deployment.

The pod needs to reach the internet for the import to work; Docker Desktop's Kubernetes does by default.

## Reading the recipe

Most recipe websites publish the recipe as schema.org `Recipe` data in a `<script type="application/ld+json">` block;
`lib/recipe-import/jsonld.ts` reads that and nothing else (Microdata and plain text are not read, and such a page answers
`no-recipe`).

- **Finding it:** every JSON-LD block is parsed (broken JSON gets one repair attempt, control characters in strings);
  the first `Recipe` with a name and ingredients or instructions wins, wherever it sits (top level, a list, `@graph`,
  nested, at most six levels deep). `@type` may be a string, a list or a schema.org address.
- **Text** is cleaned of tags and entities (`<br>`, `</p>` and `</li>` become line breaks), so no markup ever reaches the
  form. The form shows it as text anyway.
- **Mapping:**

  | Form field | From | Rule |
  | ---------- | ---- | ---- |
  | name | `name` | up to 200 characters |
  | description | `description` | one line, up to 500 characters |
  | servings | `recipeYield` | the first whole number from 1 to 99; otherwise 2 |
  | prep time | `prepTime`, else `totalTime` | ISO 8601 duration to minutes, 1 to 1440; otherwise empty |
  | source | the page's final address | after redirects, without the fragment |
  | method | `recipeInstructions` | a string, steps (`HowToStep`) or sections (`HowToSection`); one step per line, up to 20 000 characters |
  | tags | `recipeCategory`, `recipeCuisine`, `keywords` | in that order; normalised like every tag, those over 30 characters dropped, at most 6 |
  | ingredients | `recipeIngredient` (or `ingredients`) | up to 60 rows, see below |

- **Ingredient lines** (`lib/recipe-import/ingredient.ts`): amount (whole, decimal with `.` or `,`, fraction `1/2`, mixed
  `1 1/2`, a Unicode fraction such as `½` or `1½`, a range `2-3` read as its upper end), then a unit if the next word is
  one the table knows (English and German spellings, stored in the source's language: `tbsp`, `TL`, `Prise`, …), then the
  name, without bracketed notes and without what follows a comma or semicolon. A unit word only counts after an amount
  (except `pinch`, `dash` and `Prise`). A line that yields no name stays whole. The category is always `OTHER`.
- **Not imported:** the author, ratings and nutrition. The photo is imported separately, see above.

## Tests

- `tests/unit/lib/recipe-import/`: `address` (every range, the IPv6 tricks, the URL rules), `safe-fetch` against a local
  server (redirects, limits, compression, character sets, timeout, cancel, `nextHop`, `fetchImage`), `ingredient`, `jsonld`, `index`.
- `tests/unit/app/recipes/import/route.test.ts` and `…/photo/route.test.ts`: the routes' answers, the picture's bytes and
  type, the JSON requirement, the size limit and cancelling.
- `tests/unit/lib/recipe-import/image.test.ts`: the sniffing; `attach-file.test.ts` in `tests/unit/lib/`.
- `tests/unit/components/`: the dialog, the split-button menu, the new-recipe screen, the form's `initialValues`.
- `tests/e2e/recipe-import.spec.ts`: the whole flow in a browser against a sample website, errors, Cancel, Escape and the
  focus, German, and the page without JavaScript. `tests/support/recipe-site.ts` is that sample website.
- `tests/infra/recipe-import.test.ts`: the rules above about who may fetch and where the test switch may be set.
