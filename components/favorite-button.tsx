"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useFormStatus } from "react-dom";
import { setRecipeFavorite } from "@/app/actions/recipes";
import { StarIcon } from "@/components/star-icon";

export type FavoriteButtonProps = {
  id: string;
  /** The recipe's name: the star on a list card is named after it, since there are many. */
  name: string;
  favorite: boolean;
  /** `button`: a pill with the word "Favorite" (the recipe page); `star`: a round star on a list card. */
  variant: "button" | "star";
};

/**
 * Marks a recipe as a favorite: a toggle button (`aria-pressed`), so the state is the button's, not its colour: the star is
 * filled and the button tinted when it is on. A plain form, so it works without JavaScript. The button stays the same element
 * when the page is drawn again, so the focus stays on it.
 */
export function FavoriteButton({ id, name, favorite, variant }: FavoriteButtonProps) {
  const { i18n } = useLingui();
  return (
    <form action={setRecipeFavorite}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="favorite" value={String(!favorite)} />
      {variant === "button" ? (
        <Toggle pressed={favorite} label={t(i18n)`Favorite`} className="btn-secondary gap-2" />
      ) : (
        <Toggle
          pressed={favorite}
          label={t(i18n)`Favorite ${name}`}
          className="btn-icon size-11 rounded-full border border-border bg-surface"
          iconOnly
        />
      )}
    </form>
  );
}

function Toggle({ pressed, label, className, iconOnly = false }: { pressed: boolean; label: string; className: string; iconOnly?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      aria-pressed={pressed}
      aria-label={iconOnly ? label : undefined}
      // Not `disabled`: a disabled button drops the keyboard focus. A press while the save runs does nothing.
      aria-disabled={pending || undefined}
      onClick={(event) => pending && event.preventDefault()}
      className={`${className} ${pressed ? "border-accent bg-accent-soft text-accent-text" : ""}`}
    >
      <StarIcon filled={pressed} size={iconOnly ? 22 : 20} />
      {!iconOnly && label}
    </button>
  );
}
