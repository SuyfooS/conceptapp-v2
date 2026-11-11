"use server";

import {
  CHAT_PAGE_SIZE,
  type ChatMessage,
  type ChatWrite,
  getChatAuthors,
  getMessages,
  readChat,
  seeChatNotice,
  sendChatMessage,
  withOwnDrafts,
} from "@db/chat";
import { parseChatCursor } from "@domain/chat";
import { type ChatSyncPerson, chatSendInput } from "@domain/chat-sync";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../push/server";
import { chatAccess } from "./chat-access";
import type { ChatActionResult } from "./chat-types";

/**
 * A chat write as the signed-in person, in the business the screen was drawn
 * for (`business`, bound on the page: the business the app opens is one
 * cookie for the whole browser, so a message from a tab left open may arrive
 * after the person switched, and is refused then, never written in the
 * other), never while viewing as someone. The database holds the rules of who
 * may do what. Nothing is logged but an error's code: never what was typed.
 */
async function asMember<T>(
  business: unknown,
  run: (actorId: string, businessId: string) => Promise<ChatWrite<T>>,
): Promise<ChatActionResult<T>> {
  const access = await chatAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (business !== access.businessId) {
    return { ok: false, failure: "businessChanged" };
  }
  if (access.viewing) return { ok: false, failure: "viewOnly" };
  try {
    return await run(access.userId, access.businessId);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("a chat action failed", code);
    return { ok: false, failure: "failed" };
  }
}

/**
 * Sends a message (`chatSendInput`): in a conversation, or to someone on the
 * staff, whose private chat it opens. The screen shows it at once as being
 * sent, with its `draft`, and sends again with the same draft on a retry,
 * which gives back the same message. Returns where it went (a new private
 * chat's id, to go to) and the message's id; the next sync brings the
 * message itself. Its push goes with the minute job, 15 seconds late, so a
 * conversation open on the other side reads it first.
 */
export async function sendChatMessageAction(
  business: string,
  input: unknown,
): Promise<ChatActionResult<{ conversation: string; message: string }>> {
  const parsed = chatSendInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const sent = parsed.data;
  const result = await asMember(business, (actor, businessId) =>
    sendChatMessage(
      actor,
      businessId,
      "conversation" in sent
        ? {
            draft: sent.draft,
            words: sent.words,
            conversation: sent.conversation,
          }
        : { draft: sent.draft, words: sent.words, toPerson: sent.toPerson },
    ),
  );
  if (result.ok) pushSoon();
  return result;
}

const conversationId = z.uuid();
const instant = z
  .string()
  .max(40)
  .refine((value) => !Number.isNaN(Date.parse(value)));

/**
 * The person read a conversation up to `upTo` (the newest message on their
 * screen, its `createdAt`; everything until now when left out), which reads
 * its line too once that covers the last message. Called while the
 * conversation is on screen and visible, never while a page renders, so a
 * prefetch marks nothing. Nothing is drawn again: the next sync brings the
 * list's counts.
 */
export async function readChatAction(
  business: string,
  conversation: unknown,
  upTo?: unknown,
): Promise<ChatActionResult> {
  const id = conversationId.safeParse(conversation);
  const until = upTo === undefined ? undefined : instant.safeParse(upTo);
  if (!id.success || (until && !until.success)) {
    return { ok: false, failure: "invalid" };
  }
  return asMember(business, (actor) =>
    readChat(actor, id.data, until?.success ? until.data : undefined),
  );
}

/**
 * The 50 messages before `before` (a `chatCursor` of the oldest on screen),
 * oldest first, with their authors' names, as the person reads them (RLS:
 * from when they joined a group, and a private chat only for its two). For
 * scrolling up a conversation; nothing is written.
 */
export async function olderChatMessagesAction(
  business: string,
  conversation: unknown,
  before: unknown,
): Promise<
  ChatActionResult<{
    messages: ChatMessage[];
    people: ChatSyncPerson[];
    more: boolean;
  }>
> {
  const id = conversationId.safeParse(conversation);
  const cursor = parseChatCursor(before);
  if (!id.success || !cursor) return { ok: false, failure: "invalid" };
  return asMember(business, async (actor, businessId) => {
    const page = await getMessages({
      businessId,
      conversationId: id.data,
      before: cursor,
    });
    const oldestFirst = [...page].reverse();
    const [people, messages] = await Promise.all([
      getChatAuthors(
        oldestFirst.flatMap((message) =>
          message.authorId ? [message.authorId] : [],
        ),
      ),
      withOwnDrafts(oldestFirst, actor),
    ]);
    return {
      ok: true,
      value: { messages, people, more: page.length >= CHAT_PAGE_SIZE },
    };
  });
}

/**
 * The person read chat's notice, who sees what ("הבנתי"): kept once, and the
 * list draws again without it.
 */
export async function seeChatNoticeAction(
  business: string,
): Promise<ChatActionResult> {
  const result = await asMember(business, (actor, businessId) =>
    seeChatNotice(actor, businessId),
  );
  if (result.ok) refresh();
  return result;
}
