"use server";

import {
  announcementReaders,
  CHAT_PAGE_SIZE,
  type ChatMessage,
  type ChatWrite,
  confirmAnnouncement,
  getChatAuthors,
  getMessages,
  muteChat,
  pinAnnouncement,
  readChat,
  removeChatMessage,
  restoreChatMessage,
  seeChatNotice,
  sendChatMessage,
  withOwnDrafts,
} from "@db/chat";
import {
  type ChatFileFailure,
  type ChatPdfFailure,
  type ChatPdfStart,
  cancelChatPdf,
  finishChatPdf,
  sendChatImage,
  startChatPdf,
} from "@db/chat-files";
import { parseChatCursor } from "@domain/chat";
import { splitReaders } from "@domain/chat-announce";
import {
  CHAT_IMAGE_MAX_BYTES,
  CHAT_THUMB_MAX_BYTES,
  chatPdfCancelInput,
  chatPdfFinishInput,
  chatPdfStartInput,
} from "@domain/chat-files";
import { type ChatSyncPerson, chatSendInput } from "@domain/chat-sync";
import { refresh } from "next/cache";
import { z } from "zod";
import { pushSoon } from "../../push/server";
import { chatAccess } from "./chat-access";
import type {
  ChatActionFailure,
  ChatActionResult,
  ChatImageResult,
  ChatPdfCancelResult,
  ChatPdfFinishResult,
  ChatPdfStartResult,
  ChatReaders,
  ReaderShown,
} from "./chat-types";

/**
 * A chat write as the signed-in person, in the business the screen was drawn
 * for (`business`, bound on the page: the business the app opens is one
 * cookie for the whole browser, so a message from a tab left open may arrive
 * after the person switched, and is refused then, never written in the
 * other), never while viewing as someone. The database holds the rules of who
 * may do what. Nothing is logged but an error's code: never what was typed.
 */
async function asMember<T, F extends string = ChatActionFailure>(
  business: unknown,
  run: (
    actorId: string,
    businessId: string,
  ) => Promise<ChatWrite<T> | { ok: false; failure: F }>,
): Promise<
  { ok: true; value: T } | { ok: false; failure: F | ChatActionFailure }
> {
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
            announce: sent.announce === true,
          }
        : { draft: sent.draft, words: sent.words, toPerson: sent.toPerson },
    ),
  );
  if (result.ok) pushSoon();
  return result;
}

/** A picture and its thumbnail together, at most: what the action takes. */
const IMAGE_FORM_MAX_BYTES = CHAT_IMAGE_MAX_BYTES + CHAT_THUMB_MAX_BYTES;

/** A text field of the form, or undefined when it isn't one. */
function formText(form: FormData, name: string): string | undefined {
  const value = form.get(name);
  return typeof value === "string" ? value : undefined;
}

/**
 * Sends a picture (C4), as the screen re-encoded it: `full` (at most 1280 px
 * and 400 KB) and `thumb` (360 px, 48 KB), both JPEG or both WebP, nothing
 * from the camera inside; `draft` (the browser's own id for the message, kept
 * for its retries); `words` (what is written with it, or empty); and
 * `conversation` with `announce` ("true"), or `toPerson` for someone's
 * private chat, which it opens. Bound on the page to the business it was drawn
 * for, which must still be the session's, and never while viewing as someone.
 * The server checks both files again, reserves their place, uploads them with
 * the secret key and sends the message with them, removing both at once on
 * any failure; the whole form stays under the 1 MB a server action takes.
 * Returns where it went and the message's id; the next sync brings it, with
 * its thumbnail. Its push goes as a message's does.
 */
