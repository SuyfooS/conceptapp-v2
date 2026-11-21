import type { OutboxRow, OutboxWhere } from "@domain/orders-outbox";
import { z } from "zod";

/*
 * The notice of rounds taken off the phone (waiter mode P7), signed out or
 * no longer a member: kept in sessionStorage as they go, and shown where
 * the page lands until "הבנתי". The refresh that follows keeps the app's
 * frame and what it drew, so keeping or letting go of the notice is said on
 * the window too (`LOST_EVENT`), and whatever draws it reads it again: the
 * app's banner as much as the door and the no-business screen, which a
 * refresh mounts afresh. Nothing here imports React, for the tests.
 */

/** sessionStorage, outside P4's `orders:` entries: one notice, said once. */
export const LOST_KEY = "orders-lost";

/** Said on the window whenever the notice is kept or let go. */
export const LOST_EVENT = "orders-lost";

const lostSchema = z.object({
  count: z.int().min(1).max(999),
  places: z.array(z.string().max(200)).max(50),
  why: z.enum(["signedOut", "notMember"]),
});

export type LostNotice = z.infer<typeof lostSchema>;

/** What draws the notice reads it again. */
function changed(): void {
  try {
    window.dispatchEvent(new Event(LOST_EVENT));
  } catch {
    // No window (the server): nothing draws it here.
  }
}

/** The notice kept, as read back; null without one, or one that doesn't read. */
export function lostNoticeOf(raw: string | null): LostNotice | null {
  if (raw === null) return null;
  try {
    const kept = lostSchema.safeParse(JSON.parse(raw));
    return kept.success ? kept.data : null;
  } catch {
    return null;
  }
}

/**
 * The notice as kept, unread: the same text while nothing changed it, as
 * `useSyncExternalStore` wants. Blocked storage: none.
 */
export function keptLostNotice(): string | null {
  try {
    return sessionStorage.getItem(LOST_KEY);
  } catch {
    return null;
  }
}

/** Hears the notice kept or let go in this page; returns the withdrawal. */
export function onLostNotice(listener: () => void): () => void {
  window.addEventListener(LOST_EVENT, listener);
  return () => window.removeEventListener(LOST_EVENT, listener);
}

/**
 * Keeps the notice for where the page lands next: how many rounds were
 * taken off the phone and where, already in words, and why, added to one
 * not yet seen. Nothing of what they held, and nobody's name.
 */
export function keepLostNotice(
  rows: readonly Pick<OutboxRow, "where">[],
  why: LostNotice["why"],
  placeTitle: (where: OutboxWhere) => string,
): void {
  if (rows.length === 0) return;
  try {
    const was = lostNoticeOf(sessionStorage.getItem(LOST_KEY));
    const places = [
      ...new Set([
        ...(was?.places ?? []),
        ...rows.map((row) => placeTitle(row.where)),
      ]),
    ].slice(0, 50);
    const notice: LostNotice = {
      count: Math.min((was?.count ?? 0) + rows.length, 999),
      places,
      why,
    };
    sessionStorage.setItem(LOST_KEY, JSON.stringify(notice));
  } catch {
    // Blocked storage: the rounds are gone all the same.
    return;
  }
  changed();
}

/** "הבנתי": the notice goes, wherever it is drawn. */
export function forgetLostNotice(): void {
  try {
    sessionStorage.removeItem(LOST_KEY);
  } catch {
    // Blocked storage: nothing was kept.
  }
  changed();
}
