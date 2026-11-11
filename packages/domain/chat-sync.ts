import { z } from "zod";
import { isUuid } from "./activity";
import {
  CHAT_FILE_KINDS,
  CHAT_KINDS,
  CHAT_MESSAGE_KINDS,
  type ChatCursor,
  type ChatInboxRow,
  type ChatTitle,
  chatCursor,
  conversationTitle,
  parseChatCursor,
} from "./chat";
import {
  compareInstants,
  compareMessages,
  type ThreadMessage,
} from "./chat-thread";
import type { Role } from "./modules";

/**
 * Chat's live updates (C2 of the chat plan, §7): no Realtime and no Supabase
 * client in the browser (#80), but a small route, `/chat-sync`, that the chat
 * screens ask while they are on screen, more often while a conversation is
 * moving and not at all while hidden. What it is asked, what it answers (read
 * on the client with the schema below: a boundary), and when to ask again.
 */

/** The route the chat screens ask (app/chat-sync/route.ts). */
export const CHAT_SYNC_PATH = "/chat-sync";

/** A conversation that is moving: every 4 seconds for its first minute. */
export const SYNC_BUSY_MS = 4_000;
/** Then every 15 seconds, up to 3 minutes without a message. */
export const SYNC_QUIET_MS = 15_000;
/** Then once a minute; and never less often, whatever fails. */
export const SYNC_IDLE_MS = 60_000;
/** The list of chats alone, with no conversation open. */
export const SYNC_LIST_MS = 30_000;
const BUSY_FOR_MS = 60_000;
const QUIET_FOR_MS = 3 * 60_000;

/** Where the screen is, for `nextSyncDelay`. */
export type SyncState = {
  /** `document.visibilityState === "visible"`. */
  visible: boolean;
  screen: "conversation" | "list";
  /** Since the last message sent or received, or since opening. */
  idleMs: number;
  /** Syncs that failed in a row (the network, or an answer that wasn't one). */
  failures: number;
};

/**
 * When to ask `/chat-sync` again, in milliseconds, or null: not until the page
 * is visible again (a sync also runs at once then, after sending, and when the
 * service worker says something came). A conversation is asked every 4 seconds
 * while it moved in the last minute, every 15 up to 3 minutes, then every 60;
 * the list every 30. Each failure in a row doubles the wait, up to a minute.
 */
export function nextSyncDelay(s: SyncState): number | null {
  if (!s.visible) return null;
  const idle = Number.isFinite(s.idleMs) ? Math.max(s.idleMs, 0) : 0;
  const base =
    s.screen === "list"
      ? SYNC_LIST_MS
      : idle < BUSY_FOR_MS
        ? SYNC_BUSY_MS
        : idle < QUIET_FOR_MS
          ? SYNC_QUIET_MS
          : SYNC_IDLE_MS;
  const failures = Number.isFinite(s.failures)
    ? Math.min(Math.max(Math.floor(s.failures), 0), 8)
    : 0;
  return Math.min(base * 2 ** failures, SYNC_IDLE_MS);
}

/**
 * How far before its cursor the route looks again. A message's time is when
 * its sending began, and two sent into one conversation at once may be
 * written in the other order: one stamped a moment before the newest on
 * screen can arrive after the screen asked. It is never more than a moment,
 * the wait for the other's lock.
 */
export const SYNC_OVERLAP_MS = 10_000;

const STAMP =
  /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;

/**
 * Where the route's second look starts: `SYNC_OVERLAP_MS` before the cursor's
 * time, to the microsecond (an ISO instant in UTC), or null for a time that
 * isn't one. The screen and the route both count from it.
 */
export function syncWindowStart(at: string): string | null {
  const match = STAMP.exec(at);
  if (!match) return null;
  const [, whole = "", fraction = "", zone = ""] = match;
  const ms = Date.parse(`${whole}${zone}`);
  if (Number.isNaN(ms)) return null;
  const start = new Date(ms - SYNC_OVERLAP_MS).toISOString().slice(0, 19);
  return `${start}.${fraction.padEnd(6, "0")}Z`;
}

/** Whether a message is inside the second look: after its start, up to the cursor. */
function inWindow(
  message: ThreadMessage,
  start: string,
  cursor: ChatCursor,
): boolean {
  return (
    compareInstants(message.createdAt, start) > 0 &&
    compareMessages(message, { createdAt: cursor.at, id: cursor.id }) <= 0
  );
}

/**
 * How many of the messages on screen are inside the second look before the
 * cursor (`n=`): what the route compares with what it has there.
 */
export function heldInWindow(
  messages: readonly ThreadMessage[],
  cursor: ChatCursor,
): number {
  const start = syncWindowStart(cursor.at);
  if (!start) return 0;
  return messages.filter((m) => inWindow(m, start, cursor)).length;
}

