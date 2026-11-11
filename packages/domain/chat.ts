import { z } from "zod";
import { isUuid } from "./activity";
import { dateIn } from "./availability";

/**
 * Chat (C1 of the chat plan), free of React and the database: the kinds of
 * conversation and message, the rules the database keeps (each said here and
 * there in one place), how a typed message is cleaned before it is sent, how
 * a message reads in a list and on screen, and the order of the list. The
 * database decides who reads what (supabase/migrations/20261111000200_chat.sql);
 * nothing here widens it.
 */

/** The whole team's group, a department's group, a private chat between two. */
export const CHAT_KINDS = ["team", "department", "direct"] as const;
export type ChatKind = (typeof CHAT_KINDS)[number];

/** A message, or an announcement that asks for "קראתי" (`chat.announce`). */
export const CHAT_MESSAGE_KINDS = ["text", "announcement"] as const;
export type ChatMessageKind = (typeof CHAT_MESSAGE_KINDS)[number];

/** A file a message carries (C4, C5). */
export const CHAT_FILE_KINDS = ["image", "pdf"] as const;
export type ChatFileKind = (typeof CHAT_FILE_KINDS)[number];

/** The longest message, in characters as Postgres counts them (code points). */
export const CHAT_MESSAGE_MAX = 2000;

/** How long whoever removed a message may put it back (restore_chat_message). */
export const CHAT_UNDO_MINUTES = 10;

/** How many messages one person sends in a minute, at most (send_chat_message). */
export const CHAT_MESSAGES_PER_MINUTE = 30;

/** What the list shows of a message, at most, before it is cut at a word. */
export const CHAT_PREVIEW_LENGTH = 80;

/**
 * Orel's defaults (§17 of the chat plan), each one function in the database
 * too (`private.chat_history_from_joining`, `private.chat_read_marks`,
 * `private.chat_demo_keeps`, `private.chat_demo_per_hour`;
 * modules/chat/settings.db.test.ts keeps the two in step). Changing one is a
 * migration that replaces its function, and this.
 */
export const CHAT_RULES = {
  /** Question 3: someone new reads a group from when they joined it. */
  historyFromJoining: true,
  /** Question 4: the two people of a private chat see that the other read it. */
  readMarks: true,
  /** Question 11: a demo visitor's messages are kept this many minutes. */
  demoKeepMinutes: 60,
  /** Question 11: a demo business takes this many visitors' messages an hour. */
  demoMessagesPerHour: 100,
} as const;

/**
 * Who writes in the whole team's group (the chat setting `teamGroupWho`):
 * everyone, or management only. Orel's default (question 5): everyone.
 */
export const TEAM_GROUP_WHO = ["everyone", "announcers"] as const;
export type TeamGroupWho = (typeof TEAM_GROUP_WHO)[number];

/** Bidi embeddings, overrides and isolates: they show text in another order than it is. */
const BIDI_CONTROL = /[\u202A-\u202E\u2066-\u2069]/g;
/** A line break as any device types it. */
const LINE_BREAK = /\r\n?|[\u2028\u2029]/g;
/** A control character (C0, DEL, C1). */
const CONTROL = /\p{Cc}/gu;

/**
 * A message as it is sent: NFC, line breaks as "\n", tabs as spaces, no other
 * control character and no bidi override (which could make a message read in
 * another order than it says), at most one empty line in a row, trimmed.
 * Everything else stays as typed: Hebrew punctuation, digits of any script,
 * emoji, and the direction marks people use on purpose.
 */
export function cleanMessage(text: string): string {
  return text
    .normalize("NFC")
    .replace(LINE_BREAK, "\n")
    .replace(BIDI_CONTROL, "")
    .replace(CONTROL, (char) =>
      char === "\n" ? char : char === "\t" ? " " : "",
    )
    .replace(/\n[ \n]*\n/g, (gap) =>
      gap.split("\n").length > 2 ? "\n\n" : gap,
    )
    .trim();
}

/** How many characters a text is, as Postgres counts them. */
export function charCount(text: string): number {
  return [...text].length;
}

/** A message ready to send, or why it isn't. */
export type CheckedMessage =
  | { ok: true; body: string }
  | { ok: false; reason: "empty" | "tooLong" };

/** Cleans a message and checks it as `send_chat_message` will. */
export function checkMessage(text: string): CheckedMessage {
  const body = cleanMessage(text);
  if (!body) return { ok: false, reason: "empty" };
  if (charCount(body) > CHAT_MESSAGE_MAX)
    return { ok: false, reason: "tooLong" };
  return { ok: true, body };
}

/**
 * What the list shows of a message: on one line, cut at a word with "…" when
 * it is longer than `max` characters. The list wraps it; nothing is cut in CSS.
 */
export function chatPreview(body: string, max = CHAT_PREVIEW_LENGTH): string {
  const flat = body.replace(/\s+/g, " ").trim();
  const chars = [...flat];
  if (chars.length <= max) return flat;
  const head = chars.slice(0, max).join("");
  const space = head.lastIndexOf(" ");
  const cut = space >= head.length / 2 ? head.slice(0, space) : head;
  return `${cut.trimEnd()}…`;
}

