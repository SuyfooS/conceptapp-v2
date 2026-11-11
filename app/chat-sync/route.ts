import {
  CHAT_PAGE_SIZE,
  type ChatMessage,
  chatSeen,
  chatVersion,
  getChatAuthors,
  getChatList,
  getConversationStamp,
  getMarkedMessages,
  getMessages,
  getMessagesById,
  getPinnedState,
  withOwnDrafts,
} from "@db/chat";
import { getOwnPlace } from "@db/session";
import {
  type ChatSyncAnswer,
  chatMarks,
  newestCursor,
  type PinnedAnnouncement,
  readChatSyncQuery,
  syncBrings,
  syncWindowStart,
  withinHeld,
} from "@domain/chat-sync";
import { holdsPermission, isStaff } from "@domain/modules";
import { manifestFor } from "@modules/registry";
import { sameOriginRequest } from "@/app/origin";

const NO_STORE = { "Cache-Control": "no-store" } as const;

/** An answer with no body, never kept anywhere. */
function status(code: 204 | 400 | 401 | 403 | 404 | 500): Response {
  return new Response(null, { status: code, headers: NO_STORE });
}

/**
 * What changed in the signed-in person's chats, for the chat screens, which
 * ask while they are on screen (`nextSyncDelay` in @domain/chat-sync says
 * when): `GET /chat-sync?v=<the list's version>&c=<the conversation on
 * screen>&after=<its newest message's cursor>&n=<how many it holds just
 * before that>`, every part optional, `after` only with `c` and `n` only
 * with `after`. With `n` it looks again from a moment before the cursor
 * (`syncWindowStart`): a message stamped before the newest on screen may be
 * written after it, and would else never come.
 *
 * Under the person's own session, so RLS and the database's read functions
 * decide what comes back: a private chat for its two people only, a group
 * from when they joined it, nothing at all for a view session or someone off
 * the staff. The business is the one the app opens for them, the cookie's as
 * @db/session checks it. Two rounds of reads at most for the usual answer,
 * 204 when the list's version is still `v`, the conversation's stamp is
 * still `cv`, and nothing came after the cursor or into the look before it
 * that the screen doesn't hold (`syncBrings`); else 200 with `inbox` (when
 * the version moved) and `open` (whenever `c` was asked), as
 * `chatSyncAnswer` reads it.
 *
 * Changes to messages already on screen (C3): with `m=<marks>&from=<cursor>
 * &x=<ids>&cv=<stamp>`, what the screen holds of every message it has (its
 * newest too) and of the pinned announcements (`chatMarks`), where its
 * messages start (`heldMarks`), the newest of those it shows as removed, and
 * the conversation's own stamp from the last answer, the route reads them
 * again whenever that stamp moved (a message sent, removed, put back or
 * pinned there each moves it, and so does a picture's file going for its days
 * or the business's space, and a confirmation only for its announcement's
 * author, the moderators and the person who confirmed: `public.chat_stamp`,
 * so no worker learns that someone else confirmed) or `r=1` asks (the
 * conversation just came on screen, or the reader's own change just
 * settled). When its own marks differ it sends `open.recent` (the messages
 * removed where the screen's are, however far up, those whose file is no
 * longer kept, and those it showed as removed that were put back, with their
 * words) and `open.pinned`, in place of what the screen has: a removed
 * message is gone, a lost file says so in its picture's place, and an
 * unpinned card goes, with that one answer. A message only read changes nothing there, so
 * nothing old is read again for it; who confirmed is counted for its author
 * and management only, nobody else's sync asks. 401 signed out, never a
 * redirect (the screen reloads into sign-in); 404 for a conversation they
 * don't read (another business's included) and while viewing as someone or
 * with chat off; 400 for a question that isn't one; 403 from another site.
 * Every answer is `no-store`.
 *
 * Outside the proxy's matcher (tooling/proxy.test.ts), as /push/inbox is, so a
 * poll costs one invocation and no extra session check; an expired session is
 * renewed here, its cookies going out with the answer. Nothing is logged but
 * an error's code: never what a message says.
 */
