import { getChatAuthors } from "@db/chat";
import {
  type DocumentSession,
  type DocumentView,
  documentFileBytes,
  documentSession,
  documentToServe,
  getDocumentsToKeep,
  openDocument,
  seeDocumentsNotice,
} from "@db/documents";
import { contentDisposition } from "@domain/chat-files";
import { downloadsDocuments } from "@domain/document-files";
import {
  csvOf,
  DOCUMENTS_DOWNLOAD_MAX,
  type DocumentsDownload,
  documentsDownloadOf,
  downloadAsciiName,
  downloadEntryName,
  downloadListName,
  downloadName,
} from "@domain/documents-download";
import { localDateTime } from "@domain/payroll-export";
import { monthRange } from "@domain/time-clock";
import { requestOrigin } from "@/app/origin";
import {
  type DocumentsAccess,
  documentsAccess,
} from "../../(app)/chat/documents/documents-access";
import { currentWording } from "../../(app)/current-wording";
import { type Translator, translator } from "../../(app)/wording";
import {
  DOCUMENT_FILE_HEADERS,
  missing,
  onlyPost,
  readSample,
} from "../served";
import { StoredZip } from "./stored-zip";

/** The form's fields: one short field, never a file. */
const FORM_MAX_BYTES = 1024;

/**
 * "הורדת כל המסמכים" (chat C7; Orel, 11 November 2026): the free plan keeps
 * no backup, so the office takes its own copy. A POST from the documents
 * page's own form, with one field: `person=<id>` (that person's documents:
 * theirs to the business and every one sent to them) or `month=YYYY-MM`
 * (every document sent that month, in the business's clock), nothing in the
 * address. Every one of them, read page by page, as far as
 * `DOCUMENTS_DOWNLOAD_MAX` (past it the list says so). For the office only
 * (owners, accountants and pay holders), never a view session.
 *
 * Never a link: a download opens every document in it (a document to the
 * business nobody in the office had opened is marked "התקבל בעסק" and its
 * reminder settled for the whole office), so a link posted in a chat or sent
 * from outside the browser must not set one off. Only a POST whose
 * `Sec-Fetch-Site` is `same-origin` and whose `Origin` is the app's own
 * (`downloadsDocuments`); GET and HEAD are refused (405) and anything else is
 * 404, the same as for nothing, before anything is read.
 *
 * One ZIP, streamed as it is built, holding one file at a time: each
 * document's file still kept or its demo sample, oldest first and numbered,
 * taken as the route that serves one takes it (each one an opening, in the
 * access log as the office reads it): opened first through
 * public.open_document, then its row read under the reader's own session,
 * and only then its file, read with the server's secret key (nobody reads
 * the documents bucket directly); then "רשימת המסמכים.csv", the list of them all,
 * removed ones too (with why), each document to people once per recipient
 * with their marks. Its words are the business's (`app.chat.documents.download`).
 * Kept by nobody, a download only, in a sandbox. Taking it also reads the
 * office's notice to keep a copy.
 *
 * Everything that needs the request (who is asking, the documents, the
 * words, the reader's session) is read before the answer starts; while it
 * streams, each document is opened with the secret key for that person
 * (public.open_document), its row read under the session made here, and its
 * file read with the secret key.
 */