/** A piece of a message on screen: plain text, or a link to open. */
export type MessagePart =
  | { kind: "text"; text: string }
  | { kind: "link"; text: string; href: string };

const LINK = /https?:\/\/[^\s<>"'`]+/giu;
/** Punctuation that ends a sentence rather than a link (the geresh, gershayim and "…" too). */
const TRAILING = /[.,;:!?)\]}'"\u05F3\u05F4…]+$/u;

/**
 * A message as text and links: only `http` and `https` addresses become
 * links, never `javascript:` or anything else, and nothing is fetched for a
 * preview (that would tell the site who reads it). A link keeps what was
 * typed as its text; its address is the parsed one.
 */
export function messageParts(body: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let at = 0;
  const pushText = (text: string) => {
    if (!text) return;
    const last = parts.at(-1);
    if (last?.kind === "text") last.text += text;
    else parts.push({ kind: "text", text });
  };
  for (const match of body.matchAll(LINK)) {
    const start = match.index ?? 0;
    const typed = match[0].replace(TRAILING, "");
    let href: string | null = null;
    try {
      const url = new URL(typed);
      if (url.protocol === "http:" || url.protocol === "https:") {
        href = url.href;
      }
    } catch {
      href = null;
    }
    if (!href || !typed) continue;
    pushText(body.slice(at, start));
    parts.push({ kind: "link", text: typed, href });
    at = start + typed.length;
  }
  pushText(body.slice(at));
  return parts;
}

/** Messages by one author this close together read as one run. */
export const RUN_MINUTES = 5;

/** What `groupMessages` needs of a message. */
export type GroupedMessage = {
  authorId: string | null;
  /** ISO instant. */
  createdAt: string;
  kind: ChatMessageKind;
};

/** The messages of one day, in runs by one author. */
export type MessageDay<T> = {
  /** YYYY-MM-DD, in the business's own clock. */
  day: string;
  runs: { authorId: string | null; messages: T[] }[];
};

/**
 * Messages, oldest first, as the screen shows them: a divider for each day in
 * the business's clock, and within a day runs of one author's messages less
 * than `RUN_MINUTES` apart. An announcement stands alone.
 */
export function groupMessages<T extends GroupedMessage>(
  messages: readonly T[],
  timeZone: string,
): MessageDay<T>[] {
  const days: MessageDay<T>[] = [];
  let previous: T | null = null;
  for (const message of messages) {
    const day = dateIn(new Date(message.createdAt), timeZone);
    let current = days.at(-1);
    if (!current || current.day !== day) {
      current = { day, runs: [] };
      days.push(current);
      previous = null;
    }
    const run = current.runs.at(-1);
    const joins =
      run !== undefined &&
      previous !== null &&
      message.kind !== "announcement" &&
      previous.kind !== "announcement" &&
      message.authorId !== null &&
      message.authorId === previous.authorId &&
      Date.parse(message.createdAt) - Date.parse(previous.createdAt) <
        RUN_MINUTES * 60_000;
    if (joins && run) run.messages.push(message);
    else current.runs.push({ authorId: message.authorId, messages: [message] });
    previous = message;
  }
  return days;
}

/** Where a page of messages starts: after this message, by time and then id. */
export type ChatCursor = { at: string; id: string };

const INSTANT =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$/;

/** A cursor as `parseChatCursor` reads it back, for an address. */
export function chatCursor(cursor: ChatCursor): string {
  return `${cursor.at}~${cursor.id}`;
}

/** The `?before=` or `?after=` of a page, or null when it isn't one. */
export function parseChatCursor(value: unknown): ChatCursor | null {
  if (typeof value !== "string" || value.length > 90) return null;
  // A "+" in a link reads back as a space when it isn't escaped.
  const [at = "", id = "", ...rest] = value.replace(/ /g, "+").split("~");
  if (rest.length > 0 || !INSTANT.test(at) || Number.isNaN(Date.parse(at))) {
    return null;
  }
  return isUuid(id) ? { at, id: id.toLowerCase() } : null;
}

/**
 * Two people's private chat, the lower id first, as the database keeps it
 * (`person_a < person_b`; uuids compare as their lowercase text does).
 */
export function directPair(a: string, b: string): [string, string] {
  const one = a.toLowerCase();
  const two = b.toLowerCase();
  return one < two ? [one, two] : [two, one];
}