export async function GET(request: Request): Promise<Response> {
  if (!(await sameOriginRequest(request))) return status(403);
  const query = readChatSyncQuery(new URL(request.url).searchParams);
  if (!query) return status(400);

  try {
    const own = await getOwnPlace();
    if (!own) return status(401);
    const place = own.place;
    if (
      own.viewing ||
      !place ||
      !isStaff(place.role) ||
      !place.enabled.includes("chat")
    ) {
      return status(404);
    }
    const businessId = place.businessId;
    const conversationId = query.conversation;
    const after = query.after;
    // The look again before the cursor, when the screen said what it holds.
    const since =
      after && query.held !== null ? syncWindowStart(after.at) : null;

    const [version, stamp, page] = await Promise.all([
      chatVersion(businessId),
      conversationId ? getConversationStamp(businessId, conversationId) : null,
      conversationId
        ? getMessages(
            since
              ? { businessId, conversationId, since }
              : { businessId, conversationId, after },
          )
        : Promise.resolve<ChatMessage[]>([]),
    ]);
    if (version === null) return status(404);
    if (conversationId && !stamp) return status(404);
    const moved = version !== query.version;
    const brings =
      after && since
        ? syncBrings(page, after, query.held ?? 0)
        : page.length > 0;
    // The conversation changed since the screen last heard: what it holds
    // may have too. Read after the stamp, so a change the stamp missed moves
    // it for the next sync.
    const stampMoved =
      stamp !== null && query.marks ? stamp.changed !== query.changed : false;

    let again: { recent: ChatMessage[]; pinned: PinnedAnnouncement[] } | null =
      null;
    if (
      conversationId &&
      stamp &&
      query.marks &&
      (stampMoved || query.recheck)
    ) {
      const from = query.from ?? null;
      const moderates = holdsPermission(
        manifestFor("chat"),
        place.role,
        place.perms,
        "chat.moderate",
      );
      const [marked, shownRemoved, pinned] = await Promise.all([
        after && from
          ? getMarkedMessages({
              businessId,
              conversationId,
              from,
              through: after,
            })
          : Promise.resolve<ChatMessage[]>([]),
        getMessagesById(businessId, conversationId, query.removed ?? []),
        // A private chat has no announcements.
        stamp.kind === "direct"
          ? Promise.resolve<PinnedAnnouncement[]>([])
          : getPinnedState(businessId, conversationId, own.userId, moderates),
      ]);
      const markedHere = withinHeld(marked, from, after);
      if (chatMarks(markedHere, pinned) !== query.marks) {
        const sent = new Set(markedHere.map((m) => m.id));
        const putBack = shownRemoved.filter(
          (m) => !m.removed && !sent.has(m.id),
        );
        again = { recent: [...markedHere, ...putBack], pinned };
      }
    }
    if (!moved && !brings && !again && !stampMoved) return status(204);

    // Oldest first, as the screen adds them; what it holds already merges.
    const oldestFirst = [...page].reverse();
    const [list, seenUpTo, people, messages, recent] = await Promise.all([
      moved ? getChatList(businessId) : null,
      conversationId && stamp?.kind === "direct"
        ? chatSeen(conversationId)
        : null,
      getChatAuthors(
        [
          ...oldestFirst,
          ...(again?.recent ?? []),
          ...(again?.pinned.map((p) => p.message) ?? []),
        ].flatMap((message) => (message.authorId ? [message.authorId] : [])),
      ),
      withOwnDrafts(oldestFirst, own.userId),
      again ? withOwnDrafts(again.recent, own.userId) : null,
    ]);

    const answer: ChatSyncAnswer = {};
    if (list && list !== "notYet") answer.inbox = { version, rows: list };
    if (conversationId) {
      answer.open = {
        conversation: conversationId,
        messages,
        // A whole page after the cursor: some may lie between it and these.
        gap: after !== null && page.length >= CHAT_PAGE_SIZE,
        people,
        seenUpTo,
        cursor: newestCursor(messages, after),
        changed: stamp?.changed ?? null,
        ...(again && recent ? { recent, pinned: again.pinned } : {}),
      };
    }
    return Response.json(answer, { status: 200, headers: NO_STORE });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("chat sync failed", code);
    return status(500);
  }
}
