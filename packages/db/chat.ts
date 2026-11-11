import "server-only";
import { isUuid } from "@domain/activity";
import {
  CHAT_FILE_KINDS,
  CHAT_KINDS,
  CHAT_MESSAGE_KINDS,
  type ChatCursor,
  type ChatFileKind,
  type ChatInboxRow,
  type ChatKind,
  type ChatMessageKind,
  type ChatTitle,
  checkMessage,
  conversationTitle,
  readChatInbox,
  sortInbox,
} from "@domain/chat";
import {
  type ChatDirectory,
  type ChatListRow,
  type ChatMember,
  type ChatSyncPerson,
  chatListRows,
} from "@domain/chat-sync";
import { isStaff } from "@domain/modules";
import { profilePhotoSrc } from "@domain/profile-photos";
import { z } from "zod";
import type { Database } from "./database.types";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Chat (supabase/migrations/20261111000200_chat.sql, and from C2
 * 20261111000300_chat_on.sql). Reads run under RLS as
 * the signed-in person, so a private chat is read by its two people only and a
 * group from when the reader joined it; a view session reads nothing. Writes
 * run with the secret key for `actorId`; the database checks who may do what,
 * and callers check the actor is the signed-in person and not viewing as
 * someone else. Nothing here logs what a message says: a failure is logged by
 * its code. Everything tolerates a project the migration hasn't reached yet
 * ("notYet").
 */

/** Why a write was refused, for the screens' words. */
export type ChatFailure =
  /** Not theirs to do (42501), or nothing of theirs (P0002). */
  | "noAccess"
  /** No text, too long, or a shape the database won't keep (22023). */
  | "invalid"
  /** Chat is off, the group is closed, the other person left, too late to undo (55000). */
  | "closed"
  /** Too many in a minute, or in a demo's hour (54000). */
  | "tooFast"
  /** The migration isn't on this project yet. */
  | "notYet"
  | "failed";

export type ChatWrite<T> =
  | { ok: true; value: T }
  | { ok: false; failure: ChatFailure };

function failureOf(error: { code?: string }): ChatFailure {
  if (isMissingFunction(error)) return "notYet";
  switch (error.code) {
    case "42501":
    case "P0002":
      return "noAccess";
    case "22023":
      return "invalid";
    case "55000":
      return "closed";
    case "54000":
      return "tooFast";
    default:
      // The code alone: a message's text never reaches a log.
      console.error("a chat write failed", error.code ?? "without a code");
      return "failed";
  }
}

const refused = (failure: ChatFailure) => ({ ok: false, failure }) as const;
const done = <T>(value: T) => ({ ok: true, value }) as const;

/** `at_time` for a write, when the caller says when it happened. */
const atTime = (at?: Date) => (at ? { at_time: at.toISOString() } : {});

/** A text column the database keeps to a list of words, read leniently. */
function oneOf<T extends string>(
  words: readonly T[],
  value: string | null,
  fallback: T,
): T {
  return words.find((word) => word === value) ?? fallback;
}

/**
 * The signed-in person's chats in the business, in the list's order
 * (`public.chat_inbox`, under their own session): nothing for a view session.
 */
export async function getChatInbox(
  businessId: string,
): Promise<ChatInboxRow[] | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_inbox", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return "notYet";
    throw error;
  }
  return sortInbox(readChatInbox(data));
}

/**
 * Who and what the chat screens name in the business, as the signed-in person
 * reads them (RLS: everyone in a business reads its team and departments):
 * every membership, active or not, with its name and photo (`active` is on
 * the staff now, so someone who left, or is only the accountant, reads as
 * having left a private chat), and every department, removed ones too, by id.
 * Nothing about any chat. Empty before anything is readable.
 */
export async function getChatDirectory(
  businessId: string,
): Promise<ChatDirectory> {
  const supabase = await createClient();
  const [members, departments] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, role, active, profiles (full_name, avatar_path)")
      .eq("business_id", businessId),
    supabase
      .from("departments")
      .select("id, name")
      .eq("business_id", businessId),
  ]);
  if (members.error) throw members.error;
  if (departments.error && !isMissingTable(departments.error)) {
    throw departments.error;
  }
  return {
    members: new Map(
      (members.data ?? []).map((row): [string, ChatMember] => [
        row.user_id.toLowerCase(),
        {
          active: row.active && isStaff(row.role),
          name: row.profiles?.full_name?.trim() || null,
          photo: profilePhotoSrc(row.profiles?.avatar_path),
          role: row.role,
        },
      ]),
    ),
    departments: new Map(
      (departments.data ?? []).map((row): [string, string] => [
        row.id.toLowerCase(),
        row.name,
      ]),
    ),
  };
}

