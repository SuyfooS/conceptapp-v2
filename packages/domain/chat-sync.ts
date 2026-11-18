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
import { isChatFileSrc } from "./chat-files";
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

/**
 * What the screen asks:
 * `/chat-sync?v=…&c=…&after=…&n=…&m=…&from=…&x=…&cv=…&r=1`.
 */
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
  /**
   * With a conversation, what the screen holds of every message it has (its
   * newest, the cursor, too) and of its pinned announcements (`chatMarks`):
   * when the conversation changed since `changed`, or `recheck` asks, the
   * route reads them again and sends what it has otherwise. Null asks for
   * none of it.
   */
  marks?: string | null;
  /**
   * With `marks`, the oldest message the screen holds (`heldMarks`): the
   * route compares from there to the cursor. Null: it holds none.
   */
  from?: ChatCursor | null;
  /**
   * With `marks`, the newest of the messages the screen shows as removed, at
   * most `REMOVED_SENT_MAX` (`heldMarks`): the route reads them again, so one
   * put back comes back with its words wherever it is on screen.
   */
  removed?: string[];
  /**
   * With `marks`, the conversation's own stamp from the last answer
   * (`open.changed`, `public.chat_stamp` for its reader): it moves with every
   * message sent, removed, put back or pinned there, every file no longer
   * kept, and with a confirmation
   * only for those who see who confirmed (the announcement's author, the
   * moderators, the person themselves), and the route compares the marks only
   * when it moved. Null: compare.
   */
  changed?: string | null;
  /**
   * Compare the marks whatever the stamp: the conversation just came on
   * screen (one kept hidden for going back may have missed what the list's
   * syncs moved past), or the reader's own change just settled, so nothing a
   * sync brought meanwhile and the screen left waiting stays behind.
   */
  recheck?: boolean;
};

/**
 * How many of the messages it shows as removed the screen sends with its
 * marks (`x=`), newest first: a message is put back only within minutes of
 * its removal, so the newest of them are the ones that may come back.
 */
export const REMOVED_SENT_MAX = 20;

/**
 * What the screen sends of what it holds besides its marks (C3): where its
 * messages start (the oldest it holds, `from=`), and the newest of those it
 * shows as removed, at most `REMOVED_SENT_MAX` (`x=`). The marks themselves
 * (`chatMarks`) cover every message it holds, its newest too.
 */
export function heldMarks(
  held: readonly (ThreadMessage & { removed: boolean })[],
): { from: ChatCursor | null; removed: string[] } {
  const first = held[0];
  const removed: string[] = [];
  for (let i = held.length - 1; i >= 0; i -= 1) {
    const message = held[i];
    if (!message?.removed) continue;
    removed.push(message.id.toLowerCase());
    if (removed.length === REMOVED_SENT_MAX) break;
  }
  return {
    from: first ? { at: first.createdAt, id: first.id } : null,
    removed,
  };
}

/**
 * The route's messages that lie where the screen's do, from its oldest
 * (`from`) to its newest (`through`, the cursor), both included, as the
 * screen's marks count them.
 */
export function withinHeld<T extends ThreadMessage>(
  messages: readonly T[],
  from: ChatCursor | null,
  through: ChatCursor | null,
): T[] {
  if (!from || !through) return [];
  const start = { createdAt: from.at, id: from.id };
  const end = { createdAt: through.at, id: through.id };
  return messages.filter(
    (m) => compareMessages(m, start) >= 0 && compareMessages(m, end) <= 0,
  );
}

/** 32-bit FNV-1a, as eight hex digits: the same on the screen and the route. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

/**
 * What may change of messages already on screen, in one short value: which
 * of them were removed and by whom, which lost their file to its days or the
 * business's space (C4: "הקובץ כבר לא נשמר"), and the conversation's pinned
 * announcements with whether the reader confirmed each and, for its author
 * and management, how many did. A message sent, or read, changes none of it,
 * so a busy conversation never sends its older messages again; a removal, a
 * message put back, a file no longer kept, a pin or an unpin, or a "קראתי"
 * does. The order of either list doesn't matter, and only removed messages
 * and those whose file went count: the route passes those it has where the
 * screen's are (`getMarkedMessages`), the screen every one it holds.
 */
