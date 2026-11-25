/** What takes the keyboard's focus: a heading with `tabIndex={-1}`. */
export type Focusable = { focus(options?: FocusOptions): void };

/** Where the focus is: the page's document, or a stand-in for it. */
export type FocusedPage = {
  readonly activeElement: { readonly isConnected: boolean } | null;
  readonly body: unknown;
};

/**
 * Puts the keyboard's focus on `target` when nothing holds it any more: it
 * fell to the page because what held it went with the part of the screen it
 * was in (a hiring file that locked under "נעילת התיק", the code's boxes
 * once the file opened), or it is on something no longer on the page. Focus
 * the person put somewhere else stays there. True when it moved.
 */
export function focusIfLost(
  target: Focusable | null | undefined,
  page: FocusedPage,
): boolean {
  if (!target) return false;
  const active = page.activeElement;
  const lost = !active || active === page.body || !active.isConnected;
  if (!lost) return false;
  target.focus();
  return true;
}

/** A heading of the file, or what the focus came from: where it sits on the page. */
export type Placed = { compareDocumentPosition(other: Placed): number };

/** `Node.DOCUMENT_POSITION_FOLLOWING`: the other one comes after it. */
const FOLLOWING = 4;

/**
 * Where the focus lands in the file as "להשאיר פתוח" goes with it, the file
 * kept open: the title of the part of the file the focus came to it from
 * (the last of `headings`, those on screen in page order, at or before
 * `from`), else the file's first. Never the control it came from, which
 * the person was only passing: an Enter meant for "להשאיר פתוח" (pressed
 * again, held down, or right after the Tab that kept the file open) would
 * press it, and "נעילת התיק" locks the file on the whole device, "הצגה"
 * shows a number and writes it in the history. A title does nothing on
 * Enter. `from` null (from nowhere, or from outside the file): the first.
 */
export function titleAbove<T extends Placed>(
  from: Placed | null,
  headings: Iterable<T>,
): T | null {
  let first: T | null = null;
  let above: T | null = null;
  for (const heading of headings) {
    first ??= heading;
    if (
      from !== null &&
      (heading === from ||
        (heading.compareDocumentPosition(from) & FOLLOWING) !== 0)
    ) {
      above = heading;
    }
  }
  return above ?? first;
}
