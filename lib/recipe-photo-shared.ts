/**
 * What both the server and the browser side of recipe photos need. Kept apart from
 * lib/recipe-photo.ts, which needs `sharp` and so must stay on the server.
 */

/** The largest upload accepted, in bytes. The server-action body limit in next.config.ts is a little above. */
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
/** The same limit as it is named to people. */
export const MAX_PHOTO_MEGABYTES = MAX_PHOTO_BYTES / (1024 * 1024);
export const MAX_PHOTO_ALT_LENGTH = 200;

/** The long edge of the recipe page's image, in pixels. */
export const PHOTO_FULL_EDGE = 1200;
/** The recipe list's card header: a fixed 3:2 crop, so every card has the same one. */
export const PHOTO_THUMB_WIDTH = 480;
export const PHOTO_THUMB_HEIGHT = 320;

/**
 * Where a recipe's photo is served (see app/recipes/[id]/photo/route.ts).
 *
 * The version is the photo's last change: a new photo gets a new address, so the
 * route can tell browsers to keep each one for good.
 */
export function recipePhotoUrl(recipeId: string, version: number, size: "thumb" | "full"): string {
  return `/recipes/${recipeId}/photo?size=${size}&v=${version}`;
}