export function chatMarks(
  messages: readonly (Pick<ChatSyncMessage, "id" | "removed" | "removedBy"> & {
    fileGone?: boolean;
  })[],
  pinned: readonly {
    message: Pick<ChatSyncMessage, "id">;
    confirmed: boolean;
    readers: PinnedAnnouncement["readers"];
  }[],
): string {
  const removed = messages
    .filter((m) => m.removed)
    .map((m) => `${m.id.toLowerCase()}:${m.removedBy?.toLowerCase() ?? ""}`)
    .sort();
  const pins = pinned
    .map(
      (p) =>
        `${p.message.id.toLowerCase()}:${p.confirmed ? 1 : 0}:${
          p.readers ? `${p.readers.count}/${p.readers.total}` : "-"
        }`,
    )
    .sort();
  // A removed message says so whatever its file: it counts once, above.
  const filesGone = messages
    .filter((m) => !m.removed && m.fileGone === true)
    .map((m) => m.id.toLowerCase())
    .sort();
  // Before any file goes, the same value as before C4's.
  const files = filesGone.length > 0 ? `|${filesGone.join(",")}` : "";
  return fnv1a(`${removed.join(",")}|${pins.join(",")}${files}`);
}

const MARKS = /^[0-9a-f]{8}$/;

/** `public.chat_version` is an md5: a value that isn't one asks for the list. */
const VERSION = /^[0-9a-f]{32}$/;

/** A conversation's stamp as the database writes it: a timestamptz. */
function isStamp(value: string): boolean {
  return (
    value.length <= 40 && STAMP.test(value) && !Number.isNaN(Date.parse(value))
  );
}

/** The address the screen asks, with what it already has. */
export function chatSyncHref(query: ChatSyncQuery): string {
  const params = new URLSearchParams();
  if (query.version) params.set("v", query.version);
  if (query.conversation) params.set("c", query.conversation);
  if (query.conversation && query.after) {
    params.set("after", chatCursor(query.after));
    if (query.held !== null) params.set("n", String(query.held));
  }
  if (query.conversation && query.marks) {
    params.set("m", query.marks);
    if (query.from) params.set("from", chatCursor(query.from));
    const removed = (query.removed ?? []).slice(0, REMOVED_SENT_MAX);
    if (removed.length > 0) params.set("x", removed.join(","));
    if (query.changed) params.set("cv", query.changed);
    if (query.recheck) params.set("r", "1");
  }
  const search = params.toString();
  return search ? `${CHAT_SYNC_PATH}?${search}` : CHAT_SYNC_PATH;
}

/** At most this many held in the look: more than a page could ever bring. */
const HELD_MAX = 1_000;

/**
 * What the route was asked, or null when it isn't a question it answers (a
 * conversation that isn't an id, a cursor that isn't one, a cursor with no
 * conversation, a count that isn't one or comes without a cursor, marks that
 * aren't marks or come without a conversation, `from`, `x`, `cv` and `r`
 * without marks, removed messages that aren't ids or are more than
 * `REMOVED_SENT_MAX`, or a stamp that isn't one). A version that isn't one
 * reads as none, so the list comes.
 */