export async function sendChatImageAction(
  business: string,
  form: FormData,
): Promise<ChatImageResult> {
  if (!(form instanceof FormData)) return { ok: false, failure: "invalid" };
  const full = form.get("full");
  const thumb = form.get("thumb");
  if (!(full instanceof Blob) || !(thumb instanceof Blob)) {
    return { ok: false, failure: "empty" };
  }
  if (full.size + thumb.size > IMAGE_FORM_MAX_BYTES) {
    return { ok: false, failure: "tooBig" };
  }
  const conversation = formText(form, "conversation");
  const toPerson = formText(form, "toPerson");
  const parsed = chatSendInput.safeParse(
    conversation !== undefined
      ? {
          draft: formText(form, "draft"),
          words: formText(form, "words") ?? "",
          conversation,
          ...(formText(form, "announce") === "true" ? { announce: true } : {}),
        }
      : {
          draft: formText(form, "draft"),
          words: formText(form, "words") ?? "",
          toPerson,
        },
  );
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const sent = parsed.data;
  const result = await asMember<
    { conversation: string; message: string },
    ChatFileFailure
  >(business, (actor, businessId) =>
    sendChatImage(
      actor,
      businessId,
      "conversation" in sent
        ? {
            draft: sent.draft,
            words: sent.words,
            conversation: sent.conversation,
            announce: sent.announce === true,
            full,
            thumb,
          }
        : {
            draft: sent.draft,
            words: sent.words,
            toPerson: sent.toPerson,
            full,
            thumb,
          },
    ),
  );
  if (result.ok) pushSoon();
  return result;
}

/**
 * Starts sending a PDF (C5; `chatPdfStartInput`: its `name` and `size` as
 * the browser has them, the `draft` it will go under, and `conversation` or
 * `toPerson`). Bound on the page to the business it was drawn for, which
 * must still be the session's, and never while viewing as someone. The
 * server checks the name (a .pdf) and size (1 byte to 10 MiB), reserves its
 * place with the sending's own checks, and returns `ChatPdfStart`: the place
 * (`upload`), the conversation (a new private chat's id when it opened one),
 * the name as kept, and `signedUrl`, Storage's signed upload for that one
 * path, good for 2 hours. The browser then PUTs the file's bytes to it with
 * `Content-Type: application/pdf`, by itself (plain `fetch` or
 * `XMLHttpRequest`, for its progress), with no Supabase client and no
 * session, and calls `finishChatPdfAction`. Nothing is written to the
 * conversation yet.
 */
export async function startChatPdfAction(
  business: string,
  input: unknown,
): Promise<ChatPdfStartResult> {
  const parsed = chatPdfStartInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const asked = parsed.data;
  return asMember<ChatPdfStart, ChatPdfFailure>(business, (actor, businessId) =>
    startChatPdf(
      actor,
      businessId,
      "conversation" in asked
        ? {
            draft: asked.draft,
            name: asked.name,
            size: asked.size,
            conversation: asked.conversation,
          }
        : {
            draft: asked.draft,
            name: asked.name,
            size: asked.size,
            toPerson: asked.toPerson,
          },
    ),
  );
}

/**
 * Sends the PDF the browser put at its place (C5; `chatPdfFinishInput`: the
 * `upload` `startChatPdfAction` gave, the same `draft`, and the `words`
 * sent with it). The server reads the place's file (its database's path,
 * never one the browser names), checks its first KB is a PDF's, and sends it,
 * the database checking its size and type in Storage; on any refusal the file
 * is let go (the server's tombstone replaces it, so its signed upload can't
 * write there again, and a later try is told to start again). Sending again
 * with the same draft gives back the same message.
 * Returns where it went and the message's id; the next sync brings it. Its
 * push goes as a message's does.
 */
export async function finishChatPdfAction(
  business: string,
  input: unknown,
): Promise<ChatPdfFinishResult> {
  const parsed = chatPdfFinishInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const finished = parsed.data;
  const result = await asMember<
    { conversation: string; message: string },
    ChatPdfFailure
  >(business, (actor, businessId) =>
    finishChatPdf(actor, businessId, finished),
  );
  if (result.ok) pushSoon();
  return result;
}

/**
 * The person stopped sending a PDF (C5; `chatPdfCancelInput`: its
 * `upload`): its place is let go (whatever the browser put there gives way to
 * the server's tombstone), unless it was sent, which the answer says
 * (`sent`). The screen aborts its PUT first.
 */