/**
 * Whether what the route read from the second look's start brings the screen
 * anything: a message after its cursor, or more inside the look than the
 * screen holds there (one that arrived late). A message the screen holds and
 * the route no longer has (the demo's hourly clean-up) brings nothing.
 */
export function syncBrings(
  page: readonly ThreadMessage[],
  cursor: ChatCursor,
  held: number,
): boolean {
  const start = syncWindowStart(cursor.at);
  const after = { createdAt: cursor.at, id: cursor.id };
  let inside = 0;
  for (const message of page) {
    if (compareMessages(message, after) > 0) return true;
    if (start && inWindow(message, start, cursor)) inside += 1;
  }
  return inside > held;
}

/** What the screen asks: `/chat-sync?v=…&c=…&after=…&n=…`. */
export type ChatSyncQuery = {
  /** The list's version from the last answer (`inbox.version`); null at first. */
  version: string | null;
  /** The conversation on screen, if any. */
  conversation: string | null;
  /** The newest message the screen has of it (`open.cursor`), if any. */
  after: ChatCursor | null;
  /**
   * With `after`, how many messages the screen holds in the look before it
   * (`heldInWindow`): the route then looks again from `syncWindowStart`.
   * Null asks only for what came after the cursor.
   */
  held: number | null;
};

/** `public.chat_version` is an md5: a value that isn't one asks for the list. */
const VERSION = /^[0-9a-f]{32}$/;

/** The address the screen asks, with what it already has. */
export function chatSyncHref(query: ChatSyncQuery): string {
  const params = new URLSearchParams();
  if (query.version) params.set("v", query.version);
  if (query.conversation) params.set("c", query.conversation);
  if (query.conversation && query.after) {
    params.set("after", chatCursor(query.after));
    if (query.held !== null) params.set("n", String(query.held));
  }
  const search = params.toString();
  return search ? `${CHAT_SYNC_PATH}?${search}` : CHAT_SYNC_PATH;
}

/** At most this many held in the look: more than a page could ever bring. */
const HELD_MAX = 1_000;

/**
 * What the route was asked, or null when it isn't a question it answers (a
 * conversation that isn't an id, a cursor that isn't one, a cursor with no
 * conversation, or a count that isn't one or comes without a cursor). A
 * version that isn't one reads as none, so the list comes.
 */
export function readChatSyncQuery(
  params: URLSearchParams,
): ChatSyncQuery | null {
  const v = params.get("v");
  const c = params.get("c");
  const after = params.get("after");
  const n = params.get("n");
  if (c !== null && !isUuid(c)) return null;
  if (after !== null && (c === null || after === "")) return null;
  const cursor = after === null ? null : parseChatCursor(after);
  if (after !== null && cursor === null) return null;
  if (n !== null && (cursor === null || !/^\d{1,4}$/.test(n))) return null;
  const held = n === null ? null : Number(n);
  if (held !== null && held > HELD_MAX) return null;
  return {
    version: v !== null && VERSION.test(v) ? v : null,
    conversation: c === null ? null : c.toLowerCase(),
    after: cursor,
    held,
  };
}

/** Someone a chat's people are named by. */
export type ChatMember = {
  /** On the staff now (active, and not an accountant). */
  active: boolean;
  /** Null when nobody wrote one down. */
  name: string | null;
  /** An image src for their photo (`profilePhotoSrc`), or null. */
  photo: string | null;
  /** Their role in the business, to say who they are in a list of people. */
  role?: Role;
};

/**
 * Who and what the chat screens name, as the reader may read them: the
 * business's departments (removed ones too) and its memberships (active or
 * not), by id. It is `ChatLookups` with photos.
 */
export type ChatDirectory = {
  departments: ReadonlyMap<string, string>;
  members: ReadonlyMap<string, ChatMember>;
};

/** A row of the chat list, with what it is called and its picture. */
export type ChatListRow = ChatInboxRow & {
  title: ChatTitle;
  /** A private chat: the other person's photo src, or null. */
  photo: string | null;
};

/** The list's rows, named from the directory, in the order they came. */
export function chatListRows(
  rows: readonly ChatInboxRow[],
  directory: ChatDirectory,
): ChatListRow[] {
  return rows.map((row) => ({
    ...row,
    title: conversationTitle(row, directory),
    photo:
      row.kind === "direct" && row.otherPerson
        ? (directory.members.get(row.otherPerson.toLowerCase())?.photo ?? null)
        : null,
  }));
}

const uuid = z
  .string()
  .refine(isUuid)
  .transform((id) => id.toLowerCase());
const instant = z.string().refine((value) => !Number.isNaN(Date.parse(value)));
const count = z.int().min(0);

const chatPerson = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("member"), name: z.string().nullable() }),
  z.object({ kind: z.literal("former") }),
  z.object({ kind: z.literal("unknown") }),
]);