export function readChatSyncQuery(
  params: URLSearchParams,
): ChatSyncQuery | null {
  const v = params.get("v");
  const c = params.get("c");
  const after = params.get("after");
  const n = params.get("n");
  const m = params.get("m");
  const from = params.get("from");
  const x = params.get("x");
  // A "+" in a link reads back as a space when it isn't escaped.
  const cv = params.get("cv")?.replace(/ /g, "+") ?? null;
  const r = params.get("r");
  if (c !== null && !isUuid(c)) return null;
  if (after !== null && (c === null || after === "")) return null;
  const cursor = after === null ? null : parseChatCursor(after);
  if (after !== null && cursor === null) return null;
  if (n !== null && (cursor === null || !/^\d{1,4}$/.test(n))) return null;
  const held = n === null ? null : Number(n);
  if (held !== null && held > HELD_MAX) return null;
  if (m !== null && (c === null || !MARKS.test(m))) return null;
  if (
    (from !== null || x !== null || cv !== null || r !== null) &&
    m === null
  ) {
    return null;
  }
  const start = from === null ? null : parseChatCursor(from);
  if (from !== null && start === null) return null;
  const removed = x === null ? [] : x.split(",");
  if (removed.length > REMOVED_SENT_MAX || !removed.every(isUuid)) return null;
  if (cv !== null && !isStamp(cv)) return null;
  if (r !== null && r !== "1") return null;
  return {
    version: v !== null && VERSION.test(v) ? v : null,
    conversation: c === null ? null : c.toLowerCase(),
    after: cursor,
    held,
    marks: m,
    from: start,
    removed: [...new Set(removed.map((id) => id.toLowerCase()))],
    changed: cv,
    recheck: r === "1",
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
  /** Left out by an answer from before C5. */
  lastFileName: z.string().nullable().catch(null),
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
  /**
   * Where the screen shows its picture and its thumbnail (C4, `chatFileSrc`
   * in @domain/chat-files): the app's own route, which checks the reader
   * again. Null with no file, once it is removed, or no longer kept; left out
   * by an answer from before C4.
   */
  fileSrc: z.string().refine(isChatFileSrc).nullable().optional(),
  thumbSrc: z.string().refine(isChatFileSrc).nullable().optional(),
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
 * A pinned announcement as its reader sees it (C3): the message, whether they
 * pressed "קראתי" on it, and, for its author and management only, how many of
 * the group's people did of how many (`public.announcement_readers`; null for
 * anyone else, who never learns who confirmed).
 */
export const chatPinned = z.object({
  message: chatSyncMessage,
  confirmed: z.boolean(),
  readers: z.object({ count: count, total: count }).nullable(),
});
export type PinnedAnnouncement = z.infer<typeof chatPinned>;

/**
 * What `/chat-sync` answers with a 200 (a 204 says nothing changed):
 * - `inbox`, when the list's version moved (or none was given): the version
 *   to ask with next, and every row, named;
 * - `open`, whenever a conversation the person reads was asked: what came
 *   after the cursor (oldest first, at most a page), whether that skipped some
 *   (`gap`: more than a page came, so these replace what is on screen and older
 *   ones load as at first), the people who wrote them, how far the other
 *   person of a private chat read it ("נקראה"; null in a group or before they
 *   read), the cursor to ask with next, and the conversation's own stamp
 *   (`changed`, to send back as `cv`); and, when the marks the screen sent
 *   are no longer the route's, `recent` (the messages where the screen's are
 *   that are removed now or whose file is no longer kept, and those it showed
 *   as removed that were put back, as they are now) and `pinned` (every
 *   pinned announcement, newest first, in place of what the screen has).
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
      changed: z.string().refine(isStamp).nullable().optional(),
      recent: z.array(chatSyncMessage).optional(),
      pinned: z.array(chatPinned).optional(),
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
 * opened on its first message. In a group, management may send it as an
 * announcement (`announce`, C3), which the database refuses anyone else and
 * any private chat.
 */
export const chatSendInput = z.union([
  z.strictObject({
    draft: uuid,
    words: z.string().max(8_000),
    conversation: uuid,
    announce: z.boolean().optional(),
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
 * reader, or an announcement waiting for their "קראתי" (C3, whose button
 * settles it, in the conversation and on Today).
 */
export function waitingChats(
  rows: readonly Pick<ChatInboxRow, "unread" | "pinnedWaiting">[],
): number {
  return rows.filter((row) => row.unread > 0 || row.pinnedWaiting > 0).length;
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