export async function cancelChatPdfAction(
  business: string,
  input: unknown,
): Promise<ChatPdfCancelResult> {
  const parsed = chatPdfCancelInput.safeParse(input);
  if (!parsed.success) return { ok: false, failure: "invalid" };
  const { upload } = parsed.data;
  return asMember<{ sent: boolean }, ChatPdfFailure>(
    business,
    (actor, businessId) => cancelChatPdf(actor, businessId, upload),
  );
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

const messageId = z.uuid();

/**
 * A change to one message as the signed-in person, which the database checks
 * again (who may, where, and for how long); the next sync brings it to
 * everyone else. `pushes`: it may tell people again (a pin, a message put
 * back that was pinned), so the phone's part goes out soon.
 */
async function changeMessageAs(
  business: string,
  message: unknown,
  change: (actor: string, id: string) => Promise<ChatWrite<null>>,
  pushes = false,
): Promise<ChatActionResult> {
  const id = messageId.safeParse(message);
  if (!id.success) return { ok: false, failure: "invalid" };
  const result = await asMember(business, (actor) => change(actor, id.data));
  if (result.ok && pushes) pushSoon();
  return result;
}

/**
 * "קראתי" on an announcement the person reads: once, and their own line
 * about it is settled. Its author and management see that they did; nobody
 * else does. From the conversation, /chat/announcements and Today.
 */
export async function confirmAnnouncementAction(
  business: string,
  message: unknown,
): Promise<ChatActionResult> {
  return changeMessageAs(business, message, (actor, id) =>
    confirmAnnouncement(actor, id),
  );
}

/**
 * Its author or management pins an announcement again, or unpins it, which
 * settles its lines for everyone. Pinned again, it asks those who haven't
 * confirmed it, again.
 */
export async function pinAnnouncementAction(
  business: string,
  message: unknown,
  pin: unknown,
): Promise<ChatActionResult> {
  if (typeof pin !== "boolean") return { ok: false, failure: "invalid" };
  return changeMessageAs(
    business,
    message,
    (actor, id) => pinAnnouncement(actor, id, pin),
    pin,
  );
}

/**
 * Removes a message: one's own anywhere ("מחיקת ההודעה"), or as management
 * someone else's in a group ("הסרת ההודעה"; never in a private chat, which
 * the database refuses too). Its text waits 10 minutes for the undo; a
 * removal by management of someone else's is in the activity log, with no
 * word of it.
 */
export async function removeChatMessageAction(
  business: string,
  message: unknown,
): Promise<ChatActionResult> {
  return changeMessageAs(business, message, (actor, id) =>
    removeChatMessage(actor, id),
  );
}

/**
 * "ביטול" right after removing: whoever removed the message puts it back,
 * within the database's 10 minutes ("closed" after).
 */
export async function restoreChatMessageAction(
  business: string,
  message: unknown,
): Promise<ChatActionResult> {
  return changeMessageAs(
    business,
    message,
    (actor, id) => restoreChatMessage(actor, id),
    true,
  );
}

/**
 * No notifications from a conversation on the person's phone (`mute`), or
 * again. It still counts as unread in the app, and nobody else learns of it.
 */
export async function muteChatAction(
  business: string,
  conversation: unknown,
  mute: unknown,
): Promise<ChatActionResult> {
  const id = conversationId.safeParse(conversation);
  if (!id.success || typeof mute !== "boolean") {
    return { ok: false, failure: "invalid" };
  }
  return asMember(business, (actor) => muteChat(actor, id.data, mute));
}

/**
 * Who of the group confirmed an announcement and who not yet, named, for its
 * author and management only (`public.announcement_readers` reads nobody for
 * anyone else, so both lists are empty for them). Read under the person's
 * own session; nothing is written.
 */
export async function announcementReadersAction(
  business: string,
  message: unknown,
): Promise<ChatActionResult<ChatReaders>> {
  const id = messageId.safeParse(message);
  if (!id.success) return { ok: false, failure: "invalid" };
  return asMember(business, async () => {
    const readers = await announcementReaders(id.data);
    const people = new Map(
      (await getChatAuthors(readers.map((r) => r.person))).map((p) => [
        p.id,
        p,
      ]),
    );
    const named = readers
      .map((reader): ReaderShown => {
        const person = people.get(reader.person.toLowerCase());
        return {
          person: reader.person.toLowerCase(),
          ackedAt: reader.ackedAt,
          name: person?.name ?? null,
          photo: person?.photo ?? null,
        };
      })
      .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "", "he"));
    return { ok: true, value: splitReaders(named) };
  });
}
