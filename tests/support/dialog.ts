/**
 * jsdom has no modal `<dialog>` yet: `showModal()` and `close()` are missing. This gives it the part the tests rely
 * on (open state and the `close` event); focus handling and Escape belong to the browser and are covered in the
 * end-to-end tests.
 */
export function polyfillDialog({ blurOnClose = true }: { blurOnClose?: boolean } = {}) {
  const proto = HTMLDialogElement.prototype;
  proto.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  proto.close = function close(this: HTMLDialogElement) {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    // Focus inside a dialog that closes goes to the page (a browser would first try the element that had it before).
    // Chromium does that only after the `close` event, so with `blurOnClose: false` the event sees it still inside.
    if (blurOnClose && this.contains(document.activeElement)) (document.activeElement as HTMLElement).blur();
    this.dispatchEvent(new Event("close"));
  };
}
