"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { type ChangeEvent, type KeyboardEvent, useEffect, useRef, useState } from "react";
import { MAX_TAG_LENGTH, MAX_TAGS, normalizeTag, splitTags } from "@/lib/tags";

/**
 * The recipe form's tags: a text field that turns what is typed into chips on Enter or a
 * comma. Each chip posts as a hidden `tag`; the text field posts as `tags`, which the server
 * also splits on commas, so text still in the field when the form is sent is not lost and
 * the form works without JavaScript.
 *
 * Enter with something typed adds a chip instead of sending the form; with the field empty
 * it sends the form like in every other field. The changes are announced, since a chip
 * appearing or going is otherwise silent for a screen reader.
 */
export function TagInput({ initial, suggestions }: { initial: string[]; suggestions: string[] }) {
  const { i18n } = useLingui();
  const [tags, setTags] = useState(initial);
  const [draft, setDraft] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const chipList = useRef<HTMLUListElement>(null);
  const field = useRef<HTMLInputElement>(null);
  // Where the focus goes once the removed chip is gone: the button now in its place, or the field.
  const focusAfterRemoval = useRef<number | null>(null);

  useEffect(() => {
    const index = focusAfterRemoval.current;
    if (index === null) return;
    focusAfterRemoval.current = null;
    const buttons = chipList.current?.querySelectorAll("button") ?? [];
    (buttons[Math.min(index, buttons.length - 1)] ?? field.current)?.focus();
  }, [tags]);

  const add = (typed: string[]) => {
    const fresh = [...new Set(typed)].filter((tag) => !tags.includes(tag));
    const room = fresh.slice(0, Math.max(MAX_TAGS - tags.length, 0));
    if (room.length < fresh.length) {
      setAnnouncement(t(i18n)`A recipe can have at most ${MAX_TAGS} tags.`);
    } else if (room.length > 0) {
      const added = room.join(", ");
      setAnnouncement(t(i18n)`Added tag ${added}`);
    }
    if (room.length > 0) setTags([...tags, ...room]);
  };

  const onChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.value;
    if (!value.includes(",")) return setDraft(value.trimStart());
    // Everything before the last comma is finished; what follows stays to be typed on.
    const cut = value.lastIndexOf(",");
    add(splitTags(value.slice(0, cut)));
    setDraft(value.slice(cut + 1).trimStart());
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || !normalizeTag(draft)) return;
    event.preventDefault();
    add(splitTags(draft));
    setDraft("");
  };

  const remove = (tag: string) => {
    focusAfterRemoval.current = tags.indexOf(tag);
    setTags((current) => current.filter((other) => other !== tag));
    setAnnouncement(t(i18n)`Removed tag ${tag}`);
  };

  return (
    <section className="card flex flex-col gap-3 p-4">
      <div>
        <label className="label" htmlFor="tags">
          {t(i18n)`Tags`}
        </label>
        <input
          id="tags"
          ref={field}
          name="tags"
          className="field mt-1"
          value={draft}
          onChange={onChange}
          onKeyDown={onKeyDown}
          maxLength={MAX_TAG_LENGTH * 3}
          autoComplete="off"
          list="tag-suggestions"
          aria-describedby="tags-hint"
          placeholder={t(i18n)`vegetarian`}
        />
        <datalist id="tag-suggestions">
          {suggestions
            .filter((tag) => !tags.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
        <p id="tags-hint" className="mt-1 text-xs text-muted">
          {t(i18n)`Press Enter or type a comma to add a tag. Up to ${MAX_TAGS} tags of ${MAX_TAG_LENGTH} characters.`}
        </p>
      </div>

      <TagChips ref={chipList} tags={tags} onRemove={remove} />

      <p role="status" className="sr-only">
        {announcement}
      </p>
    </section>
  );
}

/** The chosen tags, each with its own remove button. */
function TagChips({
  ref,
  tags,
  onRemove,
}: {
  ref: React.Ref<HTMLUListElement>;
  tags: string[];
  onRemove: (tag: string) => void;
}) {
  const { i18n } = useLingui();
  if (tags.length === 0) return null;
  return (
    <ul ref={ref} aria-label={t(i18n)`Tags of this recipe`} className="flex flex-wrap gap-2">
      {tags.map((tag) => (
        <li key={tag} className="pill">
          <input type="hidden" name="tag" value={tag} />
          {tag}
          <button
            type="button"
            onClick={() => onRemove(tag)}
            className="pill-remove"
            aria-label={t(i18n)`Remove tag ${tag}`}
          >
            ✕
          </button>
        </li>
      ))}
    </ul>
  );
}
