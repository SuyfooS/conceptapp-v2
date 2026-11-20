/*
 * What waiter mode keeps in the tab (P4, until the outbox of P7): one entry
 * of sessionStorage for each person in each business, under STORE_PREFIX,
 * holding their drafts and the rounds on their way. Nothing imported, so
 * signing out and locking a station (app/sign-out-form.tsx,
 * app/(app)/clock/station/lock-station.tsx) can clear it without loading the
 * mode. Every access is in a try: a private window or blocked storage keeps
 * the drafts in memory alone.
 */

export const STORE_PREFIX = "orders:";

/** The entry of one person in one business. */
export const storeKeyOf = (user: string, business: string) =>
  `${STORE_PREFIX}${user}:${business}`;

/** Cleared for the next person: nothing more is written in this page. */
let closed = false;

/**
 * What the tab kept under `key`, parsed, or null for nothing. Another
 * person's entries go as this one opens the mode.
 */
export function readKept(key: string, user: string): unknown {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const name = sessionStorage.key(i);
      if (
        name?.startsWith(STORE_PREFIX) &&
        !name.startsWith(`${STORE_PREFIX}${user}:`)
      ) {
        sessionStorage.removeItem(name);
      }
    }
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Keeps `json` under `key`, or removes the entry for null. */
export function keep(key: string, json: string | null): void {
  if (closed) return;
  try {
    if (json === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, json);
  } catch {
    // A private window or blocked storage: the drafts live in memory alone.
  }
}

/**
 * Every entry the mode kept in this tab, whoever's: gone, and nothing more
 * written in this page. Called as a session ends here (signing out, locking
 * the device into the clock station), just before the device opens a whole
 * new page: on a shared tablet the next person never finds the last one's
 * drafts, allergy notes or takeaway labels, even before opening the mode.
 */
export function clearOrdersStorage(): void {
  closed = true;
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const name = sessionStorage.key(i);
      if (name?.startsWith(STORE_PREFIX)) sessionStorage.removeItem(name);
    }
  } catch {
    // Blocked storage: nothing was kept.
  }
}
