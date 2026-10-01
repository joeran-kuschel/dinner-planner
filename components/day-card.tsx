"use client";

import type { I18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useCombobox, type UseComboboxReturnValue } from "downshift";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { clearPlannedMeal, setPlannedMeal } from "@/app/actions/meals";
import { isSameDinner, matchingTag, MAX_SERVINGS, suggestsRecipe } from "@/lib/planner";

export type DayCardMeal = {
  recipeId: string | null;
  customTitle: string | null;
  servings: number;
  notes: string | null;
};

export type DayCardProps = {
  dayKey: string;
  weekdayLabel: string;
  dateLabel: string;
  isToday: boolean;
  /** `tags` are what the dinner field can also find a recipe by. */
  recipes: { id: string; name: string; tags: string[] }[];
  meal: DayCardMeal | null;
};

/** The day a field belongs to, for ids and screen-reader labels. */
type Day = { key: string; weekday: string };

/** How long "Saved" stays on the card. */
const SAVED_VISIBLE_MS = 3000;

/** The dinner the day's form submits: see `setPlannedMeal` for how the server reads it. */
type Choice = { dinner: string; recipeId: string; newRecipe: boolean };

export function DayCard({ dayKey, weekdayLabel, dateLabel, isToday, recipes, meal }: DayCardProps) {
  const day: Day = { key: dayKey, weekday: weekdayLabel };
  const { i18n } = useLingui();
  const [choice, setChoice, resyncChoice] = useChoice(meal, recipes);
  const formRef = useServerSync(meal);
  const router = useRouter();
  const [pending, failed, saved, undo, submit] = useAutoSave(() => {
    // E.g. the picked recipe was deleted in another tab. Show what is saved
    // (as of the latest render, not the one the save started in), and fetch
    // the current recipes so the stale one is no longer suggested.
    resyncChoice();
    if (formRef.current) showSavedValues(formRef.current);
    router.refresh();
  });

  // Everything saves by itself, so there is no per-day save button to hunt for.
  // Text and number fields save on blur rather than on change, so a save never
  // lands in the middle of typing.
  const save = () => formRef.current?.requestSubmit();
  const saveStatus = pending
    ? t(i18n)`Saving…`
    : undo
      ? t(i18n)`Day cleared`
      : saved
        ? t(i18n)`Saved`
        : "";

  // A new choice reaches the hidden fields only with the next render, so the
  // save that follows a pick waits for it.
  const [saveRequest, setSaveRequest] = useState(0);
  useEffect(() => {
    if (saveRequest > 0) formRef.current?.requestSubmit();
  }, [saveRequest, formRef]);

  return (
    <form
      ref={formRef}
      action={setPlannedMeal}
      onSubmit={submit}
      className={`grid gap-x-6 gap-y-2 p-4 sm:grid-cols-[5.5rem_minmax(0,1fr)] sm:p-6 ${isToday ? "bg-accent-soft" : ""}`}
    >
      {/* Enter in a text field submits the form through its first submit
          button. Without this one, that would be "Clear day". */}
      <button type="submit" hidden />
      <input type="hidden" name="day" value={dayKey} />
      <input type="hidden" name="recipeId" value={choice.recipeId} />
      {choice.newRecipe && <input type="hidden" name="newRecipe" value="1" />}
      <DayHeading weekdayLabel={weekdayLabel} dateLabel={dateLabel} isToday={isToday} />
      <div className="flex min-w-0 flex-col gap-3">
        {failed && (
          <p role="alert" className="text-sm font-medium text-accent-text">
            {t(i18n)`This day could not be saved. It shows what is saved now; please try again.`}
          </p>
        )}

        {/* Always on the page, so a screen reader is already listening when the
            first save of an empty day finishes. The visible copy is in the
            details below and hidden from assistive technology. */}
        <p id={`save-status-${dayKey}`} aria-live="polite" aria-atomic className="sr-only">
          {saveStatus}
        </p>

        <DinnerCombobox
          day={day}
          recipes={recipes}
          choice={choice}
          onChoose={(next) => {
            setChoice(next);
            setSaveRequest((count) => count + 1);
          }}
        />

        {undo && (
          <ClearedNotice
            weekday={weekdayLabel}
            onUndo={() => {
              undo();
              // The undo button goes away with the notice; the dinner field is where the day comes back.
              document.getElementById(`dinner-${dayKey}`)?.focus();
            }}
          />
        )}

        {choice.dinner !== "" && (
          <PlannedDetails
            day={day}
            meal={meal}
            recipeId={choice.recipeId}
            // "Day cleared" is shown by the notice that comes with the undo, not beside "Serves".
            status={undo ? "" : saveStatus}
            confirmed={saved && !pending}
            onSave={save}
          />
        )}
      </div>
    </form>
  );
}

