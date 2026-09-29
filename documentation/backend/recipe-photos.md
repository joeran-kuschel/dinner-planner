# Recipe photos

A recipe can have one photo. It is shown on the recipe's card in the list and on the recipe's page; the form to add,
replace, describe or remove it is in [Recipes](../ui/recipes.md).

## Where photos are kept

In PostgreSQL, in the `RecipePhoto` table (one row per recipe, deleted with the recipe), as `bytea`. The choice follows
the project's rules: the app stays stateless and its persistent data lives in the database, so nothing is written to the
container's disk and there is no second volume to keep in step. A backup is a database dump, so **the photos are in every
backup and come back with every restore**, in step with the recipes they belong to.

Other options were left out on purpose: a volume in the app pod would make the app stateful and needs its own backup;
an object store is a whole extra service. If the database ever grows too large, the photos can move without changing the
pages, because they are only reached through the address below.

The table is separate from `Recipe`, so listing recipes never reads image bytes: the list and the recipe page select only
the description and the time of the last change.

| Column                      | Meaning                                                                            |
| --------------------------- | ---------------------------------------------------------------------------------- |
| `full`, `fullWidth`, `fullHeight` | The recipe page's image, at most 1200 px on the long edge, and its size.    |
| `thumb`                     | The list card's image: a fixed 3:2 crop, 480 x 320 px, so every card has the same header. |
| `alt`                       | What the photo shows, for screen readers. Required for every photo.                |
| `updatedAt`                 | The last change; it names the photo's address (see Serving).                       |

## What is stored: nothing as uploaded

`lib/recipe-photo.ts` (`processPhoto`) decodes every upload and encodes it again as WebP (quality 75):

- **It checks the bytes, not the file name or the browser's file type.** Only JPEG, PNG and WebP pass. A GIF, TIFF or SVG,
  a text file with a `.jpg` name, and a cut-off file are all refused.
- **It removes metadata.** Phones write the position, time and device into a photo; none of it is stored.
- **It stands the photo up** using the orientation the camera recorded, which the new file no longer carries.
- **It bounds the work.** Files over 5 MB are refused before they are read, and so are images of more than 40 megapixels
  (a small PNG can hold far more pixels than bytes), which keeps the decoding within the pod's memory.

Because the app only ever serves what it produced, an uploaded file can never reach a visitor as a script or an SVG.
The limits and sizes are in `lib/recipe-photo-shared.ts`, which the form also reads; `lib/recipe-photo.ts` needs `sharp`
and stays on the server.

## The server actions

`createRecipe` and `updateRecipe` (`app/actions/recipes.ts`) read three more form fields:

| Field         | Meaning                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------- |
| `photo`       | The chosen file. An untouched file field posts an empty one, which counts as "no file".       |
| `photoAlt`    | The description, trimmed, at most 200 characters. Required whenever there is a photo.         |
| `removePhoto` | `1` when "Remove photo" is ticked.                                                            |

For an existing recipe the outcome is one of: a new file replaces the photo (and wins over "Remove photo"); without a file
the photo is removed, or only its description changes, or nothing changes. Saving a form without touching the photo leaves
the row alone, so its `updatedAt` and address stay the same. Everything is checked before anything is written, so a
rejected file leaves the recipe as it was.

A rejected submission echoes the typed values, and the form keeps the chosen file: `RecipeForm` submits through a
transition instead of letting React reset the form after the action (as the day card does, see "React 19 resets a form
after its action resolves" in `CLAUDE.md`), and its photo section is not re-keyed. Without this the reset empties the file
field, which a browser cannot fill in again, and a retry after any refusal (a blank name, say) would save the recipe
without the photo. The form's `action` stays for browsers without JavaScript, which post normally and lose the file.
The browser also checks before sending: the description is required once a file is chosen and a file over the limit is
refused with `setCustomValidity`; the server repeats every check.

Deleting a recipe deletes its photo through the foreign key (`ON DELETE CASCADE`).

## Serving

`GET /recipes/[id]/photo` (`app/recipes/[id]/photo/route.ts`) returns the full image, or the thumbnail with `?size=thumb`.
The content type is always `image/webp` with `X-Content-Type-Options: nosniff`, and the answer is 404 without a photo.

- The pages ask for `?size=…&v=<updatedAt in ms>`. A new photo has a new address, so a versioned answer is cached for good
  (`Cache-Control: public, max-age=31536000, immutable`).
- Without `v` the browser asks again each time and gets a cheap 304 when the ETag (`updatedAt` and size) still matches.

## Limits on the way in

A photo travels in the recipe form's request, so three limits have to agree, from the app outwards:

| Where                                            | Limit  | Why                                                       |
| ------------------------------------------------ | ------ | --------------------------------------------------------- |
| `MAX_PHOTO_BYTES` (`lib/recipe-photo-shared.ts`) | 5 MB   | The app's own limit, with a message that names it.         |
| `serverActions.bodySizeLimit` (`next.config.ts`) | 6 MB   | Next's default of 1 MB would refuse a phone photo first.   |
| `proxy-body-size` on the Ingress (`k8s/ingress.yaml`) | 8 MB | nginx's default of 1 MB answers with 413 before the app is reached. |

The annotation is on this app's Ingress only; the nginx controller is shared with other apps and is never changed.
`tests/infra/k8s.test.ts` checks that the three stay in that order.

## Backups and size

The hourly dump now includes the photos, and photos do not compress. At about 100 to 150 KB per recipe (photo and
thumbnail), 100 recipes add roughly 12 MB to every dump. To keep the backup folder from growing with every recipe,
`k8s/backup-db.sh` no longer keeps 168 hourly dumps: see [Database backups](database-backups.md).

## Tests

- `tests/unit/lib/recipe-photo.test.ts`: the processing, with generated images (formats, sizes, crop, orientation, EXIF,
  refusals, limits).
- `tests/unit/app/actions/recipes.test.ts`: create, replace, describe, remove, rejections and deletion, against the database.
- `tests/unit/app/recipes/photo/route.test.ts`: the route's bytes, headers, caching and 404s.
- `tests/unit/components/recipe-form.test.tsx`: the form's fields.
- `tests/e2e/recipe-photos.spec.ts`: a real upload through the standalone server, both pages, errors, replacing and
  removing, deletion, and accessibility.
