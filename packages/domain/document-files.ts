import { isUuid } from "./activity";
import {
  type DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type DocumentDirection,
  type DocumentSample,
  isDocumentFilePath,
  isDocumentSample,
} from "./documents";

/*
 * How the app opens a document's file (chat C7): `/document-files`, under the
 * reader's own session, which first opens the document through
 * public.open_document (a recipient's opening marked, the office's logged,
 * plan §6.3), then serves its file from Storage, or a demo's sample from the
 * app's own files.
 */

/**
 * A demo business's samples: what each one is, as `public/demo-documents/`
 * holds them (tooling/demo-documents.mjs makes them, fake and marked as
 * samples). Served by /document-files only for a document whose `sample` it
 * is, never by its own address in a screen.
 */
export const DOCUMENT_SAMPLE_FILES = {
  payslip: { file: "payslip.pdf", kind: "pdf", type: "application/pdf" },
  procedure: { file: "procedure.pdf", kind: "pdf", type: "application/pdf" },
  sick_note: { file: "sick-note.webp", kind: "image", type: "image/webp" },
} as const satisfies Record<
  DocumentSample,
  {
    file: string;
    kind: "image" | "pdf";
    type: "application/pdf" | "image/webp";
  }
>;

/** The folder under `public/` the samples are in. */
export const DOCUMENT_SAMPLE_FOLDER = "demo-documents";

/** A sample's largest size: what tooling/demo-documents.test.ts holds them to. */
export const DOCUMENT_SAMPLE_MAX_BYTES = 100 * 1024;

/**
 * The categories a demo business sends each way (plan §13): its documents are
 * samples, and public.send_document takes only a sample of the document's own
 * category, so these, each with its own.
 */
export const DEMO_DOCUMENT_CATEGORIES = {
  from_person: ["sick_note"],
  to_people: ["payslip", "procedure"],
} as const satisfies {
  [D in DocumentDirection]: readonly (typeof DOCUMENT_CATEGORIES)[D][number][];
};

/** The sample a category is sent with in a demo business, or null for none. */
export function documentSampleOf(
  category: DocumentCategory,
): DocumentSample | null {
  return isDocumentSample(category) ? category : null;
}

/** What a sample or a stored file is shown as: a picture inline, or a PDF to download. */
export function documentSampleKind(sample: DocumentSample): "image" | "pdf" {
  return DOCUMENT_SAMPLE_FILES[sample].kind;
}

/**
 * Where the app opens a document (`/document-files/<business>/<id>`): its
 * stored file or its sample, as the reader may have it. Every document the
 * screens show a file for has this one address; the route asks the database
 * what is there, and the same 404 answers a document that is gone, isn't
 * theirs or never was.
 */
export function documentSrc(businessId: string, documentId: string): string {
  return `/document-files/${businessId.toLowerCase()}/${documentId.toLowerCase()}`;
}

/**
 * What `/document-files/<business>/<file>` asks for: a stored file by its own
 * name (`<32 hex>.<pdf|webp|jpg>`, C6's `documentFileSrc`), or a document by
 * its id (`documentSrc`). Lower case only, in the business's own folder; null
 * for anything else.
 */
export type DocumentFileRequest =
  | { kind: "file"; businessId: string; path: string }
  | { kind: "document"; businessId: string; documentId: string };

export function documentFileRequest(
  business: string,
  file: string,
): DocumentFileRequest | null {
  if (!isUuid(business) || business !== business.toLowerCase()) return null;
  if (isUuid(file)) {
    return file === file.toLowerCase()
      ? { kind: "document", businessId: business, documentId: file }
      : null;
  }
  const path = `${business}/${file}`;
  return isDocumentFilePath(path, business)
    ? { kind: "file", businessId: business, path }
    : null;
}

/**
 * Whether a request for a document's file may open it (plan §6.3): one the
 * app's own pages made (`Sec-Fetch-Site: same-origin`: a link, a picture on
 * the document's page) or the person typed or followed from outside the
 * browser (`none`), and not a prefetch. Anything else, a link or a picture on
 * another site included, and a browser that says nothing, is answered as a
 * file that isn't there: it would mark the document opened and write the
 * office's log for whoever followed it.
 */
export function opensDocument(headers: {
  secFetchSite: string | null;
  purpose: string | null;
  nextPrefetch: boolean;
}): boolean {
  if (headers.nextPrefetch || /prefetch/i.test(headers.purpose ?? "")) {
    return false;
  }
  return (
    headers.secFetchSite === "same-origin" || headers.secFetchSite === "none"
  );
}

/**
 * Whether a request may download many documents at once ("הורדת כל
 * המסמכים", C7): a POST the app's own page sent with its form, never a link.
 * One download opens every document in it (each marked "התקבל בעסק" when the
 * office hadn't opened it, and logged), so a link anyone could post in a chat
 * or send from outside the browser must open nothing: `Sec-Fetch-Site`
 * exactly `same-origin` (not `none`, nor a browser that says nothing), and
 * `Origin` exactly the app's own.
 */
export function downloadsDocuments(
  request: {
    method: string;
    secFetchSite: string | null;
    origin: string | null;
  },
  ownOrigin: string,
): boolean {
  return (
    request.method === "POST" &&
    request.secFetchSite === "same-origin" &&
    request.origin !== null &&
    request.origin === ownOrigin
  );
}
