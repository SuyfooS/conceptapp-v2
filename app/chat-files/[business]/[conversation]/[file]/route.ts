import { chatFileBytes, chatPdfDownload } from "@db/chat-files";
import { isUuid } from "@domain/activity";
import {
  CHAT_PDF_TYPE,
  chatFileKindOf,
  chatPdfDisposition,
  isChatFileName,
  isChatFilePath,
  parseChatFilePath,
} from "@domain/chat-files";
import { FILE_CONTENT_POLICY } from "@domain/security-headers";

/** Nothing here for this person: the same answer whether it exists or not. */
function missing(): Response {
  return new Response(null, {
    status: 404,
    headers: { "Cache-Control": "private, no-store" },
  });
}

/** A read that failed, logged by its code alone: never a file's name. */
function failed(error: unknown): Response {
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "without a code";
  console.error("a chat file could not be read", code);
  return missing();
}

/**
 * A chat file (C4: a picture or its thumbnail; C5: a PDF), as the signed-in
 * person may see it (`chatFileSrc` points here), the way /list-photos serves
 * lists' photos. Read under their own session, so the database decides twice:
 * the message pointing at it is one they read (a private chat's for its two
 * people alone, a group's from when they joined it, never for an owner, the
 * team or a view session as such), not removed and its file still kept, and
 * the bucket's policy says the same of the file. Anything else, another
 * business's file included, is not found. Its type comes from its bytes and
 * must be the path's extension and the message's kind. The browser keeps it
 * privately for a week (a path is random and never used again, so it is
 * never stale, and Storage's and Vercel's transfer stay small), never through
 * the image optimizer, and reads it only as what it is: no script runs from
 * it and no other site embeds it (`FILE_HEADERS` in @domain/security-headers,
 * also set by next.config.ts). A picture is shown inline, by `<img>` only. A
 * PDF is always a download (`attachment`, its name in UTF-8 with an ASCII
 * fallback, `chatPdfDisposition`), so the phone opens it in its own viewer,
 * never as a page of the app; it is streamed on from Storage as it comes, up
 * to 10 MiB.
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
  const parts = parseChatFilePath(path);
  if (
    !parts ||
    !isChatFilePath(path, {
      businessId: business,
      conversationId: conversation,
    })
  ) {
    return missing();
  }

  if (chatFileKindOf(parts.extension) === "pdf") {
    let pdf: Awaited<ReturnType<typeof chatPdfDownload>>;
    try {
      pdf = await chatPdfDownload(path);
    } catch (error) {
      return failed(error);
    }
    if (!pdf) return missing();
    return new Response(pdf.body, {
      status: 200,
      headers: {
        "Content-Type": CHAT_PDF_TYPE,
        "Content-Disposition": chatPdfDisposition(pdf.name),
        "Cache-Control": "private, max-age=604800",
        "Accept-Ranges": "none",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": FILE_CONTENT_POLICY,
        "Cross-Origin-Resource-Policy": "same-origin",
      },
    });
  }

  let found: Awaited<ReturnType<typeof chatFileBytes>>;
  try {
    found = await chatFileBytes(path);
  } catch (error) {
    return failed(error);
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