export async function POST(request: Request): Promise<Response> {
  if (
    !downloadsDocuments(
      {
        method: request.method,
        secFetchSite: request.headers.get("sec-fetch-site"),
        origin: request.headers.get("origin"),
      },
      await requestOrigin(),
    )
  ) {
    return missing();
  }
  if (new URL(request.url).search !== "") return missing();
  const download = await downloadAsked(request);
  if (!download) return missing();
  const access = await documentsAccess();
  if (!access || access.viewing || !access.office) return missing();

  let documents: DocumentView[];
  let more: boolean;
  try {
    const read = await getDocumentsToKeep(
      access.businessId,
      "month" in download
        ? {
            sentFrom: monthRange(download.month, access.timeZone).from,
            sentBefore: monthRange(download.month, access.timeZone).to,
          }
        : { person: download.person },
      DOCUMENTS_DOWNLOAD_MAX,
    );
    if (read === "notYet") return missing();
    documents = read.documents;
    more = read.more;
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error(
      "documents for a download could not be read",
      code ?? "without a code",
    );
    return missing();
  }

  const people = await namesOf(
    documents.flatMap((document) => [
      ...(document.personId ? [document.personId] : []),
      ...(document.authorId ? [document.authorId] : []),
      ...document.recipients.map((mark) => mark.personId),
    ]),
  );
  const t = translator(await currentWording(), "app.chat.documents");
  const what =
    "month" in download
      ? download.month
      : (people.get(download.person) ?? t("download.noName"));
  const name = downloadName(
    t("download.name", { business: access.businessName, what }),
  );

  // The download is the copy the notice asks for: it is read, best effort.
  await seeDocumentsNotice(access.userId, access.businessId).catch(() => null);

  // The reader's session, made now: the rows are read while the answer
  // streams, after this handler has returned and its cookies with it.
  const session = await documentSession();
  const parts = archive(documents, more, download, access, t, people, session);
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await parts.next();
        if (next.done) controller.close();
        else controller.enqueue(next.value);
      } catch (error) {
        const code = (error as { code?: string } | null)?.code;
        console.error("a documents download stopped", code ?? "without a code");
        controller.error(error);
      }
    },
    async cancel() {
      await parts.return(undefined);
    },
  });
  return new Response(body, {
    status: 200,
    headers: {
      ...DOCUMENT_FILE_HEADERS,
      "Content-Type": "application/zip",
      "Content-Disposition": contentDisposition(name, {
        disposition: "attachment",
        fallback: downloadAsciiName(access.businessSlug, download),
      }),
    },
  });
}

/**
 * A link (a GET, followed from a chat message, an email or another site)
 * downloads nothing and opens nothing: only the page's own form does.
 */
export function GET(): Response {
  return onlyPost();
}

/** HEAD opens nothing either. */
export function HEAD(): Response {
  return onlyPost();
}

/**
 * The download the form asked for: its one field, as a form sends it
 * (`application/x-www-form-urlencoded`, a few bytes), or null.
 */
async function downloadAsked(
  request: Request,
): Promise<DocumentsDownload | null> {
  const type = request.headers.get("content-type") ?? "";
  if (!/^application\/x-www-form-urlencoded\b/i.test(type)) return null;
  const length = Number(request.headers.get("content-length") ?? "0");
  if (!Number.isFinite(length) || length > FORM_MAX_BYTES) return null;
  let body: string;
  try {
    body = await request.text();
  } catch {
    return null;
  }
  if (body.length > FORM_MAX_BYTES) return null;
  return documentsDownloadOf(new URLSearchParams(body));
}

/** The names of the people a download names, a hundred to a read. */
async function namesOf(
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const wanted = [...new Set(ids.map((id) => id.toLowerCase()))];
  const names = new Map<string, string | null>();
  for (let at = 0; at < wanted.length; at += 100) {
    const found = await getChatAuthors(wanted.slice(at, at + 100)).catch(
      () => [],
    );
    for (const person of found) names.set(person.id, person.name);
  }
  return names;
}

type Words = Translator<"app.chat.documents">;

/** A document's file as it goes into the archive, or why it doesn't. */
type ArchivedFile =
  | { data: Uint8Array; extension: "pdf" | "jpg" | "webp" }
  | { gone: "removed" | "missing" };

/** Reads a PDF's stream whole: one file of at most 10 MiB at a time. */
async function wholeOf(
  stream: ReadableStream<Uint8Array>,
): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    length += value.length;
  }
  const bytes = new Uint8Array(length);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  return bytes;
}

/**
 * One document's file for the archive, as the route that shows one serves it:
 * opened first through public.open_document (the database decides, marks and
 * logs, and says what may be served: nothing of a removed one), then its row
 * read under the reader's own session, which must say the same, and only
 * then its file, with the secret key, or its sample, whole in hand. An
 * opening whose file then can't be read stays logged, and the list says the
 * file isn't in the download. A removed one goes in the list only, opened by
 * nothing.
 */
