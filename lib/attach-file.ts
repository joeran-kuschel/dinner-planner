/**
 * Put a file in a file field as if the visitor had chosen it, and tell the form (its `change` handlers) so. Browsers
 * allow this with a `DataTransfer`; the file travels with the form like any chosen one. Client only.
 */
export function attachFile(input: HTMLInputElement, file: File): void {
  const transfer = new DataTransfer();
  transfer.items.add(file);
  input.files = transfer.files;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}
