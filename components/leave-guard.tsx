"use client";

import { t } from "@lingui/core/macro";
import { useLingui } from "@lingui/react";
import { useRouter } from "next/navigation";
import { type RefObject, useEffect, useRef, useState } from "react";
import { snapshotForm } from "@/lib/form-snapshot";

export type LeaveGuardProps = {
  /** The form whose changes are guarded. The guard goes inside it: "Save and leave" fills a hidden field of the form. */
  formRef: RefObject<HTMLFormElement | null>;
  /** The form starts with something that is not saved yet (a recipe read from a link), so it counts as changed at once. */
  startChanged?: boolean;
  /** A save is under way: its own redirect must not be asked about. */
  saving: boolean;
};

/** The parts of the Navigation API the guard uses (not in TypeScript's DOM types yet). */
type NavigateEvent = Event & {
  navigationType: "push" | "replace" | "reload" | "traverse";
  cancelable: boolean;
  destination: { key: string; url: string };
};
type NavigationApi = EventTarget & { traverseTo(key: string): unknown };

/** The browser's Navigation API, where there is one. */
const navigationApi = (): NavigationApi | null => {
  const navigation = (window as unknown as { navigation?: Partial<NavigationApi> }).navigation;
  return navigation && typeof navigation.addEventListener === "function" && typeof navigation.traverseTo === "function"
    ? (navigation as NavigationApi)
    : null;
};

/** Where a visitor was going: a path of this site to open with the router, or an entry of the history to go back or forward to. */
type Destination = { kind: "path"; href: string } | { kind: "history"; key: string; href: string };

/**
 * Asks before the visitor leaves a form with changes that are not saved.
 *
 * Three ways out are covered:
 * - The browser's own: reload, closing the tab, typing an address. `beforeunload` shows the browser's prompt, set only
 *   while the form is changed.
 * - The app's own links and buttons (menu, "Back to recipes", Cancel): Next.js has no hook for blocking a navigation, so a click on
 *   a link of this site is caught on the document before the router sees it.
 * - The browser's back and forward buttons: the Navigation API can cancel them; a browser without it lets them leave.
 *
 * The question is a modal dialog: **Stay** (the first button, so it has the focus; Escape also stays), **Leave without
 * saving** and **Save and leave**, which sends the form as it is (a form that is refused stays on the page, with what was
 * typed) and then opens the address that was asked for.
 */