const chatTitle = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("team") }),
  z.object({ kind: z.literal("department"), name: z.string().nullable() }),
  z.object({ kind: z.literal("direct"), person: chatPerson }),
]);

/** A row of the list as the route sends it. */
export const chatListRow = z.object({
  conversation: uuid,
  kind: z.enum(CHAT_KINDS),
  department: uuid.nullable(),
  otherPerson: uuid.nullable(),
  lastAt: instant.nullable(),
  lastAuthor: uuid.nullable(),
  lastKind: z.enum(CHAT_MESSAGE_KINDS).nullable(),
  lastPreview: z.string().nullable(),
  lastFileKind: z.enum(CHAT_FILE_KINDS).nullable(),
  unread: count,
  muted: z.boolean(),
  closed: z.boolean(),
  pinnedWaiting: count,
  title: chatTitle,
  photo: z.string().nullable(),
});

/** A message as the route sends it (`ChatMessage` in @db/chat). */
export const chatSyncMessage = z.object({
  id: uuid,
  authorId: uuid.nullable(),
  kind: z.enum(CHAT_MESSAGE_KINDS),
  /** Null when it was removed, or it is only a file. */
  body: z.string().nullable(),
  fileKind: z.enum(CHAT_FILE_KINDS).nullable(),
  fileName: z.string().nullable(),
  fileSize: count.nullable(),
  fileGone: z.boolean(),
  pinned: z.boolean(),
  /** ISO instant. */
  createdAt: instant,
  removed: z.boolean(),
  removedBy: uuid.nullable(),
  /**
   * The browser's own id it was sent with, for its author alone (null for
   * anyone else's): how the screen knows its own message on its way.
   */
  draft: uuid.nullable(),
});
export type ChatSyncMessage = z.infer<typeof chatSyncMessage>;

/** Someone who wrote one of the messages sent. */
export const chatSyncPerson = z.object({
  id: uuid,
  name: z.string().nullable(),
  photo: z.string().nullable(),
});
export type ChatSyncPerson = z.infer<typeof chatSyncPerson>;

/**
 * What `/chat-sync` answers with a 200 (a 204 says nothing changed):
 * - `inbox`, when the list's version moved (or none was given): the version
 *   to ask with next, and every row, named;
 * - `open`, whenever a conversation the person reads was asked: what came
 *   after the cursor (oldest first, at most a page), whether that skipped some
 *   (`gap`: more than a page came, so these replace what is on screen and older
 *   ones load as at first), the people who wrote them, how far the other
 *   person of a private chat read it ("נקראה"; null in a group or before they
 *   read), and the cursor to ask with next.
 */
export const chatSyncAnswer = z.object({
  inbox: z
    .object({
      version: z.string(),
      rows: z.array(chatListRow),
    })
    .optional(),
  open: z
    .object({
      conversation: uuid,
      messages: z.array(chatSyncMessage),
      gap: z.boolean(),
      people: z.array(chatSyncPerson),
      seenUpTo: instant.nullable(),
      cursor: z.string().nullable(),
    })
    .optional(),
});
export type ChatSyncAnswer = z.infer<typeof chatSyncAnswer>;

/**
 * What the conversation screen sends to say something (the server action
 * `sendChatMessageAction`): the browser's own id for the message (`draft`, a
 * fresh `crypto.randomUUID()` per message, kept for its retries, so a retry
 * never sends it twice), what was typed (cleaned and checked on the server by
 * `checkMessage`), and where: a conversation, or someone's private chat,
 * opened on its first message.
 */
export const chatSendInput = z.union([
  z.strictObject({
    draft: uuid,
    words: z.string().max(8_000),
    conversation: uuid,
  }),
  z.strictObject({
    draft: uuid,
    words: z.string().max(8_000),
    toPerson: uuid,
  }),
]);
export type ChatSendInput = z.input<typeof chatSendInput>;

/**
 * How many chats the Chat tab counts: those with messages waiting for the
 * reader. An announcement waiting for "קראתי" joins them with C3, which
 * brings the button that settles it: until then nothing could clear it.
 */
export function waitingChats(
  rows: readonly Pick<ChatInboxRow, "unread">[],
): number {
  return rows.filter((row) => row.unread > 0).length;
}

/**
 * The cursor to ask with next: after the last of these messages, oldest
 * first as the database ordered them (its time keeps the microseconds a
 * `Date` would drop), or `fallback` when there are none.
 */
export function newestCursor(
  oldestFirst: readonly Pick<ChatSyncMessage, "id" | "createdAt">[],
  fallback: ChatCursor | null,
): string | null {
  const newest = oldestFirst.at(-1);
  if (newest) return chatCursor({ at: newest.createdAt, id: newest.id });
  return fallback ? chatCursor(fallback) : null;
}