/**
 * The signed-in person's chats in the business, in the list's order and each
 * with its title and picture (`getChatInbox` named from `getChatDirectory`):
 * what the list draws, and what `/chat-sync` sends when it moved.
 */
export async function getChatList(
  businessId: string,
): Promise<ChatListRow[] | "notYet"> {
  const [rows, directory] = await Promise.all([
    getChatInbox(businessId),
    getChatDirectory(businessId),
  ]);
  return rows === "notYet" ? rows : chatListRows(rows, directory);
}

/** A conversation as its reader may see it. */
export type ChatConversation = {
  id: string;
  kind: ChatKind;
  /** A department's group: its department. */
  departmentId: string | null;
  /** A private chat's two people, the lower id first. */
  people: [string, string] | null;
  lastMessageAt: string | null;
  /** Its department was removed: read only. */
  closed: boolean;
};

/**
 * Whether the reader may write in it, as far as the conversation says:
 * "closed" while its department is removed, "left" when the other person of
 * a private chat is no longer on the staff, else "open". Who writes in the
 * whole team's group (`teamGroupWho`) is the screen's, from the settings and
 * the reader's permissions.
 */
export type ChatConversationState = "open" | "closed" | "left";

/** A conversation as its screen draws it. */
export type ChatConversationView = ChatConversation & {
  title: ChatTitle;
  /** A private chat: the other person. */
  otherPerson: string | null;
  state: ChatConversationState;
  /**
   * The names and photos its messages' authors are shown with: a private
   * chat's two people, or for a group everyone in the business, those who
   * left too. A lookup, not who is in the group (that is C3's details).
   */
  names: ChatSyncPerson[];
};

const CONVERSATION_COLUMNS =
  "id, kind, department_id, person_a, person_b, last_message_at, closed_at";

/**
 * One conversation of the business, when the signed-in person (`readerId`)
 * reads it (RLS), with its title, whether they may write in it and the people
 * it names; null otherwise, the same for one that doesn't exist.
 */
export async function getConversation(
  businessId: string,
  conversationId: string,
  readerId: string,
): Promise<ChatConversationView | null> {
  if (!isUuid(conversationId)) return null;
  const supabase = await createClient();
  const [read, directory] = await Promise.all([
    supabase
      .from("chat_conversations")
      .select(CONVERSATION_COLUMNS)
      .eq("business_id", businessId)
      .eq("id", conversationId.toLowerCase())
      .maybeSingle(),
    getChatDirectory(businessId),
  ]);
  const { data, error } = read;
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data) return null;
  const kind = oneOf(CHAT_KINDS, data.kind, "team");
  const people: [string, string] | null =
    data.person_a && data.person_b ? [data.person_a, data.person_b] : null;
  const reader = readerId.toLowerCase();
  const otherPerson = people
    ? (people.find((person) => person.toLowerCase() !== reader) ?? null)
    : null;
  const title = conversationTitle(
    { kind, department: data.department_id, otherPerson },
    directory,
  );
  const named = (id: string): ChatSyncPerson => {
    const member = directory.members.get(id.toLowerCase());
    return {
      id: id.toLowerCase(),
      name: member?.name ?? null,
      photo: member?.photo ?? null,
    };
  };
  return {
    id: data.id,
    kind,
    departmentId: data.department_id,
    people,
    lastMessageAt: data.last_message_at,
    closed: data.closed_at !== null,
    title,
    otherPerson,
    state:
      data.closed_at !== null
        ? "closed"
        : kind === "direct" &&
            !(
              otherPerson &&
              directory.members.get(otherPerson.toLowerCase())?.active
            )
          ? "left"
          : "open",
    names: people
      ? people.map(named)
      : [...directory.members.keys()].map(named),
  };
}

/**
 * The kind of one conversation of the business, when the signed-in person
 * reads it (RLS); null otherwise. One small read, for `/chat-sync`.
 */
