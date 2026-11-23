/**
 * Where the keyboard's focus goes once what held it went: a removed row's
 * "ביטול", a button that turned into a spinner, a sheet's choice that took
 * the screen along. No React, and nothing here asks what an element is: it
 * reads what any element answers (`isConnected`, `getClientRects`,
 * `matches`, `closest`), so the tests stand in for the page.
 */

/** The last resort: the page's own title. */
export const PAGE_TITLE = "main h1";

/** An element, or a selector read where the call says (a string). */
export type FocusCandidate = Element | null | undefined | string;

/** What is read of the page: what has the focus, its body, and its elements. */
export type DocLike = {
  activeElement: Element | null;
  body: Element | null;
  querySelectorAll(selectors: string): Iterable<Element>;
};

/** What an element answers here; any element of a page does. */
type Drawn = {
  isConnected: boolean;
  getClientRects(): { length: number };
  matches(selectors: string): boolean;
  closest(selectors: string): unknown;
  hasAttribute(name: string): boolean;
  setAttribute(name: string, value: string): void;
  focus(options?: FocusOptions): void;
};

/** What takes the focus by itself, with no tabindex of its own. */
const FOCUSABLE =
  "a[href], area[href], button, input, select, textarea, summary, iframe, [contenteditable]:not([contenteditable='false'])";

function isDrawn(element: unknown): element is Drawn {
  if (typeof element !== "object" || element === null) return false;
  const shape = element as Partial<Drawn>;
  return (
    typeof shape.getClientRects === "function" &&
    typeof shape.focus === "function" &&
    typeof shape.matches === "function"
  );
}

/** `matches`, false for a selector the browser doesn't know. */
function matching(element: Drawn, selectors: string): boolean {
  try {
    return element.matches(selectors);
  } catch {
    return false;
  }
}

/** The page the code runs in, none on the server. */
function thePage(): DocLike | undefined {
  return globalThis.document as DocLike | undefined;
}

/**
 * Still drawn and shown: connected, not the page's body, and with a box.
 * Nothing about aria-hidden: while a sheet closes everything outside it
 * still is, and its focus must still land there.
 */
export function onScreen(element: unknown): element is HTMLElement {
  return (
    isDrawn(element) &&
    (element as unknown) !== thePage()?.body &&
    element.isConnected &&
    element.getClientRects().length > 0
  );
}

/** On screen, and it can take the focus now: not disabled, not inert. */
export function canTakeFocus(element: unknown): element is HTMLElement {
  return (
    onScreen(element) &&
    !matching(element, ":disabled") &&
    !element.closest("[inert]")
  );
}

/**
 * Nothing holds the focus any more: none, the body, an element gone or not
 * drawn (a screen kept hidden in an <Activity>), one disabled while it waits,
 * one inside a sheet that is closing, or a sheet's own frame (where Radix
 * puts it when what had it inside went).
 */
export function focusLost(doc: DocLike | undefined = thePage()): boolean {
  if (!doc) return false;
  const active = doc.activeElement;
  if (!active || active === doc.body || !onScreen(active)) return true;
  if (matching(active, ":disabled")) return true;
  if (active.closest('[role="dialog"][data-state="closed"]')) return true;
  return matching(active, '[role="dialog"]');
}

/** The first candidate that can take the focus, selectors read in `root`. */
export function firstOnScreen(
  candidates: readonly FocusCandidate[],
  root: Pick<DocLike, "querySelectorAll"> | null | undefined = thePage(),
): HTMLElement | null {
  for (const candidate of candidates) {
    if (typeof candidate === "string") {
      for (const found of root?.querySelectorAll(candidate) ?? []) {
        if (canTakeFocus(found)) return found;
      }
    } else if (canTakeFocus(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Puts the focus there, a heading or a line given a tabindex first. */
function focusOn(target: HTMLElement, preventScroll: boolean) {
  if (!target.hasAttribute("tabindex") && !matching(target, FOCUSABLE)) {
    target.setAttribute("tabindex", "-1");
  }
  target.focus({ preventScroll });
}

/**
 * Focuses the first candidate that can take it, else the page's title
 * (`PAGE_TITLE`), unless `title: false`. Only when the focus is lost
 * (`onlyIfLost`, by default), so it never takes the focus from where the
 * person put it. A candidate is brought into view; the title, the last
 * resort, never moves the page. Never the body. What it focused, or null.
 */
export function focusFirst(
  candidates: readonly FocusCandidate[],
  {
    root,
    onlyIfLost = true,
    title = true,
    preventScroll = false,
    doc = thePage(),
  }: {
    /** Where selectors are read: the page by default. */
    root?: Pick<DocLike, "querySelectorAll"> | null;
    onlyIfLost?: boolean;
    title?: boolean;
    preventScroll?: boolean;
    doc?: DocLike;
  } = {},
): HTMLElement | null {
  if (!doc) return null;
  if (onlyIfLost && !focusLost(doc)) return null;
  const chosen = firstOnScreen(candidates, root ?? doc);
  const target = chosen ?? (title ? firstOnScreen([PAGE_TITLE], doc) : null);
  if (!target || target === doc.body) return null;
  focusOn(target, chosen ? preventScroll : true);
  return doc.activeElement === target ? target : null;
}

/** An element whose focus is watched. */
export type Watched = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
> & { contains(node: unknown): boolean };

/**
 * Whether the focus is, or was last, inside `element`, from where it is now
 * (an `autoFocus` inside took it while the element was drawn, before
 * anyone could listen). A move to another element outside it forgets it:
 * the person moved on. A fall to nowhere (what had it disabled or removed,
 * the window left) keeps it, so whoever asks still chooses where it goes.
 */
export function watchFocusIn(
  element: Watched,
  doc: Pick<DocLike, "activeElement"> | undefined = thePage(),
): {
  had(): boolean;
  stop(): void;
} {
  const now = doc?.activeElement;
  let had = Boolean(now) && element.contains(now);
  const focusIn = () => {
    had = true;
  };
  const focusOut = (event: Event) => {
    const to = (event as FocusEvent).relatedTarget;
    if (to) had = element.contains(to);
  };
  element.addEventListener("focusin", focusIn);
  element.addEventListener("focusout", focusOut);
  return {
    had: () => had,
    stop() {
      element.removeEventListener("focusin", focusIn);
      element.removeEventListener("focusout", focusOut);
    },
  };
}
