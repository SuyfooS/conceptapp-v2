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

/** A sheet on its way out: Radix marks its dialog closed as it slides away. */
const CLOSING_SHEET = '[role="dialog"][data-state="closed"]';

/**
 * Inside a sheet that is closing (still drawn as it slides away, or about to
 * leave the page): what goes with it leaves the focus to the sheet, which
 * gives it back to what opened it (`returnFocus`) once it has gone.
 */
export function inClosingSheet(element: Pick<Element, "closest">): boolean {
  return Boolean(element.closest(CLOSING_SHEET));
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
  if (inClosingSheet(active)) return true;
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

/**
 * Marks a heading or a line given a tabindex here: it is no control, so
 * `app/globals.css` draws it no ring when it has the focus, as PageHeader's
 * title shows none (the browser's own would be drawn after a key).
 */
export const FOCUS_LANDING = "data-focus-landing";

/** Puts the focus there, a heading or a line given a tabindex first. */
function focusOn(target: HTMLElement, preventScroll: boolean) {
  if (!target.hasAttribute("tabindex") && !matching(target, FOCUSABLE)) {
    target.setAttribute("tabindex", "-1");
    target.setAttribute(FOCUS_LANDING, "");
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

/**
 * Enter held down presses nothing more, for a button's `onKeyDown`: with the
 * focus moved on to what took the pressed button's place (a break's start
 * to "יציאה מהמשמרת", a stop to the toast's "ביטול", a removed row to its
 * UndoRow's "ביטול", the circle to the camera's "הפסקת הסריקה", a press
 * that opens a sheet to its ✕), a key repeating would press that too. Only
 * a key's first press counts.
 */
export function ignoreHeldEnter(event: {
  key: string;
  repeat: boolean;
  preventDefault(): void;
}): void {
  if (event.key === "Enter" && event.repeat) event.preventDefault();
}

/**
 * Where the focus goes once what held it went (`useFocusWhenGone`): as
 * `focusFirst`, without moving the page. It lands where what went was, a
 * screen reader follows the focus anyway, and someone who scrolled on
 * meanwhile (a press elsewhere lets the hold go on, and a mouse's focus
 * never stops it) stays where they are.
 */
export function focusWhenGone(
  candidates: readonly FocusCandidate[],
  { doc = thePage() }: { doc?: DocLike } = {},
): HTMLElement | null {
  return focusFirst(candidates, { doc, preventScroll: true });
}

/** A page a landing listens to: its focus, and its keys and presses. */
export type LandingPage = DocLike &
  Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** Where the browser's going back and forward is heard, if anywhere. */
type Travels = Partial<
  Pick<EventTarget, "addEventListener" | "removeEventListener">
>;

/**
 * Calls `drawn` after each change to what `page` draws (an element added,
 * removed, shown or hidden); returns what stops it.
 */
export type WatchDrawing = (page: LandingPage, drawn: () => void) => () => void;

/** The browser's: a MutationObserver on the body, nothing without one. */
export const watchDrawing: WatchDrawing = (page, drawn) => {
  const Observer = globalThis.MutationObserver;
  if (typeof Observer !== "function" || !page.body) return () => {};
  const observer = new Observer(() => drawn());
  observer.observe(page.body, {
    childList: true,
    subtree: true,
    attributes: true,
    // Shown and hidden; never the tabindex a landing gives.
    attributeFilter: ["class", "style", "hidden", "inert"],
  });
  return () => observer.disconnect();
};

/**
 * The focus put on the page's title (`PAGE_TITLE`) once the screen that was
 * waited for arrives (a switch of business), and kept landing there while
 * that screen is still being drawn: a title not drawn yet takes it when it
 * comes, and one drawn in place of the title that had it takes it back.
 * Next draws a page again under its redirect boundary once a form's action
 * redirected, from its prefetched shell first (the skeleton's own title)
 * and then whole, so the title that took the focus can be gone a moment
 * later. Only while the focus is lost (`focusFirst`), without moving the
 * page; it ends for good once the focus is put anywhere else, a key is
 * pressed, the screen touched or the browser goes back or forward (another
 * screen, whose title is not this one), after `ms`, or on the stop it
 * returns.
 */
export function landOnTitle({
  ms,
  doc = thePage() as LandingPage | undefined,
  watch = watchDrawing,
  history = globalThis as Travels,
}: {
  /** The longest it keeps landing there. */
  ms: number;
  doc?: LandingPage;
  watch?: WatchDrawing;
  /** Where going back or forward is heard: the window. */
  history?: Travels;
}): () => void {
  if (!doc) return () => {};
  const page = doc;
  // The title it put the focus on: while that one is drawn, nothing moves.
  let on: HTMLElement | null = null;
  // While it moves the focus itself, so its own move ends nothing.
  let moving = false;
  let over = false;

  const land = () => {
    if (over) return;
    if (onScreen(on)) {
      // Still drawn: the focus is there, or something put it elsewhere.
      if (page.activeElement !== on) stop();
      return;
    }
    moving = true;
    try {
      const landed = focusFirst([], { doc: page });
      if (landed) on = landed;
    } finally {
      moving = false;
    }
  };
  const moved = () => {
    if (!moving && page.activeElement !== on) stop();
  };
  const stopWatching = watch(page, land);
  const timer = setTimeout(stop, ms);
  page.addEventListener("focusin", moved, true);
  page.addEventListener("keydown", stop, true);
  page.addEventListener("pointerdown", stop, true);
  history.addEventListener?.("popstate", stop);

  function stop() {
    if (over) return;
    over = true;
    clearTimeout(timer);
    stopWatching();
    page.removeEventListener("focusin", moved, true);
    page.removeEventListener("keydown", stop, true);
    page.removeEventListener("pointerdown", stop, true);
    history.removeEventListener?.("popstate", stop);
  }

  land();
  return stop;
}

/**
 * Whether `now` has just arrived, noting it in `seen` when it has: for an
 * effect that moves the focus to what arrived (a refusal, the card that
 * says it was written). A screen left in a hidden <Activity> and shown
 * again runs its effects again with the same value, which arrived long
 * ago: the focus stays where it is then. Null is nothing there, and keeps
 * what was seen. Compared by identity, so each new one (a refusal again)
 * arrives.
 */
export function arrived<T>(
  seen: { current: T | null },
  now: T | null,
): boolean {
  if (now === null || now === seen.current) return false;
  seen.current = now;
  return true;
}

/** An element whose focus is watched. */
export type Watched = Pick<
  EventTarget,
  "addEventListener" | "removeEventListener"
> & { contains(node: unknown): boolean };

/** The page a watch reads the focus from, and hears it move on, if it can. */
export type FocusPage = Pick<DocLike, "activeElement"> &
  Partial<
    Pick<DocLike, "body"> &
      Pick<EventTarget, "addEventListener" | "removeEventListener">
  >;

/**
 * Whether the focus is, or was last, inside `element`, from where it is now
 * (an `autoFocus` inside took it while the element was drawn, before
 * anyone could listen). A move to another element outside it forgets it:
 * the person moved on. A fall to nowhere (what had it disabled or removed,
 * the window left) keeps it, so whoever asks still chooses where it goes,
 * until the focus is put on an element outside it (heard on `doc`): a
 * button disabled while it waits, then a press on another, is a move on.
 */
export function watchFocusIn(
  element: Watched,
  doc: FocusPage | undefined = thePage(),
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
  // Anywhere on the page, before the element hears its own: the focus has
  // moved by then (`activeElement`), and the body taking it is no move.
  const elsewhere = () => {
    const to = doc?.activeElement;
    if (to && to !== doc?.body && !element.contains(to)) had = false;
  };
  element.addEventListener("focusin", focusIn);
  element.addEventListener("focusout", focusOut);
  // The options as an object: Node's EventTarget, which the tests stand in
  // with, removes a capturing listener only by one.
  const capture = { capture: true };
  doc?.addEventListener?.("focusin", elsewhere, capture);
  return {
    had: () => had,
    stop() {
      element.removeEventListener("focusin", focusIn);
      element.removeEventListener("focusout", focusOut);
      doc?.removeEventListener?.("focusin", elsewhere, capture);
    },
  };
}