async function fileOf(
  document: DocumentView,
  access: DocumentsAccess,
  session: DocumentSession,
): Promise<ArchivedFile> {
  if (document.removedAt !== null) return { gone: "removed" };
  if (document.src === null) return { gone: "missing" };
  try {
    const opened = await openDocument(access.userId, document.id);
    if (!opened.ok || opened.value.business !== access.businessId) {
      return { gone: "missing" };
    }
    const { path, sample } = opened.value;
    if (path === null && sample === null) return { gone: "missing" };
    const row = await documentToServe(access.businessId, document.id, session);
    if (!row || row.path !== path || row.sample !== sample) {
      return { gone: "missing" };
    }
    if (path !== null) {
      const stored = await documentFileBytes(path, session);
      if (!stored) return { gone: "missing" };
      return stored.kind === "pdf"
        ? { data: await wholeOf(stored.body), extension: "pdf" }
        : {
            data: stored.bytes,
            extension: stored.type === "image/webp" ? "webp" : "jpg",
          };
    }
    const shown = sample === null ? null : await readSample(sample);
    if (!shown) return { gone: "missing" };
    return {
      data: shown.bytes,
      extension: shown.kind === "pdf" ? "pdf" : "webp",
    };
  } catch (error) {
    const code = (error as { code?: string } | null)?.code;
    console.error(
      "a document for a download could not be read",
      code ?? "without a code",
    );
    return { gone: "missing" };
  }
}

/**
 * The archive's bytes, as they are made: each file, then the list, then its
 * end. `more`: there were documents past `DOCUMENTS_DOWNLOAD_MAX`, which the
 * list's last line says.
 */
async function* archive(
  documents: readonly DocumentView[],
  more: boolean,
  download: DocumentsDownload,
  access: DocumentsAccess,
  t: Words,
  people: ReadonlyMap<string, string | null>,
  session: DocumentSession,
): AsyncGenerator<Uint8Array> {
  const zip = new StoredZip(new Date());
  const zone = access.timeZone;
  const when = (instant: string) =>
    localDateTime(instant, zone).replace("T", " ");
  const nameOf = (id: string | null) =>
    (id ? people.get(id) : null) ?? t("download.noName");
  const rows: string[][] = [
    [
      t("download.columns.number"),
      t("download.columns.person"),
      t("download.columns.direction"),
      t("download.columns.category"),
      t("download.columns.title"),
      t("download.columns.note"),
      t("download.columns.sentAt"),
      t("download.columns.sentBy"),
      t("download.columns.openedAt"),
      t("download.columns.confirmedAt"),
      t("download.columns.file"),
    ],
  ];

  let number = 0;
  for (const document of documents) {
    number += 1;
    const category = t(`categories.${document.category}`);
    const file = await fileOf(document, access, session);
    let fileCell: string;
    if ("data" in file) {
      const entry = downloadEntryName(
        number,
        [
          when(document.sentAt).slice(0, 10),
          ...(document.direction === "from_person"
            ? [nameOf(document.personId)]
            : []),
          category,
          ...(document.title !== category ? [document.title] : []),
        ],
        file.extension,
      );
      yield* zip.entry(entry, file.data);
      fileCell = entry;
    } else if (file.gone === "removed" && document.removedReason !== null) {
      fileCell = t("download.removed", {
        reason: t(`reasons.${document.removedReason}`),
      });
    } else {
      fileCell = t("download.missing");
    }

    const shared = {
      direction: t(`download.directions.${document.direction}`),
      sentAt: when(document.sentAt),
      sentBy: nameOf(document.authorId),
    };
    const row = (
      person: string | null,
      opened: string | null,
      confirmed: string,
    ) => [
      String(number),
      nameOf(person),
      shared.direction,
      category,
      document.title,
      document.note ?? "",
      shared.sentAt,
      shared.sentBy,
      opened ? when(opened) : t("download.notOpened"),
      confirmed,
      fileCell,
    ];
    if (document.direction === "from_person") {
      rows.push(
        row(document.personId, document.openedAt, t("download.notAsked")),
      );
      continue;
    }
    const marks =
      "person" in download
        ? document.recipients.filter(
            (mark) => mark.personId === download.person,
          )
        : document.recipients;
    for (const mark of marks) {
      rows.push(
        row(
          mark.personId,
          mark.openedAt,
          !document.asksConfirmation
            ? t("download.notAsked")
            : mark.confirmedAt
              ? when(mark.confirmedAt)
              : t("download.notConfirmed"),
        ),
      );
    }
  }

  if (more) {
    rows.push([t("download.more", { count: DOCUMENTS_DOWNLOAD_MAX })]);
  }

  yield* zip.entry(downloadListName(t("download.list")), csvOf(rows));
  yield* zip.end();
}
