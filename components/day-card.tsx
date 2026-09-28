"use client";

import {
  type FormEvent,
  type RefObject,
  useLayoutEffect,
  useRef,
  useState,
  useTransition,
} from "react";
import { clearPlannedMeal, setPlannedMeal } from "@/app/actions/meals";
import { CUSTOM_MEAL as CUSTOM, MAX_SERVINGS } from "@/lib/planner";

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
  recipes: { id: string; name: string }[];
  meal: DayCardMeal | null;
};

/** The day a field belongs to, for ids and screen-reader labels. */
type Day = { key: string; weekday: string };

export function DayCard({ dayKey, weekdayLabel, dateLabel, isToday, recipes, meal }: DayCardProps) {
  // Set when the user picks "Something else…", so the title field that appears
  // takes focus then, and only then (never on page load).
  const focusTitle = useRef(false);
  const day: Day = { key: dayKey, weekday: weekdayLabel };

  // What the server currently believes is planned for this day.
  const plannedValue = meal?.recipeId ?? (meal?.customTitle ? CUSTOM : "");
  const [selection, setSelection] = useSelection(plannedValue);
  const formRef = useServerSync(plannedValue, meal);
  const [pending, submit] = useAutoSave();

  // Everything saves by itself, so there is no per-day save button to hunt for.
  // Text and number fields save on blur rather than on change, so a save never
  // lands in the middle of typing.
  const save = () => formRef.current?.requestSubmit();

  return (
    <form
      ref={formRef}
      action={setPlannedMeal}
      onSubmit={submit}
      className={`card flex flex-col gap-3 p-4 ${isToday ? "ring-2 ring-accent/40" : ""}`}
    >
      <input type="hidden" name="day" value={dayKey} />
      <DayHeading weekdayLabel={weekdayLabel} dateLabel={dateLabel} isToday={isToday} />

      <DinnerSelect
        day={day}
        recipes={recipes}
        plannedValue={plannedValue}
        onPick={(value) => {
          setSelection(value);
          // A custom title needs typing first; saving now would clear the day.
          if (value === CUSTOM) focusTitle.current = true;
          else save();
        }}
      />

      {selection === CUSTOM && (
        <CustomTitleField day={day} title={meal?.customTitle ?? ""} focusRef={focusTitle} onSave={save} />
      )}
      {selection !== "" && <PlannedDetails day={day} meal={meal} pending={pending} onSave={save} />}
    </form>
  );
}

/** The dinner the select shows: the user's pick, until the server value moves. */
function useSelection(plannedValue: string) {
  const [selection, setSelection] = useState(plannedValue);
  const [syncedWith, setSyncedWith] = useState(plannedValue);
  if (plannedValue !== syncedWith) {
    // Server state moved (a save landed, or the recipe was deleted) — follow it.
    setSyncedWith(plannedValue);
    setSelection(plannedValue);
  }
  return [selection, setSelection] as const;
}

/**
 * Save through a transition instead of the form's `action`.
 *
 * React 19 resets a form after its action resolves, which would put back the
 * old value in a field the user is typing in while a save is pending. Calling
 * the server action from `onSubmit` skips that reset. The `action` props stay
 * for browsers without JavaScript, where the form posts normally.
 */
function useAutoSave() {
  const [pending, startTransition] = useTransition();
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter;
    const action = submitter?.dataset.intent === "clear" ? clearPlannedMeal : setPlannedMeal;
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
  return [pending, submit] as const;
}

/**
 * Bring the uncontrolled fields in line when the server value changes, e.g.
 * when the planned recipe was deleted. The focused field is left alone, as the
 * user may be typing in it. Fields are updated in place rather than remounted
 * with a new `key`, since a remount would drop the keyboard focus. Returns the
 * ref for the card's form.
 */
