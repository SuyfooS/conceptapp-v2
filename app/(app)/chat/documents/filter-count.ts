/**
 * The desktop documents table's way of saying what its filters left, and
 * where its focus goes: the row the preview was opened from, the first
 * filter after "ניקוי הסינון". No React, so the tests stand in for the page.
 */
import { type DocLike, focusLost } from "@ui/focus-after";

/** A choice of a row, as the desktop's table marks its button. */
export const CHOSEN_ROW = 'th button[aria-current="true"]';

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

/**
 * Runs `say` once the keyboard's focus is somewhere again: at once when it
 * is, else as it lands (a menu's choice gives its button the focus back a
 * moment after the menu went), and after `ms` at the latest. Words said as
 * the focus moves are cut off by what it reads. Returns what stops it.
 */
export function whenFocused(
  say: () => void,
  {
    doc = globalThis.document as FocusLanding | undefined,
    ms = COUNT_WAITS_MS,
  }: { doc?: FocusLanding; ms?: number } = {},
): () => void {
  if (!doc || !focusLost(doc)) {
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
  // The options as an object: Node's EventTarget, which the tests stand in
  // with, removes a capturing listener only by one.
  const capture = { capture: true };
  const timer = setTimeout(landed, ms);
  page.addEventListener("focusin", landed, capture);
  function stop() {
    over = true;
    clearTimeout(timer);
    page.removeEventListener("focusin", landed, capture);
  }
  return stop;
}
