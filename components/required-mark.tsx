/**
 * The visible "this field is mandatory" pieces. Plain components with the text passed in,
 * so server pages (`getServerI18n`) and client forms (`useLingui`) can both use them.
 */

/**
 * The asterisk inside a label. Hidden from screen readers: the input's `required`
 * attribute already announces it. The title is for mouse users; the note above the
 * form covers touch and keyboard.
 */
export function RequiredMark({ title }: { title: string }) {
  return (
    <span aria-hidden="true" title={title} className="required-mark">
      *
    </span>
  );
}

/** The explanation of the asterisk, at the top of a form that has required fields. */
export function RequiredNote({ children }: { children: string }) {
  return (
    <p className="text-xs text-muted">
      <span aria-hidden="true" className="required-mark">
        *
      </span>{" "}
      {children}
    </p>
  );
}