function useServerSync(plannedValue: string, meal: DayCardMeal | null) {
  const formRef = useRef<HTMLFormElement>(null);
  useLayoutEffect(() => {
    const form = formRef.current;
    if (!form) return;
    for (const field of form.elements) {
      if (field === document.activeElement) continue;
      if (field instanceof HTMLSelectElement) field.value = plannedValue;
      else if (field instanceof HTMLInputElement && field.type !== "hidden") field.value = field.defaultValue;
    }
  }, [plannedValue, meal?.customTitle, meal?.servings, meal?.notes]);
  return formRef;
}

function DayHeading({
  weekdayLabel,
  dateLabel,
  isToday,
}: Pick<DayCardProps, "weekdayLabel" | "dateLabel" | "isToday">) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold">
        {weekdayLabel}
        {/* A real space, so screen readers don't read "Mondaytoday". */}
        {isToday && (
          <>
            {" "}
            <span className="ml-1 text-xs font-normal text-accent">today</span>
          </>
        )}
      </h3>
      <span className="text-xs text-muted">{dateLabel}</span>
    </div>
  );
}

function DinnerSelect({
  day,
  recipes,
  plannedValue,
  onPick,
}: {
  day: Day;
  recipes: DayCardProps["recipes"];
  plannedValue: string;
  onPick: (value: string) => void;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`recipe-${day.key}`}>
        Dinner for {day.weekday}
      </label>
      <select
        id={`recipe-${day.key}`}
        name="recipeId"
        className="field"
        defaultValue={plannedValue}
        onChange={(event) => onPick(event.target.value)}
      >
        <option value="">— nothing planned —</option>
        {recipes.map((recipe) => (
          <option key={recipe.id} value={recipe.id}>
            {recipe.name}
          </option>
        ))}
        <option value={CUSTOM}>Something else…</option>
      </select>
    </>
  );
}

function CustomTitleField({
  day,
  title,
  focusRef,
  onSave,
}: {
  day: Day;
  title: string;
  focusRef: RefObject<boolean>;
  onSave: () => void;
}) {
  return (
    <>
      <label className="sr-only" htmlFor={`title-${day.key}`}>
        Dinner title for {day.weekday}
      </label>
      <input
        ref={(input) => {
          if (input && focusRef.current) {
            focusRef.current = false;
            input.focus();
          }
        }}
        id={`title-${day.key}`}
        className="field"
        name="customTitle"
        placeholder="Leftovers, takeaway, eating out…"
        defaultValue={title}
        // A blank title would save "nothing planned" and clear the day, so
        // leaving the field empty saves nothing.
        onBlur={(event) => {
          if (event.currentTarget.value.trim()) onSave();
        }}
      />
    </>
  );
}

function PlannedDetails({
  day,
  meal,
  pending,
  onSave,
}: {
  day: Day;
  meal: DayCardMeal | null;
  pending: boolean;
  onSave: () => void;
}) {
  return (
    <>
      <div className="flex items-center gap-2">
        <label className="text-xs text-muted" htmlFor={`servings-${day.key}`}>
          Serves
        </label>
        <input
          id={`servings-${day.key}`}
          className="field w-16 px-2 py-1"
          type="number"
          name="servings"
          min={1}
          max={MAX_SERVINGS}
          defaultValue={meal?.servings ?? 2}
          onBlur={onSave}
        />
        <span aria-live="polite" className="ml-auto text-xs text-muted">
          {pending ? "Saving…" : ""}
        </span>
      </div>

      <label className="sr-only" htmlFor={`notes-${day.key}`}>
        Note for {day.weekday}
      </label>
      <input
        id={`notes-${day.key}`}
        className="field text-xs"
        name="notes"
        placeholder="Note (optional)"
        defaultValue={meal?.notes ?? ""}
        onBlur={onSave}
      />

      <button
        type="submit"
        formAction={clearPlannedMeal}
        data-intent="clear"
        className="btn-ghost self-start px-0 text-xs hover:bg-transparent"
      >
        Clear day
      </button>
    </>
  );
}
