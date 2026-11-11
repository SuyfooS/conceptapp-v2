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
  checkMessage,
  readChatInbox,
  sortInbox,
} from "@domain/chat";
import { z } from "zod";
import type { Database } from "./database.types";
import { isMissingFunction } from "./missing";
import { isMissingTable } from "./notifications";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Chat (supabase/migrations/20261111000200_chat.sql). Reads run under RLS as
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
 * One conversation of the business, when the signed-in person reads it
 * (RLS); null otherwise, the same for one that doesn't exist.
 */
export async function getConversation(
  businessId: string,
  conversationId: string,
): Promise<ChatConversation | null> {
  if (!isUuid(conversationId)) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("chat_conversations")
    .select(
      "id, kind, department_id, person_a, person_b, last_message_at, closed_at",
    )
    .eq("business_id", businessId)
    .eq("id", conversationId.toLowerCase())
    .maybeSingle();
  if (error) {
    if (isMissingTable(error)) return null;
    throw error;
  }
  if (!data) return null;
  return {
    id: data.id,
    kind: oneOf(CHAT_KINDS, data.kind, "team"),
    departmentId: data.department_id,
    people:
      data.person_a && data.person_b ? [data.person_a, data.person_b] : null,
    lastMessageAt: data.last_message_at,
    closed: data.closed_at !== null,
  };
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
  limit = CHAT_PAGE_SIZE,
}: {
  businessId: string;
  conversationId: string;
  /** From `parseChatCursor`. */
  before?: ChatCursor | null;
  after?: ChatCursor | null;
  limit?: number;
}): Promise<ChatMessage[]> {
  if (!isUuid(conversationId)) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("chat_page", {
    business: businessId,
    conversation: conversationId.toLowerCase(),
    ...(before ? { before_at: before.at, before_id: before.id } : {}),
    ...(after ? { after_at: after.at, after_id: after.id } : {}),
    page_limit: Math.min(Math.max(limit, 1), CHAT_PAGE_SIZE),
  });
  if (error) {
    if (isMissingFunction(error)) return [];
    throw error;
  }
  return (data ?? []).map(toMessage);
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
