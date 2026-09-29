import { recipePhotoUrl } from "@/lib/recipe-photo-shared";

export type RecipePhotoProps = {
  recipeId: string;
  /** The photo's `updatedAt` in milliseconds; part of the address, see `recipePhotoUrl`. */
  version: number;
  alt: string;
  size: "thumb" | "full";
  /** The image's own size, so the page keeps its room before the image has loaded. */
  width: number;
  height: number;
  className?: string;
  lazy?: boolean;
};

/**
 * A recipe's photo. A plain `<img>` on purpose: the photo is already resized and
 * encoded when it is stored, so Next's image optimizer would only do it twice.
 */
export function RecipePhoto({ recipeId, version, alt, size, width, height, className, lazy }: RecipePhotoProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={recipePhotoUrl(recipeId, version, size)}
      alt={alt}
      width={width}
      height={height}
      loading={lazy ? "lazy" : undefined}
      decoding="async"
      className={className}
    />
  );
}