/** A row of the chat list (`public.chat_inbox`), as the app reads it. */
export type ChatInboxRow = {
  conversation: string;
  kind: ChatKind;
  /** A department's group: its department. */
  department: string | null;
  /** A private chat: the other person. */
  otherPerson: string | null;
  /** The last message the reader reads, as an ISO instant; null for none. */
  lastAt: string | null;
  lastAuthor: string | null;
  lastKind: ChatMessageKind | null;
  /** Its first 120 characters; null when it was removed or is only a file. */
  lastPreview: string | null;
  lastFileKind: ChatFileKind | null;
  /** Messages by others since the reader last read it, at most 99. */
  unread: number;
  muted: boolean;
  /** Its department was removed: read only. */
  closed: boolean;
  /** Pinned announcements the reader hasn't confirmed. */
  pinnedWaiting: number;
};

const nullableUuid = z
  .string()
  .nullable()
  .catch(null)
  .transform((value) => (value && isUuid(value) ? value.toLowerCase() : null));
const count = z.int().min(0).catch(0);

const inboxRow = z.object({
  conversation: z.string().refine(isUuid),
  kind: z.enum(CHAT_KINDS),
  department: nullableUuid,
  other_person: nullableUuid,
  last_at: z.string().nullable().catch(null),
  last_author: nullableUuid,
  last_kind: z.enum(CHAT_MESSAGE_KINDS).nullable().catch(null),
  last_preview: z.string().nullable().catch(null),
  last_file_kind: z.enum(CHAT_FILE_KINDS).nullable().catch(null),
  unread: count,
  muted: z.boolean().catch(false),
  closed: z.boolean().catch(false),
  pinned_waiting: count,
});

/**
 * The list's rows as `public.chat_inbox` gives them, read leniently: a row
 * that isn't one is left out, and a field that is off reads as nothing.
 */
export function readChatInbox(rows: unknown): ChatInboxRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((raw) => {
    const row = inboxRow.safeParse(raw);
    if (!row.success) return [];
    const r = row.data;
    return [
      {
        conversation: r.conversation.toLowerCase(),
        kind: r.kind,
        department: r.department,
        otherPerson: r.other_person,
        lastAt: r.last_at,
        lastAuthor: r.last_author,
        lastKind: r.last_kind,
        lastPreview: r.last_preview,
        lastFileKind: r.last_file_kind,
        unread: r.unread,
        muted: r.muted,
        closed: r.closed,
        pinnedWaiting: r.pinned_waiting,
      },
    ];
  });
}

const KIND_ORDER: Record<ChatKind, number> = {
  team: 0,
  department: 1,
  direct: 2,
};

/**
 * The list's order: chats with an announcement waiting for the reader first,
 * then by their last message, newest first (chats with none last), then the
 * team's group, departments and private chats, then by id, so the order never
 * jumps between two reads.
 */
export function sortInbox<
  T extends Pick<
    ChatInboxRow,
    "conversation" | "kind" | "lastAt" | "pinnedWaiting"
  >,
>(rows: readonly T[]): T[] {
  const at = (row: T) => (row.lastAt ? Date.parse(row.lastAt) : null);
  return [...rows].sort((a, b) => {
    const waiting = Number(b.pinnedWaiting > 0) - Number(a.pinnedWaiting > 0);
    if (waiting) return waiting;
    const ta = at(a);
    const tb = at(b);
    if (ta !== tb) {
      if (ta === null) return 1;
      if (tb === null) return -1;
      return tb - ta;
    }
    const kinds = KIND_ORDER[a.kind] - KIND_ORDER[b.kind];
    if (kinds) return kinds;
    return a.conversation < b.conversation ? -1 : 1;
  });
}

/** Someone a chat names, as its reader may know them. */
export type ChatPerson =
  /** On the team now. The name is null when nobody wrote one down. */
  | { kind: "member"; name: string | null }
  /** Was on the team and has left. */
  | { kind: "former" }
  /** Nothing says who. */
  | { kind: "unknown" };

/** What a chat's title is made of, read under the reader's own access. */
export type ChatLookups = {
  /** The business's departments, removed ones too, by id: their names. */
  departments: ReadonlyMap<string, string>;
  /** The business's memberships, active or not, by person. */
  members: ReadonlyMap<string, { active: boolean; name: string | null }>;
};

/** A chat's title, for the screen's words. */
export type ChatTitle =
  | { kind: "team" }
  /** The name is null when the department is not known (any more). */
  | { kind: "department"; name: string | null }
  | { kind: "direct"; person: ChatPerson };

export function conversationTitle(
  row: Pick<ChatInboxRow, "kind" | "department" | "otherPerson">,
  lookups: ChatLookups,
): ChatTitle {
  switch (row.kind) {
    case "team":
      return { kind: "team" };
    case "department":
      return {
        kind: "department",
        name: row.department
          ? (lookups.departments.get(row.department.toLowerCase()) ?? null)
          : null,
      };
    case "direct": {
      const member = row.otherPerson
        ? lookups.members.get(row.otherPerson.toLowerCase())
        : undefined;
      const person: ChatPerson = !member
        ? { kind: "unknown" }
        : member.active
          ? { kind: "member", name: member.name }
          : { kind: "former" };
      return { kind: "direct", person };
    }
    default: {
      const unhandled: never = row.kind;
      return unhandled;
    }
  }
}
