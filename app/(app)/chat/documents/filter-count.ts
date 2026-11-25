/**
 * The desktop documents table's way of saying what its filters left, and
 * where its focus goes: the row the preview was opened from, the first
 * filter after "ניקוי הסינון". No React, so the tests stand in for the page.
 */
import { type DocLike, focusFirst, focusLost } from "@ui/focus-after";

/** A choice of a row, as the desktop's table marks its button. */
export const CHOSEN_ROW = 'th button[aria-current="true"]';

/**
 * The preview closed: its button goes with it, so the row it was opened
 * from takes the focus, wherever the focus was. Brought into view only when
 * a key closed it (`fromKeys`); a mouse's page stays where it was scrolled
 * to, the preview being sticky beside a table that may be long. What it
 * focused, or null.
 */
export function focusChosenRow(
  root: Pick<DocLike, "querySelectorAll"> | null,
  { fromKeys, doc }: { fromKeys: boolean; doc?: DocLike },
): HTMLElement | null {
  return focusFirst([CHOSEN_ROW], {
    root,
    onlyIfLost: false,
    preventScroll: !fromKeys,
    doc,
  });
}

/** A filter's menu button, the first of them the person's. */
export const FILTER_MENU = 'button[aria-haspopup="menu"]';

/** The longest the count waits for the focus to come back before it is said. */
export const COUNT_WAITS_MS = 600;

/**
 * Whether the documents the filters ask for are the ones on screen: the
 * person filter reads that person's documents through the address
 * (`?person=`), and their newest come with the next drawing. Ids are
 * compared in lower case, as the server keeps them.
 */
export function filtersRead(
  filters: { person: string | null },
  read: string | null,
): boolean {
  return (
    (filters.person?.toLowerCase() ?? null) === (read?.toLowerCase() ?? null)
  );
}

/** The page a wait for the focus listens to. */
export type FocusLanding = DocLike &
  Pick<EventTarget, "addEventListener" | "removeEventListener">;

/** A menu, its items and itself: what has the focus there is about to leave. */
const MENU = '[role="menu"]';

/**
 * The focus is where it stays: not lost, and not in a menu. A menu's choice
 * is made, and drawn, while the menu still has the focus; the menu then goes
 * and gives its button the focus back a moment later.
 */
function focusLanded(doc: DocLike): boolean {
  return !focusLost(doc) && !doc.activeElement?.closest(MENU);
}

/**
 * Runs `say` once the keyboard's focus has landed (`focusLanded`): at once
 * when it has, else as it lands (a menu's choice gives its button the focus
 * back a moment after the menu went), and after `ms` at the latest. Words
 * said as the focus moves are cut off by what it reads. Returns what stops
 * it.
 */
export function whenFocused(
  say: () => void,
  {
    doc = globalThis.document as FocusLanding | undefined,
    ms = COUNT_WAITS_MS,
  }: { doc?: FocusLanding; ms?: number } = {},
): () => void {
  if (!doc || focusLanded(doc)) {
    say();
    return () => {};
  }
  const page = doc;
  let over = false;
  const landed = () => {
    if (over) return;
    stop();
    say();
  };
  // Each move of the focus, until one lands: to another of a menu's items
  // is none yet.
  const moved = () => {
    if (focusLanded(page)) landed();
  };
  // The options as an object: Node's EventTarget, which the tests stand in
  // with, removes a capturing listener only by one.
  const capture = { capture: true };
  const timer = setTimeout(landed, ms);
  page.addEventListener("focusin", moved, capture);
  function stop() {
    over = true;
    clearTimeout(timer);
    page.removeEventListener("focusin", moved, capture);
  }
  return stop;
}