/** What the server has planned for the day, in the shape the form submits. */
function plannedChoice(meal: DayCardMeal | null, recipes: DayCardProps["recipes"]): Choice {
  const recipe = meal?.recipeId ? recipes.find((r) => r.id === meal.recipeId) : undefined;
  return { dinner: recipe?.name ?? meal?.customTitle ?? "", recipeId: recipe?.id ?? "", newRecipe: false };
}

/**
 * The user's latest choice, until the server's value moves. `resync` drops the
 * choice for whatever the server has at the next render.
 */
function useChoice(meal: DayCardMeal | null, recipes: DayCardProps["recipes"]) {
  const planned = plannedChoice(meal, recipes);
  const plannedKey = `${planned.recipeId}\n${planned.dinner}`;
  const [choice, setChoice] = useState(planned);
  const [syncedWith, setSyncedWith] = useState<string | null>(plannedKey);
  if (plannedKey !== syncedWith) {
    // Server state moved (a save landed, the recipe was renamed or deleted) — follow it.
    setSyncedWith(plannedKey);
    setChoice(planned);
  }
  const resync = () => setSyncedWith(null);
  return [choice, setChoice, resync] as const;
}

/**
 * Save through a transition instead of the form's `action`.
 *
 * React 19 resets a form after its action resolves, which would put back the
 * old value in a field the user is typing in while a save is pending. Calling
 * the server action from `onSubmit` skips that reset. The `action` props stay
 * for browsers without JavaScript, where the form posts normally.
 */
function useAutoSave(onFailure: () => void) {
  const [pending, startTransition] = useTransition();
  const [failed, setFailed] = useState(false);
  // The number of the save whose "Saved" is showing, or 0. A new number for
  // every finished save restarts the timer below.
  const [saved, setSaved] = useState(0);
  // What the last "Clear day" removed, in the shape `setPlannedMeal` reads, so
  // that undoing it is saving it again. It stays until the next save.
  const [cleared, setCleared] = useState<FormData | null>(null);
  // Saves can overlap (a blur while an earlier save is in flight). Only the
  // latest one reports: an older one finishing late must not confirm, or
  // blame, a write the user has since replaced.
  const latest = useRef(0);

  // "Saved" is confirmation, not state: it goes away by itself.
  useEffect(() => {
    if (saved === 0) return;
    const timer = setTimeout(() => setSaved(0), SAVED_VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [saved]);

  const run = (action: typeof setPlannedMeal, data: FormData, clearing = false) => {
    const save = ++latest.current;
    setFailed(false);
    setSaved(0);
    setCleared(null);
    startTransition(async () => {
      try {
        await action(data);
        if (save !== latest.current) return;
        // Clearing has nothing left on the card to say "Saved" next to; it
        // offers the undo instead.
        if (clearing) setCleared(data);
        else setSaved(save);
      } catch {
        if (save !== latest.current) return;
        // Without this, a failed save would end on Next's error page.
        setFailed(true);
        onFailure();
      }
    });
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const clearing = submitter?.dataset.intent === "clear";
    run(clearing ? clearPlannedMeal : setPlannedMeal, new FormData(event.currentTarget), clearing);
  };
  const undo = cleared && (() => run(setPlannedMeal, cleared));
  return [pending, failed, saved > 0, undo, submit] as const;
}

/**
 * Bring the uncontrolled fields in line when the server value changes, e.g.
 * when another tab changed the day. The focused field is left alone, as the
 * user may be typing in it. Fields are updated in place rather than remounted
 * with a new `key`, since a remount would drop the keyboard focus. The dinner
 * field is controlled (see `useChoice`) and skipped here. Returns the ref for
 * the card's form.
 */
function useServerSync(meal: DayCardMeal | null) {
  const formRef = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    if (formRef.current) showSavedValues(formRef.current);
  }, [meal?.recipeId, meal?.customTitle, meal?.servings, meal?.notes]);
  return formRef;
}

