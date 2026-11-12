import { DOCUMENTS_DOWNLOAD_PATH } from "@domain/documents-download";

/**
 * The documents' addresses (chat C7), for the server and the browser alike:
 * a plain file, so a server view never gets a client reference for a value
 * (tooling/client-values.test.ts). `documentsPathsAt` gives them under
 * another base: the design demo's mock screens (/design/chat/documents),
 * whose downloads lead nowhere.
 */
export type DocumentsPaths = {
  list: string;
  /** One person's documents, the office's list (`?person=`). */
  person: (id: string) => string;
  document: (id: string) => string;
  /** A document just sent, with its "ביטול" (`?sent=1`). */
  sent: (id: string) => string;
  send: (to: "business" | "people") => string;
  /**
   * Where "הורדת כל המסמכים" posts its form (a person's or a month's, with
   * `documentsDownloadField`), never a link; null where nothing downloads.
   */
  download: string | null;
};

export function documentsPathsAt(base: string): DocumentsPaths {
  return {
    list: base,
    person: (id) => `${base}?person=${encodeURIComponent(id)}`,
    document: (id) => `${base}/${encodeURIComponent(id)}`,
    sent: (id) => `${base}/${encodeURIComponent(id)}?sent=1`,
    send: (to) => `${base}/send?to=${to}`,
    download: base === DOCUMENTS_BASE ? DOCUMENTS_DOWNLOAD_PATH : null,
  };
}

/** The app's own base: a client screen makes its paths from it (`documentsPathsAt`). */
export const DOCUMENTS_BASE = "/chat/documents";

export const documentsPaths = documentsPathsAt(DOCUMENTS_BASE);