export async function getConversationKind(
  businessId: string,
  conversationId: string,
): Promise<ChatKind | null> {
  if (!isUuid(conversationId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_conversations")
    .select("id, kind")
    .eq("business_id", businessId)
    .eq("id", conversationId.toLowerCase())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  return data ? oneOf(CHAT_KINDS, data.kind, "team") : null;
}

/**
 * The names and photos of the people who wrote messages, as the signed-in
 * person reads them (their colleagues, RLS); someone they can't read comes
 * back without a name.
 */
export async function getChatAuthors(
  ids: readonly string[],
): Promise<ChatSyncPerson[]> {
  const wanted = [...new Set(ids.filter(isUuid).map((id) => id.toLowerCase()))];
  if (wanted.length === 0) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, full_name, avatar_path")
    .in("id", wanted);
  if (error) throw error;
  const found = new Map((data ?? []).map((row) => [row.id.toLowerCase(), row]));
  return wanted.map((id) => {
    const row = found.get(id);
    return {
      id,
      name: row?.full_name?.trim() || null,
      photo: profilePhotoSrc(row?.avatar_path),
    };
  });
}

/** A message as its reader may see it. */
export type ChatMessage = {
  id: string;
  authorId: string | null;
  kind: ChatMessageKind;
  /** Null when it was removed, or it is only a file. */
  body: string | null;
  fileKind: ChatFileKind | null;
  fileName: string | null;
  fileSize: number | null;
  /** The days or the space took its file; the message stays. */
  fileGone: boolean;
  pinned: boolean;
  /** ISO instant. */
  createdAt: string;
  removed: boolean;
  removedBy: string | null;
  /**
   * The browser's own id it was sent with, for the reader's own messages
   * (`withOwnDrafts`); null for anyone else's, and before it is read.
   */
  draft: string | null;
};

/** Messages a page reads at most. */
export const CHAT_PAGE_SIZE = 50;

const MESSAGE_COLUMNS =
  "id, author_id, kind, body, file_kind, file_name, file_size, file_removed_at, pinned, created_at, removed_at, removed_by";

type MessageRow = Pick<
  Database["public"]["Tables"]["chat_messages"]["Row"],
  | "id"
  | "author_id"
  | "kind"
  | "body"
  | "file_kind"
  | "file_name"
  | "file_size"
  | "file_removed_at"
  | "pinned"
  | "created_at"
  | "removed_at"
  | "removed_by"
>;

const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  authorId: row.author_id,
  kind: oneOf(CHAT_MESSAGE_KINDS, row.kind, "text"),
  body: row.body,
  fileKind: row.file_kind
    ? (CHAT_FILE_KINDS.find((kind) => kind === row.file_kind) ?? null)
    : null,
  fileName: row.file_name,
  fileSize: row.file_size,
  fileGone: row.file_removed_at !== null,
  pinned: row.pinned,
  createdAt: row.created_at,
  removed: row.removed_at !== null,
  removedBy: row.removed_by,
  draft: null,
});

/**
 * A page of a conversation's messages the signed-in person reads, newest
 * first: before a cursor (older ones), after one (what came since), or the
 * newest (`public.chat_page`, under their own session). A page starts where
 * their history does (when they joined it); the database asks who reads it
 * once and stops there, never walking the older history. Pinned announcements
 * from before that come from `getPinnedAnnouncements`.
 */
export async function getMessages({
  businessId,
  conversationId,
  before,
  after,
  since,
  limit = CHAT_PAGE_SIZE,
}: {
  businessId: string;
  conversationId: string;
  /** From `parseChatCursor`. */
  before?: ChatCursor | null;
  after?: ChatCursor | null;
  /**
   * Strictly after this instant, whatever the id, in place of `after`: the
   * sync's second look before its cursor (`syncWindowStart`).
   */
  since?: string | null;
  limit?: number;
}): Promise<ChatMessage[]> {
  if (!isUuid(conversationId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_page", {
    business: businessId,
    conversation: conversationId.toLowerCase(),
    ...(before ? { before_at: before.at, before_id: before.id } : {}),
    ...(since
      ? { after_at: since }
      : after
        ? { after_at: after.at, after_id: after.id }
        : {}),
    page_limit: Math.min(Math.max(limit, 1), CHAT_PAGE_SIZE),
  });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return (data ?? []).map(toMessage);
}