/** Put the saved values back into the uncontrolled fields, except the focused one. */
function showSavedValues(form: HTMLFormElement) {
  for (const field of form.elements) {
    if (field === document.activeElement || field.getAttribute("role") === "combobox") continue;
    if (field instanceof HTMLInputElement && field.type !== "hidden") field.value = field.defaultValue;
  }
}

function DayHeading({
  weekdayLabel,
  dateLabel,
  isToday,
}: Pick<DayCardProps, "weekdayLabel" | "dateLabel" | "isToday">) {
  const { i18n } = useLingui();
  return (
    <div className="flex items-baseline justify-between gap-2 sm:flex-col sm:items-start sm:justify-start sm:gap-0">
      <h3 className="text-xs font-bold uppercase tracking-wider">
        {weekdayLabel}
        {/* A real space, so screen readers don't read "Mondaytoday". */}
        {isToday && (
          <>
            {" "}
            <span className="ml-1 text-xs font-bold text-accent-text">{t(i18n)`today`}</span>
          </>
        )}
      </h3>
      <span className="font-display text-xl font-semibold sm:text-2xl">{dateLabel}</span>
    </div>
  );
}

/** One entry in the dinner suggestions. */
type Suggestion =
  /** `tag` is the tag that matched what was typed, when the name did not. */
  | { kind: "recipe"; id: string; name: string; tag: string | null }
  | { kind: "once"; name: string }
  | { kind: "new"; name: string };

function suggestionLabel(suggestion: Suggestion, i18n: I18n): string {
  const { name } = suggestion;
  switch (suggestion.kind) {
    case "recipe":
      return name;
    case "once":
      return t(i18n)`Plan “${name}” for this day only`;
    case "new":
      return t(i18n)`Add “${name}” as a new recipe`;
  }
}

/**
 * The recipes matching what is typed, then (unless the text already names a
 * recipe) the two ways to plan a name that is not in the list yet.
 */
function suggestionsFor(text: string, planned: string, recipes: DayCardProps["recipes"]): Suggestion[] {
  const typed = text.trim();
  // Opening the field on the planned dinner lists every recipe, not just that one.
  const filter = text === planned ? "" : typed;
  const matches: Suggestion[] = recipes
    .map((recipe) => ({ recipe, tag: matchingTag(recipe, filter) }))
    .filter(({ recipe, tag }) => tag !== null || suggestsRecipe(recipe.name, filter))
    .map(({ recipe, tag }): Suggestion => ({ kind: "recipe", id: recipe.id, name: recipe.name, tag }));
  if (!typed || recipes.some((recipe) => isSameDinner(recipe.name, typed))) return matches;
  return [...matches, { kind: "once", name: typed }, { kind: "new", name: typed }];
}

function choiceFor(suggestion: Suggestion): Choice {
  return suggestion.kind === "recipe"
    ? { dinner: suggestion.name, recipeId: suggestion.id, newRecipe: false }
    : { dinner: suggestion.name, recipeId: "", newRecipe: suggestion.kind === "new" };
}

/**
 * A text field that suggests recipes as the user types (the WAI-ARIA combobox
 * pattern, via Downshift). Only picking a suggestion saves, so a half-typed
 * name never becomes the day's dinner; leaving the field otherwise puts the
 * planned dinner back, unless the text is exactly another recipe's name.
 */
