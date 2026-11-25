import { byNameThenId } from "@domain/team";

/**
 * "עוד לא קיבלו קישור" on the Team screen (inviting from a list, part 2),
 * with no React: which invites it lists, whom the focus goes to next, and
 * how many are left. Each person's link is made at the moment of sending
 * ("יצירת קישור", then WhatsApp or a copy; Orel, 25 November 2026), one
 * person at a time, and the app sends nothing.
 */

/**
 * What the viewer does with an invite that has no link yet: makes its link
 * (`link`); can't, since its role is an owner's to give (`ownerSends`) or
 * was removed since (`roleGone`); or only reads it (null: someone who sees
 * the team without editing it, or a business closed to invites).
 */
export type PendingSend = "link" | "ownerSends" | "roleGone" | null;

/** One invite with no link yet, as its row draws it in every shape. */
export type PendingRow = {
  id: string;
  /** The name it was sent with; null for none, listed last. */
  name: string | null;
  /** That name as the screen shows it ("בלי שם" for none). */
  shown: string;
  /** E.164, as the invite keeps it. */
  phone: string;
  /** Its role in the business's words, a named role by its name. */
  role: string;
  send: PendingSend;
  /** The viewer may delete it (`canCancelInvite`). */
  cancels: boolean;
};

/**
 * The rows to list: the invites the screen read with no link yet, and those
 * whose link was asked for here (`held`), which stay in place, by name, until
 * the page is loaded again, though the screen, read again, now has them among
 * the open invites. Only a link made here keeps a row: one made elsewhere
 * (another device, someone else) takes it off, so nobody presses "יצירת
 * קישור" over a link already sent. The screen's own copy of a row wins over
 * the one held.
 */
export function pendingShown(
  rows: readonly PendingRow[],
  held: ReadonlyMap<string, PendingRow>,
): PendingRow[] {
  const read = new Set(rows.map((row) => row.id));
  return [
    ...rows,
    ...[...held.values()].filter((row) => !read.has(row.id)),
  ].sort(byNameThenId);
}

/**
 * Who is next once someone's link went out (WhatsApp or a copy): the first
 * row after theirs whose link the viewer can make and hasn't yet (`waiting`),
 * else the first such row above it; null when there is none.
 */
export function nextToLink<Row extends { id: string }>(
  rows: readonly Row[],
  after: string,
  waiting: (row: Row) => boolean,
): Row | null {
  const at = rows.findIndex((row) => row.id === after);
  const order = at < 0 ? rows : [...rows.slice(at + 1), ...rows.slice(0, at)];
  return order.find((row) => row.id !== after && waiting(row)) ?? null;
}

/**
 * How many of the rows still on screen (not deleted, `gone`) have no link
 * made yet (`linked`): "# אנשים עוד לא קיבלו קישור". A row whose link the
 * viewer can't make is counted too: that person hasn't got one either.
 */
export function leftToLink(
  rows: readonly Pick<PendingRow, "id">[],
  linked: (id: string) => boolean,
  gone: ReadonlySet<string>,
): number {
  return rows.filter((row) => !gone.has(row.id) && !linked(row.id)).length;
}

/** The attribute each "יצירת קישור" carries: its invite's id. */
export const PENDING_CREATE = "data-pending-create";

/** The attribute on each shape's list of them, where the next one is found. */
export const PENDING_LIST = "data-pending-links";

/** A CSS string's own characters, so any id reads as itself in a selector. */
const cssString = (text: string) =>
  text.replace(/["\\]/g, "\\$&").replace(/\n/g, "\\a ");

/** This invite's "יצירת קישור", in the shape it is looked for in. */
export function pendingCreateTarget(inviteId: string): string {
  return `[${PENDING_CREATE}="${cssString(inviteId)}"]`;
}
