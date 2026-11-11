import {
  CHAT_PAGE_SIZE,
  type ChatMessage,
  chatSeen,
  chatVersion,
  getChatAuthors,
  getChatList,
  getConversationKind,
  getMessages,
  withOwnDrafts,
} from "@db/chat";
import { getOwnPlace } from "@db/session";
import {
  type ChatSyncAnswer,
  newestCursor,
  readChatSyncQuery,
  syncBrings,
  syncWindowStart,
} from "@domain/chat-sync";
import { isStaff } from "@domain/modules";
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
 * 204 when the list's version is still `v` and nothing came after the cursor
 * or into the look before it that the screen doesn't hold (`syncBrings`);
 * else 200 with `inbox` (when the version moved) and `open` (whenever `c` was
 * asked), as `chatSyncAnswer` reads it. 401 signed out, never a redirect (the
 * screen reloads into sign-in); 404 for a conversation they don't read
 * (another business's included) and while viewing as someone or with chat
 * off; 400 for a question that isn't one; 403 from another site. Every answer
 * is `no-store`.
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

    const [version, kind, page] = await Promise.all([
      chatVersion(businessId),
      conversationId ? getConversationKind(businessId, conversationId) : null,
      conversationId
        ? getMessages(
            since
              ? { businessId, conversationId, since }
              : { businessId, conversationId, after },
          )
        : Promise.resolve<ChatMessage[]>([]),
    ]);
    if (version === null) return status(404);
    if (conversationId && !kind) return status(404);
    const moved = version !== query.version;
    const brings =
      after && since
        ? syncBrings(page, after, query.held ?? 0)
        : page.length > 0;
    if (!moved && !brings) return status(204);

    // Oldest first, as the screen adds them; what it holds already merges.
    const oldestFirst = [...page].reverse();
    const [list, seenUpTo, people, messages] = await Promise.all([
      moved ? getChatList(businessId) : null,
      conversationId && kind === "direct" ? chatSeen(conversationId) : null,
      getChatAuthors(
        oldestFirst.flatMap((message) =>
          message.authorId ? [message.authorId] : [],
        ),
      ),
      withOwnDrafts(oldestFirst, own.userId),
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
