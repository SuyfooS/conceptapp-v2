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
