import {
  documentFileBytes,
  documentIdForFile,
  documentToServe,
  openDocument,
} from "@db/documents";
import { getOwnPlace } from "@db/session";
import { CHAT_PDF_TYPE, chatPdfDisposition } from "@domain/chat-files";
import {
  type DocumentFileRequest,
  documentFileRequest,
} from "@domain/document-files";
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
 * It looks, opens, reads the row, and only then the file (Orel, 12 November
 * 2026: a document's file is served by the server alone). First a look, under
 * the reader's own session (RLS), at the document the address names in the
 * business it names (`documentAsked`), so an address with another business in
 * it opens nothing. Then the document is opened through public.open_document
 * for the signed-in person:
 * the database decides who reads it (private.sees_document), marks a
 * recipient's first opening and settles their line, marks the office's first
 * opening of a document to the business "התקבל בעסק", writes every opening by
 * the office of someone else's document to the access log (once a day per
 * reader), and says what may be served: nothing of a removed one, even within
 * its 10 minutes of undo, so a sick note its sender took back is seen by
 * nobody. Then the document's row, under the reader's own session (RLS),
 * which must say the same, in the business asked for. Only then what it
 * holds: a stored file, read with the server's secret key (the documents
 * bucket has no policy, so nobody reads it straight from Storage or signs a
 * link to it: 20261111000900_documents_server_only.sql) and typed by its
 * bytes; or a demo's sample from public/demo-documents/, by the document's
 * own address only. So every file served follows its line in the log; an
 * opening whose file then can't be read stays logged (the log may hold more
 * than was served, never less). A photo is served inline and a PDF always as
 * a download (`attachment`, its name in UTF-8 with an ASCII fallback). Kept
 * by nobody (`no-store`), in a sandbox, and the same 404 for a document that
 * isn't there, isn't theirs, was removed, or whose file is gone.
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
    const documentId = await documentAsked(asked);
    if (!documentId) return missing();

    // Opened next, before a byte of it is read: the database's word on who
    // reads it and what may be served, in the business asked for.
    const opened = await openDocument(place.userId, documentId);
    if (!opened.ok || opened.value.business !== asked.businessId) {
      return missing();
    }
    const { path, sample } = opened.value;
    if (asked.kind === "file" && path !== asked.path) return missing();
    // Nothing to serve (removed, or its file gone); a demo's sample only by
    // the document's own address.
    if (path === null && (sample === null || asked.kind !== "document")) {
      return missing();
    }

    // Then its row as the reader reads it, which must say the same.
    const row = await documentToServe(asked.businessId, documentId);
    if (!row || row.path !== path || row.sample !== sample) return missing();

    if (path !== null) {
      // Only now the file, with the secret key, typed by its bytes.
      const stored = await documentFileBytes(path);
      if (!stored) return missing();
      if (stored.kind === "pdf") {
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
      return new Response(stored.bytes, {
        status: 200,
        headers: {
          ...DOCUMENT_FILE_HEADERS,
          "Content-Type": stored.type,
          "Content-Disposition": "inline",
        },
      });
    }

    const shown = sample === null ? null : await readSample(sample);
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

/**
 * The document an address names, in the business it names, as the signed-in
 * person reads it (RLS), or null, looked at before anything is opened: an
 * address with another business in it (a document of a second business whose
 * office they are in, say), or one of a document they don't read, opens,
 * marks and logs nothing. By its id, its row in that business
 * (`documentToServe`: the row only, never the bytes); by its stored name, the
 * row in that business that holds that file (`documentIdForFile`).
 */
async function documentAsked(
  asked: DocumentFileRequest,
): Promise<string | null> {
  if (asked.kind === "file") return documentIdForFile(asked.path);
  const row = await documentToServe(asked.businessId, asked.documentId);
  return row ? asked.documentId : null;
}

/** HEAD would open the document (and log it) for nothing: only GET does. */
export function HEAD(): Response {
  return onlyGet();
}