function DinnerCombobox({
  day,
  recipes,
  choice,
  onChoose,
}: {
  day: Day;
  recipes: DayCardProps["recipes"];
  choice: Choice;
  onChoose: (choice: Choice) => void;
}) {
  const [text, setText] = useDinnerText(choice.dinner);
  const suggestions = suggestionsFor(text, choice.dinner, recipes);
  const { i18n } = useLingui();
  const { weekday } = day;

  const choose = (next: Choice) => {
    setText(next.dinner);
    if (next.dinner !== choice.dinner || next.recipeId !== choice.recipeId || next.newRecipe) onChoose(next);
  };

  /**
   * Settle typed text without a pick: the planned dinner's own name (in any
   * case) changes nothing, even when another recipe has the same name;
   * another recipe's exact name plans it. Returns false for anything else.
   */
  const settle = () => {
    if (isSameDinner(choice.dinner, text)) {
      setText(choice.dinner);
      return true;
    }
    const recipe = recipes.find((r) => isSameDinner(r.name, text));
    if (recipe) choose(choiceFor({ kind: "recipe", id: recipe.id, name: recipe.name, tag: null }));
    return Boolean(recipe);
  };

  const combobox = useCombobox<Suggestion>({
    items: suggestions,
    inputValue: text,
    // Nothing stays "selected": every pick is a fresh choice, saved at once.
    selectedItem: null,
    itemToString: (suggestion) => (suggestion ? suggestionLabel(suggestion, i18n) : ""),
    inputId: `dinner-${day.key}`,
    labelId: `dinner-label-${day.key}`,
    menuId: `dinner-options-${day.key}`,
    getA11yStatusMessage: ({ isOpen }) => {
      const count = suggestions.length;
      return isOpen ? t(i18n)`${plural(count, { one: "# suggestion", other: "# suggestions" })}` : "";
    },
    onSelectedItemChange: ({ selectedItem }) => {
      if (selectedItem) choose(choiceFor(selectedItem));
    },
    stateReducer: (state, { type, changes }) => {
      // Tabbing away from a highlighted suggestion does not pick it.
      const next =
        type === useCombobox.stateChangeTypes.InputBlur
          ? { ...changes, selectedItem: state.selectedItem, inputValue: state.inputValue }
          : changes;
      // An open menu with nothing in it would announce "expanded" over nothing.
      const empty = suggestionsFor(next.inputValue ?? text, choice.dinner, recipes).length === 0;
      return next.isOpen && empty ? { ...next, isOpen: false } : next;
    },
  });
  const { isOpen, highlightedIndex, getLabelProps, getInputProps, openMenu, closeMenu } = combobox;

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === "Enter" && highlightedIndex < 0) {
      // Never submit the form from here: Enter settles the text, or asks how to plan it.
      event.preventDefault();
      Object.assign(event.nativeEvent, { preventDownshiftDefault: true });
      if (settle()) closeMenu();
      else if (text.trim()) openMenu();
    } else if (event.key === "Escape" && !isOpen) {
      // Downshift would empty the field; put the planned dinner back instead.
      Object.assign(event.nativeEvent, { preventDownshiftDefault: true });
      setText(choice.dinner);
    }
  };

  return (
    <div className="relative">
      <label {...getLabelProps()} className="sr-only">
        {t(i18n)`Dinner for ${weekday}`}
      </label>
      <input
        // The text follows every keystroke here rather than in Downshift's
        // onInputValueChange, which runs a render too late: fast typing
        // would lose characters in between.
        {...getInputProps({
          onBlur: () => settle() || setText(choice.dinner),
          onKeyDown,
          onChange: (event) => setText(event.currentTarget.value),
        })}
        className="field"
        name="dinner"
        placeholder={t(i18n)`Pick a recipe or type a dinner…`}
        autoComplete="off"
      />
      <SuggestionList combobox={combobox} suggestions={suggestions} />
    </div>
  );
}

/**
 * The dinner field's text. It follows the chosen dinner's name when that
 * changes (a pick, or another dinner from the server), but not when only the
 * recipe behind the same name does, e.g. when a new recipe's save lands:
 * resetting then would throw away what the user has typed since the pick.
 */
function useDinnerText(dinner: string) {
  const [text, setText] = useState(dinner);
  const [shownDinner, setShownDinner] = useState(dinner);
  if (dinner !== shownDinner) {
    setShownDinner(dinner);
    setText(dinner);
  }
  return [text, setText] as const;
}