export function LeaveGuard({ formRef, startChanged = false, saving }: LeaveGuardProps) {
  const { i18n } = useLingui();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const next = useRef<HTMLInputElement>(null);
  const baseline = useRef<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Set while the visitor chose to leave, so the navigation that follows is let through. It ends with the next edit: a
  // leave that did not happen (an entry that is gone, a navigation that was cancelled) must not switch the guard off for good.
  const bypass = useRef(false);
  // Set when the code closes the dialog itself, so its `close` event is not mistaken for Escape.
  const closedByCode = useRef(false);
  const [changed, setChanged] = useState(startChanged);
  const [asking, setAsking] = useState<Destination | null>(null);

  // The handlers outside React's render read this.
  const active = useRef(false);
  useEffect(() => {
    active.current = changed && !saving;
  }, [changed, saving]);

  // What the form holds when it opens is what "changed" is measured from; a refused save re-draws the fields with what was
  // typed, which is not a new beginning.
  useEffect(() => {
    const form = formRef.current;
    if (!form) return;
    baseline.current = snapshotForm(form);
    const onEdit = () => setChanged(startChanged || snapshotForm(form) !== baseline.current);
    const onTyped = () => {
      bypass.current = false;
      onEdit();
    };
    form.addEventListener("input", onTyped);
    form.addEventListener("change", onTyped);
    // Tags and ingredient rows are added and taken away without an input event: their fields come and go. The dialog's own
    // content (it is inside the form) comes and goes too and is no change.
    const observer = new MutationObserver((records) => {
      if (records.every((record) => dialog.current?.contains(record.target))) return;
      onEdit();
    });
    observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ["value", "checked"] });
    return () => {
      form.removeEventListener("input", onTyped);
      form.removeEventListener("change", onTyped);
      observer.disconnect();
    };
  }, [formRef, startChanged]);

  // The browser's own prompt.
  useEffect(() => {
    if (!changed || saving) return;
    const prompt = (event: BeforeUnloadEvent) => {
      if (bypass.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prompt);
    return () => window.removeEventListener("beforeunload", prompt);
  }, [changed, saving]);

  // A click on a link of this site, before Next.js's own handler.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!active.current || bypass.current || event.defaultPrevented) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const url = new URL(anchor.href, window.location.href);
      // Another site is a real unload, which the browser asks about; the same page and a jump within it are no way out.
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) return;
      event.preventDefault();
      event.stopPropagation();
      opener.current = anchor;
      setAsking({ kind: "path", href: `${url.pathname}${url.search}${url.hash}` });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The back and forward buttons, where the browser has the Navigation API.
  useEffect(() => {
    const navigation = navigationApi();
    if (!navigation) return;
    const onNavigate = (event: Event) => {
      const navigate = event as NavigateEvent;
      if (!active.current || bypass.current || navigate.navigationType !== "traverse" || !navigate.cancelable) return;
      navigate.preventDefault();
      opener.current = document.activeElement as HTMLElement | null;
      const url = new URL(navigate.destination.url);
      setAsking({ kind: "history", key: navigate.destination.key, href: `${url.pathname}${url.search}` });
    };
    navigation.addEventListener("navigate", onNavigate);
    return () => navigation.removeEventListener("navigate", onNavigate);
  }, []);

  // Opened once its content is there, so the focus goes to the first button.
  useEffect(() => {
    if (asking && dialog.current && !dialog.current.open) dialog.current.showModal();
  }, [asking]);

  // A refused save is over: the next one must not carry the address of this one.
  useEffect(() => {
    if (!saving && next.current) next.current.value = "";
  }, [saving]);

  const close = () => {
    setAsking(null);
    // Back to where the visitor was, as a native dialog does when it is closed (the link that was clicked).
    opener.current?.focus();
  };

  const closeByCode = () => {
    // Only a dialog that is open fires `close`; the flag would stay up for the next Escape otherwise.
    if (dialog.current?.open) {
      closedByCode.current = true;
      dialog.current.close();
    }
    setAsking(null);
  };

  const leave = () => {
    if (!asking) return;
    bypass.current = true;
    closeByCode();
    if (asking.kind === "history") {
      navigationApi()?.traverseTo(asking.key);
    } else {
      router.push(asking.href);
    }
  };

  const saveAndLeave = () => {
    const form = formRef.current;
    if (!asking || !form || !next.current) return;
    closeByCode();
    // A form that is not complete stays on the page and says what is missing, as the save button would.
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }
    // A back button or a history entry has no address of its own to send: it is the one before, a path of this site.
    next.current.value = asking.href;
    form.requestSubmit();
  };

  return (
    <>
      <input ref={next} type="hidden" name="next" defaultValue="" />
      <dialog
        ref={dialog}
        aria-labelledby="leave-guard-title"
        aria-describedby="leave-guard-text"
        // Escape closes a modal dialog: that means stay.
        onClose={() => {
          if (closedByCode.current) closedByCode.current = false;
          else if (asking) close();
        }}
        className="m-auto w-[min(40rem,calc(100vw-2rem))] rounded-2xl border border-border bg-surface p-6 text-foreground shadow-xl backdrop:bg-black/40"
      >
        {asking && (
          <div className="flex flex-col gap-4">
            <h2 id="leave-guard-title" className="section-title">
              {t(i18n)`Leave without saving?`}
            </h2>
            <p id="leave-guard-text" className="text-sm text-muted">
              {t(i18n)`You changed this recipe and have not saved it yet.`}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-secondary" onClick={() => dialog.current?.close()}>
                {t(i18n)`Stay`}
              </button>
              <button type="button" className="btn-danger-quiet" onClick={leave}>
                {t(i18n)`Leave without saving`}
              </button>
              <button type="button" className="btn-primary" onClick={saveAndLeave}>
                {t(i18n)`Save and leave`}
              </button>
            </div>
          </div>
        )}
      </dialog>
    </>
  );
}
