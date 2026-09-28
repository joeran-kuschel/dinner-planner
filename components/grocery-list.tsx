"use client";

import { useRef } from "react";
import { useFormStatus } from "react-dom";
import { removeGroceryExtra, toggleGroceryLine } from "@/app/actions/groceries";
import { formatGroceryQuantity, type GroceryLine } from "@/lib/grocery";

export type GroceryListProps = {
  weekStart: string;
  lines: (GroceryLine & { entryId: string | null })[];
};

export function GroceryList({ weekStart, lines }: GroceryListProps) {
  if (lines.length === 0) {
    return (
      <p className="card p-6 text-sm text-muted">
        Nothing to buy yet. Plan some dinners and their ingredients land here.
      </p>
    );
  }

  const outstanding = lines.filter((line) => !line.checked);
  const done = lines.filter((line) => line.checked);

  return (
    <div className="flex flex-col gap-6">
      <section className="card divide-y divide-border">
        {outstanding.length === 0 ? (
          <p className="p-4 text-sm text-muted">Everything ticked off. 🎉</p>
        ) : (
          outstanding.map((line) => (
            <GroceryRow key={line.key} weekStart={weekStart} line={line} />
          ))
        )}
      </section>

      {done.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            In the basket ({done.length})
          </h2>
          {/* Ticked lines are marked by strikethrough and muted text, not by
              fading the card: opacity would push the text below AA contrast. */}
          <div className="card divide-y divide-border">
            {done.map((line) => (
              <GroceryRow key={line.key} weekStart={weekStart} line={line} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function GroceryRow({
  weekStart,
  line,
}: {
  weekStart: string;
  line: GroceryLine & { entryId: string | null };
}) {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <div className="flex items-center gap-3 p-3">
      <form ref={formRef} action={toggleGroceryLine} className="flex flex-1 items-center gap-3">
        <input type="hidden" name="weekStart" value={weekStart} />
        <input type="hidden" name="key" value={line.key} />
        <input type="hidden" name="label" value={line.label} />
        {/* The checkbox is uncontrolled; the hidden field carries the value the
            action should persist, which is the opposite of the current state. */}
        <input type="hidden" name="checked" value={String(!line.checked)} />

        <input
          type="checkbox"
          checked={line.checked}
          onChange={() => formRef.current?.requestSubmit()}
          className="size-4 accent-[var(--accent)]"
          aria-label={`Tick off ${line.label}`}
        />

        <span className="flex-1">
          <span className={`text-sm ${line.checked ? "text-muted line-through" : ""}`}>{line.label}</span>
          {line.sources.length > 0 && (
            <span className="ml-2 text-xs text-muted">{line.sources.join(", ")}</span>
          )}
          {line.manual && line.sources.length === 0 && (
            <span className="ml-2 text-xs text-muted">added by hand</span>
          )}
        </span>

        <span className="shrink-0 text-sm text-muted">
          {formatGroceryQuantity(line)}
        </span>
      </form>

      {/* Only hand-added lines can be deleted; derived ones come back from the plan. */}
      {line.manual && line.entryId && (
        <form action={removeGroceryExtra}>
          <input type="hidden" name="id" value={line.entryId} />
          <RemoveButton label={line.label} />
        </form>
      )}
    </div>
  );
}

function RemoveButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-ghost px-2 py-1 text-xs"
      aria-label={`Remove ${label}`}
    >
      ✕
    </button>
  );
}
