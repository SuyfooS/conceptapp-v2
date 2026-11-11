import type { ChatMessageKind } from "./chat";

/**
 * A conversation on screen (chat C2), free of React: the messages the screen
 * holds, put together from its first page, what `/chat-sync` brings after it
 * and the older pages scrolled up to, in the database's order; and which of
 * one's own messages carries "נקראה". The database decides what may be read;
 * this only puts in order what it gave.
 */

/** What ordering and merging need of a message. */
export type ThreadMessage = {
  id: string;
  /** ISO instant, as the database wrote it (to the microsecond). */
  createdAt: string;
};

const INSTANT = /^(.+?)(?:\.(\d+))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * An instant as text that sorts as the instant does: whole seconds, then the
 * fraction to the microsecond, which a `Date` would cut to the millisecond
 * (two messages in one millisecond keep their order). Null for what isn't
 * an instant.
 */
function instantKey(iso: string): string | null {
  const match = INSTANT.exec(iso);
  if (!match) return null;
  const [, whole = "", fraction = "", zone = ""] = match;
  const ms = Date.parse(`${whole}${zone}`);
  if (Number.isNaN(ms)) return null;
  // Whole seconds in milliseconds, moved past zero (the earliest a Date
  // holds), in as many digits as the latest needs.
  const padded = String(ms + 8_640_000_000_000_000).padStart(17, "0");
  return `${padded}${fraction.padEnd(6, "0").slice(0, 6)}`;
}

/**
 * Two instants compared: negative when `a` is earlier, positive when later, 0
 * for the same. What isn't an instant comes first.
 */
export function compareInstants(a: string, b: string): number {
  const ka = instantKey(a);
  const kb = instantKey(b);
  if (ka === kb) return 0;
  if (ka === null) return -1;
  if (kb === null) return 1;
  return ka < kb ? -1 : 1;
}

/** The database's order: by time, then by id. */
export function compareMessages(a: ThreadMessage, b: ThreadMessage): number {
  const byTime = compareInstants(a.createdAt, b.createdAt);
  if (byTime) return byTime;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** What of a message may change once it is on screen. */
export type ChangeableMessage = {
  body: string | null;
  removed: boolean;
  removedBy: string | null;
  fileGone: boolean;
  pinned: boolean;
  draft: string | null;
};

/**
 * Whether a message came again different from the one on screen: removed or
 * put back, its file gone, pinned or not, or now known as one's own. The
 * sync's look again before its cursor brings what is on screen too, and only
 * a change is drawn again.
 */
export function changedMessage(
  had: ChangeableMessage,
  now: ChangeableMessage,
): boolean {
  return (
    had.body !== now.body ||
    had.removed !== now.removed ||
    had.removedBy !== now.removedBy ||
    had.fileGone !== now.fileGone ||
    had.pinned !== now.pinned ||
    had.draft !== now.draft
  );
}

/**
 * The messages on screen with more of them, oldest first and each once: one
 * that came again (removed since, say) takes the place of what was there.
 */
export function mergeMessages<T extends ThreadMessage>(
  current: readonly T[],
  incoming: readonly T[],
): T[] {
  if (incoming.length === 0) return [...current];
  const byId = new Map<string, T>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort(compareMessages);
}

/**
 * The one of the reader's own messages that carries "נקראה": the newest of
 * theirs the other person read up to (`seenUpTo`, from `public.chat_seen`),
 * in a private chat. Null when there is none, or nothing was read.
 */
export function seenMessageId(
  messages: readonly (ThreadMessage & {
    authorId: string | null;
    removed: boolean;
  })[],
  readerId: string,
  seenUpTo: string | null,
): string | null {
  if (!seenUpTo) return null;
  const reader = readerId.toLowerCase();
  let seen: string | null = null;
  for (const message of messages) {
    if (compareInstants(message.createdAt, seenUpTo) > 0) break;
    if (message.authorId?.toLowerCase() === reader && !message.removed) {
      seen = message.id;
    }
  }
  return seen;
}

/**
 * The newest message someone else wrote, the furthest a read mark needs to
 * reach: what the reader hasn't read is only ever someone else's.
 */
export function newestFromOthers<
  T extends ThreadMessage & { authorId: string | null },
>(messages: readonly T[], readerId: string): T | null {
  const reader = readerId.toLowerCase();
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message && message.authorId?.toLowerCase() !== reader) return message;
  }
  return null;
}

/** A message the screen shows while it is on its way, or after it failed. */
export type OutgoingMessage = {
  /** The browser's own id for it, sent again on a retry. */
  draft: string;
  body: string;
  /** When it was written, on this device's clock. */
  at: string;
  state: "sending" | "failed" | "sent";
  /** Its id once the server has it. */
  message: string | null;
};

/**
 * The server's messages the screen holds, as one's own messages on their way
 * are told by: their ids, and the drafts of the reader's own among them (the
 * server gives a message's draft to its author alone).
 */
export type ShownMessages = {
  ids: ReadonlySet<string>;
  drafts: ReadonlySet<string>;
};

export function shownMessages(
  messages: readonly { id: string; draft: string | null }[],
): ShownMessages {
  const ids = new Set<string>();
  const drafts = new Set<string>();
  for (const message of messages) {
    ids.add(message.id);
    if (message.draft) drafts.add(message.draft.toLowerCase());
  }
  return { ids, drafts };
}

/**
 * What is still on its way: a message the server has, once the screen holds
 * it, shows as itself and no longer as one being sent. It is known by its
 * draft, so one whose answer never came back (a phone's network that lost it
 * after the database wrote the message), or came after the sync brought it,
 * goes too, and no "not sent" stays beside what was sent; else by the id the
 * answer gave.
 */
export function stillOutgoing(
  outgoing: readonly OutgoingMessage[],
  shown: ShownMessages,
): OutgoingMessage[] {
  return outgoing.filter(
    (m) =>
      !shown.drafts.has(m.draft.toLowerCase()) &&
      !(m.message && shown.ids.has(m.message)),
  );
}

/** The key of a message on its way, the same as its server copy's. */
export function draftKey(draft: string): string {
  return `draft:${draft.toLowerCase()}`;
}

/**
 * A message's key on screen: one's own by its draft, which it had while on
 * its way too, so it stays the same bubble when the server's copy takes the
 * place of the one being sent; anyone else's by its id.
 */
export function bubbleKey(message: {
  id: string;
  draft: string | null;
}): string {
  return message.draft ? draftKey(message.draft) : message.id;
}

/** Where a message sits in a run of one author's messages (MessageBubble). */
export type RunPlace = "single" | "first" | "middle" | "last";

export function runPlace(index: number, length: number): RunPlace {
  if (length <= 1) return "single";
  if (index === 0) return "first";
  return index === length - 1 ? "last" : "middle";
}

/** What `groupMessages` in @domain/chat reads of a message on its way. */
export function outgoingAsMessage(
  outgoing: OutgoingMessage,
  readerId: string,
): {
  id: string;
  authorId: string;
  createdAt: string;
  kind: ChatMessageKind;
} {
  return {
    id: draftKey(outgoing.draft),
    authorId: readerId,
    createdAt: outgoing.at,
    kind: "text",
  };
}
