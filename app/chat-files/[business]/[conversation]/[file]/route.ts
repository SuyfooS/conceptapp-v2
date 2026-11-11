import { chatFileBytes } from "@db/chat-files";
import { isUuid } from "@domain/activity";
import { isChatFileName, isChatFilePath } from "@domain/chat-files";
import { FILE_CONTENT_POLICY } from "@domain/security-headers";

/** Nothing here for this person: the same answer whether it exists or not. */
function missing(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/**
 * A chat file (C4: a picture or its thumbnail), as the signed-in person may
 * see it (`chatFileSrc` points here), the way /list-photos serves lists'
 * photos. Read under their own session, so the database decides twice: the
 * message pointing at it is one they read (a private chat's for its two people
 * alone, a group's from when they joined it, never for an owner, the team or a
 * view session as such), not removed and its file still kept, and the
 * bucket's policy says the same of the file. Anything else, another business's
 * file included, is not found. Its type comes from its bytes and must be the
 * path's and the message's. The browser keeps it privately for a week (a path
 * is random and never used again, so it is never stale, and Storage's and
 * Vercel's transfer stay small), never through the image optimizer, and reads
 * it only as a picture: no script runs from it and no other site embeds it
 * (`FILE_HEADERS` in @domain/security-headers, also set by next.config.ts).
 * PDFs (C5) will be a download.
 */
export async function GET(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ business: string; conversation: string; file: string }>;
  },
): Promise<Response> {
  const { business, conversation, file } = await params;
  // Each part on its own first: the path rule alone would read a crafted
  // name differently from the folders it is given.
  if (
    !isUuid(business) ||
    !isUuid(conversation) ||
    business !== business.toLowerCase() ||
    conversation !== conversation.toLowerCase() ||
    !isChatFileName(file)
  ) {
    return missing();
  }
  const path = `${business}/${conversation}/${file}`;
  if (
    !isChatFilePath(path, {
      businessId: business,
      conversationId: conversation,
    })
  ) {
    return missing();
  }

  let found: Awaited<ReturnType<typeof chatFileBytes>>;
  try {
    found = await chatFileBytes(path);
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code: unknown }).code)
        : "without a code";
    console.error("a chat file could not be read", code);
    return missing();
  }
  if (!found) return missing();
  return new Response(found.bytes, {
    status: 200,
    headers: {
      "Content-Type": found.type,
      "Cache-Control": "private, max-age=604800",
      "Content-Disposition": "inline",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": FILE_CONTENT_POLICY,
      "Cross-Origin-Resource-Policy": "same-origin",
    },
  });
}
