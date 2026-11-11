import type { ChatKind, ChatMessageKind } from "./chat";
import type { PinnedAnnouncement } from "./chat-sync";
import { compareInstants, compareMessages } from "./chat-thread";

/**
 * Announcements and a message's actions on screen (C3 of the chat plan),
 * free of React and the database: which pinned announcement a conversation's
 * card shows, who confirmed one and who not yet, the order of
 * /chat/announcements, and what the reader may do with a message. The
 * database decides all of it again (remove_chat_message, pin_announcement,
 * confirm_announcement in supabase/migrations/20261111000200_chat.sql); this
 * only keeps the screens from offering what it would refuse.
 */

/** How long the screens offer to undo a removal ("ביטול"); the database keeps it 10 minutes. */
export const UNDO_SHOWN_MS = 10_000;

const same = (a: string | null, b: string) =>
  a !== null && a.toLowerCase() === b.toLowerCase();

/** Whether a pinned announcement waits for the reader's "קראתי": someone else's, not confirmed. */
export function waitsFor(
  pinned: Pick<PinnedAnnouncement, "message" | "confirmed">,
  readerId: string,
): boolean {
  return !pinned.confirmed && !same(pinned.message.authorId, readerId);
}

/**
 * The pinned announcement a conversation's card shows, of those pinned
 * there: the newest waiting for the reader's "קראתי", else the newest; and
 * how many others are pinned, which the card names and /chat/announcements
 * lists.
 */
export function shownPinned<
  T extends Pick<PinnedAnnouncement, "message" | "confirmed">,
>(pinned: readonly T[], readerId: string): { shown: T | null; more: number } {
  const newestFirst = [...pinned].sort(
    (a, b) =>
      -compareMessages(
        { id: a.message.id, createdAt: a.message.createdAt },
        { id: b.message.id, createdAt: b.message.createdAt },
      ),
  );
  const shown =
    newestFirst.find((p) => waitsFor(p, readerId)) ?? newestFirst[0] ?? null;
  return { shown, more: shown ? newestFirst.length - 1 : 0 };
}

/**
 * The pinned announcements a sync (or the server's drawing) brings, taken
 * one by one: the server's for every announcement, except those the reader
 * is changing on screen, or changed since that answer was asked for
 * (`keep`), which stay as the screen has them, there or not. Newest first.
 */
export function mergePinned<
  T extends { message: { id: string; createdAt: string } },
>(
  local: readonly T[],
  server: readonly T[],
  keep: (id: string) => boolean,
): T[] {
  const kept = local.filter((p) => keep(p.message.id));
  const taken = server.filter((p) => !keep(p.message.id));
  return [...taken, ...kept].sort(
    (a, b) =>
      -compareMessages(
        { id: a.message.id, createdAt: a.message.createdAt },
        { id: b.message.id, createdAt: b.message.createdAt },
      ),
  );
}

/** An announcement as its reader stands with it. */
export type AnnouncementState =
  /** Theirs: they see who confirmed. */
  | "own"
  /** Someone else's, waiting for their "קראתי". */
  | "waiting"
  /** Someone else's, which they confirmed ("אישרת שקראת"). */
  | "confirmed";

export function announcementState(
  announcement: { authorId: string | null; confirmed: boolean },
  readerId: string,
): AnnouncementState {
  if (same(announcement.authorId, readerId)) return "own";
  return announcement.confirmed ? "confirmed" : "waiting";
}

/** Someone of the group, and when they confirmed (null: not yet). */
export type AnnouncementReader = { person: string; ackedAt: string | null };

/**
 * Who of the group confirmed an announcement, in the order they did, and
 * who not yet, in the order given (by name, from the screen).
 */
export function splitReaders<T extends AnnouncementReader>(
  readers: readonly T[],
): { confirmed: T[]; waiting: T[] } {
  const confirmed = readers
    .filter((r) => r.ackedAt !== null)
    .sort((a, b) => compareInstants(a.ackedAt ?? "", b.ackedAt ?? ""));
  return { confirmed, waiting: readers.filter((r) => r.ackedAt === null) };
}

/** "{count} מתוך {total} אישרו שקראו". */
export function readersCount(readers: readonly AnnouncementReader[]): {
  count: number;
  total: number;
} {
  return {
    count: readers.filter((r) => r.ackedAt !== null).length,
    total: readers.length,
  };
}

/**
 * /chat/announcements in its order: pinned ones first, then each by time,
 * newest first.
 */
export function sortAnnouncements<
  T extends { id: string; createdAt: string; pinned: boolean },
>(announcements: readonly T[]): T[] {
  return [...announcements].sort((a, b) => {
    const pins = Number(b.pinned) - Number(a.pinned);
    if (pins) return pins;
    return -compareMessages(a, b);
  });
}

/** What the reader may do with a message on screen. */
export type MessageAction =
  /** Its text, to the clipboard. */
  | "copy"
  /** One's own, in any chat: "מחיקת ההודעה". */
  | "delete"
  /** Management, someone else's, in a group only: "הסרת ההודעה". */
  | "remove"
  /** An announcement unpinned, pinned again by its author or management. */
  | "pin"
  /** An announcement pinned, unpinned by its author or management. */
  | "unpin";

/**
 * A message's actions for its reader, in the order the sheet lists them. A
 * removed message has none; a moderator (chat.moderate) removes someone
 * else's only in a group, never in a private chat, whose two people alone
 * remove their own; an announcement is pinned again only where people still
 * write (not in a removed department's group).
 */
export function messageActions(
  message: {
    authorId: string | null;
    kind: ChatMessageKind;
    body: string | null;
    pinned: boolean;
    removed: boolean;
  },
  where: {
    readerId: string;
    chat: ChatKind;
    /** Holds chat.moderate. */
    moderates: boolean;
    /** A removed department's group. */
    closed: boolean;
  },
): MessageAction[] {
  if (message.removed) return [];
  const own = same(message.authorId, where.readerId);
  const group = where.chat !== "direct";
  const actions: MessageAction[] = [];
  if (message.body !== null) actions.push("copy");
  if (message.kind === "announcement" && group && (own || where.moderates)) {
    if (message.pinned) actions.push("unpin");
    else if (!where.closed) actions.push("pin");
  }
  if (own) actions.push("delete");
  else if (group && where.moderates) actions.push("remove");
  return actions;
}

/** Announcements waiting for the reader's "קראתי" across their chats (the list's rows). */
export function announcementsWaiting(
  rows: readonly { pinnedWaiting: number }[],
): number {
  return rows.reduce((sum, row) => sum + row.pinnedWaiting, 0);
}
