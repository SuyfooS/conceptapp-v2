/**
 * Whether nothing holds the keyboard's focus any more: it fell to the page,
 * or it is on something no longer drawn (the chat list a phone just put
 * away, or a screen kept hidden for going back), where the browser hasn't
 * moved it yet, or in a sheet that is closing (what was chosen there took
 * the screen along). The chat screens then put it somewhere that makes
 * sense: Next leaves the focus where it was on a navigation.
 */
export function focusLost(): boolean {
  const active = document.activeElement;
  if (!active || active === document.body) return true;
  if (active.closest('[role="dialog"][data-state="closed"]')) return true;
  return active instanceof HTMLElement && active.getClientRects().length === 0;
}