function SuggestionList({
  combobox: { isOpen, highlightedIndex, getMenuProps, getItemProps },
  suggestions,
}: {
  combobox: UseComboboxReturnValue<Suggestion>;
  suggestions: Suggestion[];
}) {
  const { i18n } = useLingui();
  return (
    <ul
      // A press on the list's padding or scrollbar must not blur the field,
      // which would settle the half-typed text. (Options do this themselves.)
      {...getMenuProps({ onMouseDown: (event) => event.preventDefault() })}
      hidden={!isOpen}
      className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-lg border border-border bg-surface py-1 text-sm shadow-lg"
    >
      {isOpen &&
        suggestions.map((suggestion, index) => (
          <li
            key={`${suggestion.kind}-${suggestion.kind === "recipe" ? suggestion.id : suggestion.name}`}
            {...getItemProps({ item: suggestion, index })}
            className={`cursor-pointer px-3 py-2 ${highlightedIndex === index ? "bg-accent-soft" : ""} ${
              suggestion.kind === "once" && index > 0 ? "border-t border-border" : ""
            }`}
          >
            {suggestionLabel(suggestion, i18n)}
            {suggestion.kind === "recipe" && suggestion.tag && (
              <span className="ml-2 text-xs text-muted">
                <span className="sr-only">{t(i18n)`tag`} </span>
                {suggestion.tag}
              </span>
            )}
          </li>
        ))}
    </ul>
  );
}

/**
 * Offered after "Clear day". The words are hidden from assistive technology,
 * since the card's status region already announces them. It stays until the
 * next save rather than timing out, so there is no clock to beat.
 */
function ClearedNotice({ weekday, onUndo }: { weekday: string; onUndo: () => void }) {
  const { i18n } = useLingui();
  const undoButton = useRef<HTMLButtonElement>(null);
  // "Clear day" had the focus and goes with the rest of the details, which drops the focus on the
  // page. Undo is what the user may want next. Focus that has moved on to a field or another card
  // in the meantime is left alone.
  useEffect(() => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || active === document.body || active.dataset.intent === "clear") undoButton.current?.focus();
  }, []);
  return (
    <div className="flex items-center gap-2 text-xs text-muted">
      <span aria-hidden>{t(i18n)`Day cleared`}</span>
      <button
        ref={undoButton}
        type="button"
        onClick={onUndo}
        className="btn-secondary px-2 py-1 text-xs"
        aria-label={t(i18n)`Undo clearing ${weekday}`}
      >
        {t(i18n)`Undo`}
      </button>
    </div>
  );
}

function PlannedDetails({
  day,
  meal,
  recipeId,
  status,
  confirmed,
  onSave,
}: {
  day: Day;
  meal: DayCardMeal | null;
  /** The recipe the dinner field shows; empty for a one-off dinner. */
  recipeId: string;
  /** "Saving…", "Saved" or nothing: the same text the card's status region reads out. */
  status: string;
  confirmed: boolean;
  onSave: () => void;
}) {
  const { i18n } = useLingui();
  const { weekday } = day;
  return (
    <>
      <div className="flex items-center gap-2">
        <label className="text-sm font-semibold" htmlFor={`servings-${day.key}`}>
          {t(i18n)`Serves`}
        </label>
        <input
          id={`servings-${day.key}`}
          className="field w-20"
          type="number"
          name="servings"
          min={1}
          max={MAX_SERVINGS}
          defaultValue={meal?.servings ?? 2}
          onBlur={onSave}
        />
        <span aria-hidden className="ml-auto text-xs text-muted">
          {status}
          {confirmed && " ✓"}
        </span>
      </div>

      <label className="sr-only" htmlFor={`notes-${day.key}`}>
        {t(i18n)`Note for ${weekday}`}
      </label>
      <input
        id={`notes-${day.key}`}
        className="field text-sm"
        name="notes"
        placeholder={t(i18n)`Note (optional)`}
        defaultValue={meal?.notes ?? ""}
        onBlur={onSave}
      />

      <div className="flex items-center justify-between gap-2">
        <button
          type="submit"
          formAction={clearPlannedMeal}
          data-intent="clear"
          className="btn-danger-quiet -ml-3 px-3 text-xs"
        >
          {t(i18n)`Clear day`}
        </button>
        {recipeId && (
          <Link
            href={`/recipes/${recipeId}`}
            className="text-sm font-semibold text-accent-text underline"
            aria-label={t(i18n)`View recipe for ${weekday}`}
          >
            {t(i18n)`View recipe`}
          </Link>
        )}
      </div>
    </>
  );
}