/**
 * The messages, with the draft each of the reader's own was sent with (the
 * browser's own id for it), read under their session: how the screen knows
 * its own message on its way, and keeps it one bubble once it arrives.
 * Nobody else's draft is read, and nothing is when none is theirs.
 */
export async function withOwnDrafts(
  messages: readonly ChatMessage[],
  readerId: string,
): Promise<ChatMessage[]> {
  const reader = readerId.toLowerCase();
  const own = messages
    .filter((m) => m.authorId?.toLowerCase() === reader)
    .map((m) => m.id.toLowerCase());
  if (own.length === 0) return [...messages];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, draft_id")
    .eq("author_id", reader)
    .in("id", own);
  if (error) {
    if (isMissingTable(error)) return [...messages];
    throw error;
  }
  const drafts = new Map(
    (data ?? []).map((row) => [
      row.id.toLowerCase(),
      row.draft_id.toLowerCase(),
    ]),
  );
  return messages.map((m) => ({
    ...m,
    draft: drafts.get(m.id.toLowerCase()) ?? null,
  }));
}

/**
 * A conversation's pinned announcements the signed-in person reads (RLS: every
 * member reads them, from before they joined too), newest first, for the top
 * of the conversation.
 */
export async function getPinnedAnnouncements(
  businessId: string,
  conversationId: string,
): Promise<ChatMessage[]> {
  if (!isUuid(conversationId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_messages")
    .select(MESSAGE_COLUMNS)
    .eq("business_id", businessId)
    .eq("conversation_id", conversationId.toLowerCase())
    .eq("pinned", true)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(CHAT_PAGE_SIZE);
  if (error) {
    if (isMissingTable(error)) return [];
    throw error;
  }
  return (data ?? []).map(toMessage);
}

/**
 * Whether anything changed in the signed-in person's chats since they last
 * asked (`public.chat_version`): an opaque value to compare. Null before the
 * migration reaches the project.
 */
export async function chatVersion(businessId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_version", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  return typeof data === "string" ? data : null;
}

/**
 * How far the other person of the signed-in person's private chat read it
 * ("נקראה", `public.chat_seen`), as an ISO instant; null for anyone else, a
 * group, or nothing read yet.
 */
export async function chatSeen(conversationId: string): Promise<string | null> {
  if (!isUuid(conversationId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_seen", {
    conversation: conversationId.toLowerCase(),
  });
  if (error) {
    if (isMissingFunction(error)) return null;
    throw error;
  }
  return typeof data === "string" ? data : null;
}

/**
 * Who of the group confirmed an announcement, and when (null: not yet), for
 * its author and the moderators (`public.announcement_readers`); nobody for
 * anyone else.
 */
export async function announcementReaders(
  messageId: string,
): Promise<{ person: string; ackedAt: string | null }[]> {
  if (!isUuid(messageId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("announcement_readers", {
    message: messageId.toLowerCase(),
  });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return (data ?? []).map((row) => ({
    person: row.person,
    ackedAt: row.acked_at ?? null,
  }));
}

/** Where a message goes: a conversation, or someone's private chat. */
export type ChatTarget = { conversation: string } | { toPerson: string };

const sentSchema = z.object({
  conversation: z.string().refine(isUuid),
  message: z.string().refine(isUuid),
});

/**
 * Sends a message (`public.send_chat_message`), cleaned and checked first as
 * the database checks it. `draft` is the browser's own id for it: sending the
 * same draft again gives back the same message. Returns where it went.
 */
export async function sendChatMessage(
  actorId: string,
  businessId: string,
  input: ChatTarget & { draft: string; words: string; announce?: boolean },
  at?: Date,
): Promise<ChatWrite<{ conversation: string; message: string }>> {
  const message = checkMessage(input.words);
  if (!message.ok || !isUuid(input.draft)) return refused("invalid");
  const target =
    "conversation" in input
      ? isUuid(input.conversation)
        ? { conversation: input.conversation.toLowerCase() }
        : null
      : isUuid(input.toPerson)
        ? { to_person: input.toPerson.toLowerCase() }
        : null;
  if (!target) return refused("noAccess");
  const { data, error } = await createAdminClient().rpc("send_chat_message", {
    actor: actorId,
    business: businessId,
    draft: input.draft.toLowerCase(),
    words: message.body,
    announce: input.announce === true,
    ...target,
    ...atTime(at),
  });
  if (error) return refused(failureOf(error));
  const sent = sentSchema.safeParse(data);
  return sent.success ? done(sent.data) : refused("failed");
}

/**
 * The signed-in person read a conversation up to `upTo` (the newest message on
 * their screen; everything until now when left out), which reads its line too
 * once that covers the last message (`public.read_chat`). Called from a
 * server action while the conversation is on screen, never while a page
 * renders.
 */
export async function readChat(
  actorId: string,
  conversationId: string,
  upTo?: string,
  at?: Date,
): Promise<ChatWrite<null>> {
  if (!isUuid(conversationId)) return refused("noAccess");
  if (upTo !== undefined && Number.isNaN(Date.parse(upTo))) {
    return refused("invalid");
  }
  const { error } = await createAdminClient().rpc("read_chat", {
    actor: actorId,
    conversation: conversationId.toLowerCase(),
    ...(upTo !== undefined ? { up_to: upTo } : {}),
    ...atTime(at),
  });
  return error ? refused(failureOf(error)) : done(null);
}

/** Mutes a conversation for its reader, or unmutes it (`public.mute_chat`). */
export async function muteChat(
  actorId: string,
  conversationId: string,
  mute: boolean,
): Promise<ChatWrite<null>> {
  if (!isUuid(conversationId)) return refused("noAccess");
  const { error } = await createAdminClient().rpc("mute_chat", {
    actor: actorId,
    conversation: conversationId.toLowerCase(),
    mute,
  });
  return error ? refused(failureOf(error)) : done(null);
}

type MessageChange =
  | "remove_chat_message"
  | "restore_chat_message"
  | "confirm_announcement";

async function changeMessage(
  change: MessageChange,
  actorId: string,
  messageId: string,
  at?: Date,
): Promise<ChatWrite<null>> {
  if (!isUuid(messageId)) return refused("noAccess");
  const { error } = await createAdminClient().rpc(change, {
    actor: actorId,
    message: messageId.toLowerCase(),
    ...atTime(at),
  });
  return error ? refused(failureOf(error)) : done(null);
}

/**
 * Removes a message: one's own anywhere, someone else's in a group for a
 * moderator. What it said waits 10 minutes for `restoreChatMessage`.
 */
export function removeChatMessage(
  actorId: string,
  messageId: string,
  at?: Date,
): Promise<ChatWrite<null>> {
  return changeMessage("remove_chat_message", actorId, messageId, at);
}

/** Puts back a message its remover removed, within 10 minutes ("closed" after). */
export function restoreChatMessage(
  actorId: string,
  messageId: string,
  at?: Date,
): Promise<ChatWrite<null>> {
  return changeMessage("restore_chat_message", actorId, messageId, at);
}

/** "קראתי" on an announcement, which settles the person's own line. */
export function confirmAnnouncement(
  actorId: string,
  messageId: string,
  at?: Date,
): Promise<ChatWrite<null>> {
  return changeMessage("confirm_announcement", actorId, messageId, at);
}

/** Its author or a moderator pins an announcement, or unpins it. */
export async function pinAnnouncement(
  actorId: string,
  messageId: string,
  pin: boolean,
  at?: Date,
): Promise<ChatWrite<null>> {
  if (!isUuid(messageId)) return refused("noAccess");
  const { error } = await createAdminClient().rpc("pin_announcement", {
    actor: actorId,
    message: messageId.toLowerCase(),
    pin,
    ...atTime(at),
  });
  return error ? refused(failureOf(error)) : done(null);
}

/**
 * Whether the signed-in person has read chat's notice in the business, who
 * sees what (`public.chat_notices`, their own row under RLS): the list shows
 * it until they have. False before the migration reaches the project, so the
 * notice is never skipped.
 */
export async function chatNoticeSeen(businessId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_notices")
    .select("seen_at")
    .eq("business_id", businessId)
    .limit(1);
  if (error) {
    if (isMissingTable(error)) return false;
    throw error;
  }
  return (data ?? []).length > 0;
}

/**
 * The person read chat's notice in the business (`public.see_chat_notice`):
 * kept once. "noAccess" off the staff, "closed" while chat is off.
 */
export async function seeChatNotice(
  actorId: string,
  businessId: string,
): Promise<ChatWrite<null>> {
  const { error } = await createAdminClient().rpc("see_chat_notice", {
    actor: actorId,
    business: businessId,
  });
  return error ? refused(failureOf(error)) : done(null);
}
