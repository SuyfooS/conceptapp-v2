import {
  documentFileBytes,
  documentIdForFile,
  documentToServe,
  openDocument,
} from "@db/documents";
import { getOwnPlace } from "@db/session";
import { CHAT_PDF_TYPE, chatPdfDisposition } from "@domain/chat-files";
import { documentFileRequest } from "@domain/document-files";
import {
  DOCUMENT_FILE_HEADERS,
  failed,
  mayOpen,
  missing,
  onlyGet,
  readSample,
} from "../../served";

/**
 * A document's file (chat C7, plan §6.3): `/document-files/<business>/<id>`
 * (`documentSrc`, what the screens use: the document's own file or its demo
 * sample) or `/document-files/<business>/<32 hex>.<pdf|webp|jpg>` (C6's
 * `documentFileSrc`, a stored file by its name), as the signed-in person may
 * have it. It answers only a request the app's own pages made or the person
 * typed (`Sec-Fetch-Site` same-origin or none), never a prefetch, so a link
 * or a picture on another site can't make the office's browser log an
 * opening or mark a document opened; and never a view session.
 *
 * It reads first and opens last. The document's row, under the reader's own
 * session (RLS: a document they read, never a removed one, even within its
 * 10 minutes of undo, so a sick note its sender took back is seen by nobody),
 * then what it holds: a stored file, read under the same session (the row
 * again and the bucket's policy), typed by its bytes; or a demo's sample from
 * public/demo-documents/, by the document's own address only. Only with that
 * in hand does it open the document through public.open_document for the
 * signed-in person (the database decides again: a recipient's first opening
 * marked and their line settled, the office's first opening of a document to
 * the business marked "התקבל בעסק", and every opening by the office of
 * someone else's document written to the access log, once a day per reader),
 * so a file that can't be given marks and logs nothing. A photo is served
 * inline and a PDF always as a download (`attachment`, its name in UTF-8 with
 * an ASCII fallback). Kept by nobody (`no-store`), in a sandbox, and the same
 * 404 for a document that isn't there, isn't theirs, was removed, or whose
 * file is gone.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ business: string; file: string }> },
): Promise<Response> {
  if (!mayOpen(request)) return missing();
  const { business, file } = await params;
  const asked = documentFileRequest(business, file);
  if (!asked) return missing();

  try {
    const place = await getOwnPlace();
    if (!place || place.viewing) return missing();
    const documentId =
      asked.kind === "document"
        ? asked.documentId
        : await documentIdForFile(asked.path);
    if (!documentId) return missing();

    const row = await documentToServe(asked.businessId, documentId);
    if (!row) return missing();
    if (asked.kind === "file" && row.path !== asked.path) return missing();
    // A demo's sample only by the document's own address.
    if (row.path === null && asked.kind !== "document") return missing();

    // What there is to give, read before anything is marked or logged.
    const stored = row.path !== null ? await documentFileBytes(row.path) : null;
    const shown =
      row.path === null && row.sample !== null
        ? await readSample(row.sample)
        : null;
    if (!stored && !shown) return missing();

    // Opened only now, with the file in hand: the database's word must be
    // the row's own, in the business asked for.
    const opened = await openDocument(place.userId, documentId);
    if (
      !opened.ok ||
      opened.value.business !== asked.businessId ||
      opened.value.path !== row.path ||
      opened.value.sample !== row.sample
    ) {
      if (stored?.kind === "pdf") {
        await stored.body.cancel().catch(() => undefined);
      }
      return missing();
    }

    if (stored?.kind === "pdf") {
      return new Response(stored.body, {
        status: 200,
        headers: {
          ...DOCUMENT_FILE_HEADERS,
          "Content-Type": CHAT_PDF_TYPE,
          "Content-Disposition": chatPdfDisposition(stored.name),
          "Accept-Ranges": "none",
        },
      });
    }
    if (stored) {
      return new Response(stored.bytes, {
        status: 200,
        headers: {
          ...DOCUMENT_FILE_HEADERS,
          "Content-Type": stored.type,
          "Content-Disposition": "inline",
        },
      });
    }
    if (!shown) return missing();
    return new Response(shown.bytes, {
      status: 200,
      headers: {
        ...DOCUMENT_FILE_HEADERS,
        "Content-Type": shown.type,
        "Content-Disposition":
          shown.kind === "pdf" ? chatPdfDisposition(row.title) : "inline",
      },
    });
  } catch (error) {
    return failed(error);
  }
}

/** HEAD would open the document (and log it) for nothing: only GET does. */
export function HEAD(): Response {
  return onlyGet();
}
