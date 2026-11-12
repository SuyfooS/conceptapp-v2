// Mock rows for the documents' demo (chat C7): the demo restaurant's official
// documents on its Tuesday morning, as the owner (the office), Noa (on the
// staff) and Shiran (a manager who sends documents) each read them. They
// stand in for database rows (titles and notes people wrote), so their Hebrew
// stays here; tooling/hebrew-literals.ts allows this file. The files are the
// demo businesses' own samples (public/demo-documents/), fake and marked as
// samples.

import type { DocumentRecipientMark } from "@domain/documents";
import {
  type DocumentShown,
  documentMonths,
  documentPeople,
} from "@domain/documents-screen";
import type {
  DocumentPageData,
  DocumentPeople,
  DocumentSendData,
  DocumentsScreenData,
} from "../../../(app)/chat/documents/document-screen-types";
import { demoAccountantName } from "../../shell/clock/pay/data";
import {
  CHAT_DEMO_NOW,
  CHAT_DEMO_TODAY,
  CHAT_DEMO_ZONE,
  chatDemoPeople,
} from "../data";

/** Who reads each version of the demo. */
export type DocumentsDemoReader = "office" | "staff" | "manager";

const READERS: Record<DocumentsDemoReader, { id: string; office: boolean }> = {
  office: { id: "uri", office: true },
  staff: { id: "noa", office: false },
  manager: { id: "shiran", office: false },
};

export const documentsDemoClock = {
  timeZone: CHAT_DEMO_ZONE,
  today: CHAT_DEMO_TODAY,
  now: CHAT_DEMO_NOW,
};

const SICK_NOTE = "/demo-documents/sick-note.webp";
const PAYSLIP = "/demo-documents/payslip.pdf";
const PROCEDURE = "/demo-documents/procedure.pdf";

const mark = (
  documentId: string,
  personId: string,
  openedAt: string | null = null,
  confirmedAt: string | null = null,
): DocumentRecipientMark => ({ documentId, personId, openedAt, confirmedAt });

function row(
  fields: Partial<DocumentShown> &
    Pick<DocumentShown, "id" | "direction" | "category" | "title" | "sentAt">,
): DocumentShown {
  return {
    personId: null,
    authorId: null,
    note: null,
    asksConfirmation: false,
    openedAt: null,
    openedBy: null,
    removedAt: null,
    removedBy: null,
    removedReason: null,
    fileGoneAfter: null,
    hasFile: true,
    fileKind: "pdf",
    fileName: null,
    fileSize: null,
    fileSrc: null,
    sample: null,
    recipients: [],
    src: null,
    shownKind: "pdf",
    ...fields,
  };
}

/** Every document of the demo, newest first, as the office reads them. */
const ALL: DocumentShown[] = [
  row({
    id: "sick-note",
    direction: "from_person",
    personId: "noa",
    authorId: "noa",
    category: "sick_note",
    title: "אישור מחלה ליום שני",
    note: "הייתי אצל הרופאה. חוזרת לעבודה ביום רביעי.",
    sentAt: "2026-11-03T05:31:00.000Z",
    fileKind: "image",
    fileSize: 182_400,
    src: SICK_NOTE,
    shownKind: "image",
  }),
  row({
    id: "procedure",
    direction: "to_people",
    authorId: "shiran",
    category: "procedure",
    title: "נוהל סגירת קופה",
    note: "מהשבוע הבא סוגרים את הקופה ב-22:00. כדאי לקרוא עד הסוף.",
    asksConfirmation: true,
    sentAt: "2026-11-02T10:00:00.000Z",
    fileName: "נוהל סגירת קופה.pdf",
    fileSize: 96_300,
    src: PROCEDURE,
    recipients: [
      mark("procedure", "noa", "2026-11-02T12:10:00.000Z"),
      mark(
        "procedure",
        "yoav",
        "2026-11-02T11:00:00.000Z",
        "2026-11-02T11:02:00.000Z",
      ),
      mark("procedure", "maya"),
      mark("procedure", "itay"),
    ],
  }),
  row({
    id: "payslip",
    direction: "to_people",
    authorId: "galit",
    category: "payslip",
    title: "תלוש שכר אוקטובר",
    asksConfirmation: true,
    sentAt: "2026-11-01T08:00:00.000Z",
    fileName: "תלוש אוקטובר.pdf",
    fileSize: 64_800,
    src: PAYSLIP,
    recipients: [mark("payslip", "noa")],
  }),
  row({
    id: "vacation",
    direction: "from_person",
    personId: "shiran",
    authorId: "shiran",
    category: "form",
    title: "בקשה לחופשה בדצמבר",
    sentAt: "2026-10-30T14:20:00.000Z",
    openedAt: "2026-10-30T16:00:00.000Z",
    openedBy: "uri",
    fileName: "חופשה.pdf",
    fileSize: 41_200,
    src: PROCEDURE,
  }),
  row({
    id: "form-yoav",
    direction: "from_person",
    personId: "yoav",
    authorId: "yoav",
    category: "form",
    title: "טופס 101",
    sentAt: "2026-10-28T09:00:00.000Z",
    openedAt: "2026-10-28T12:00:00.000Z",
    openedBy: "galit",
    fileName: "טופס 101.pdf",
    fileSize: 210_500,
    src: PAYSLIP,
  }),
  row({
    id: "maya-other",
    direction: "from_person",
    personId: "maya",
    authorId: "maya",
    category: "other",
    title: "אישור לימודים",
    sentAt: "2026-10-27T07:45:00.000Z",
    removedAt: "2026-10-27T09:00:00.000Z",
    removedBy: "uri",
    removedReason: "wrong_file",
    fileGoneAfter: "2026-10-27T09:10:00.000Z",
    hasFile: false,
    fileKind: null,
    shownKind: null,
  }),
];

/** The names the documents name: the team's, and the accountant's. */
export const documentsDemoPeople: DocumentPeople = {
  ...Object.fromEntries(
    chatDemoPeople.map((p) => [
      p.id,
      { name: p.name, photo: p.photo, former: false },
    ]),
  ),
  galit: { name: demoAccountantName, photo: null, former: false },
};

/**
 * The documents as `reader` reads them, as the database would give them: the
 * office every one with every mark; anyone else their own both ways (only
 * their own mark on what was sent to them), never a removed one sent to
 * them, and what they sent with its marks.
 */
function readBy(reader: DocumentsDemoReader): {
  documents: DocumentShown[];
  sent: DocumentShown[];
} {
  const { id, office } = READERS[reader];
  if (office) return { documents: ALL, sent: [] };
  const documents = ALL.flatMap((document) => {
    if (document.direction === "from_person") {
      return document.personId === id ? [document] : [];
    }
    const own = document.recipients.filter((r) => r.personId === id);
    if (own.length === 0 || document.removedAt !== null) return [];
    return [{ ...document, recipients: own }];
  });
  const sent = ALL.filter(
    (document) =>
      document.direction === "to_people" && document.authorId === id,
  );
  return { documents, sent };
}

/** `/design/chat/documents`: the list, for each reader. */
export function documentsDemoScreen(
  reader: DocumentsDemoReader,
  options: { empty?: boolean; notice?: boolean; person?: string | null } = {},
): DocumentsScreenData {
  const read = readBy(reader);
  const documents = options.empty ? [] : read.documents;
  return {
    business: "demo",
    reader: READERS[reader],
    clock: documentsDemoClock,
    mode: reader === "office" ? "office" : "staff",
    sends: reader !== "staff",
    documents,
    sent: reader === "manager" ? read.sent : null,
    people: documentsDemoPeople,
    // The demo holds every document: its list is counted whole.
    directory:
      reader === "office" ? documentPeople(documents, READERS[reader]) : [],
    notice: reader === "office" && (options.notice ?? true),
    person:
      options.person && documentsDemoPeople[options.person]
        ? options.person
        : null,
    months: documentMonths(documents, CHAT_DEMO_ZONE),
    notYet: false,
  };
}

/** The demo's documents' ids, for their pages. */
export function documentsDemoIds(): string[] {
  return ALL.map((document) => document.id);
}

/** `/design/chat/documents/<id>`, as `reader` reads it; null for one they don't. */
export function documentsDemoPage(
  id: string,
  reader: DocumentsDemoReader,
  state: "sent" | "removed" | null,
): DocumentPageData | null {
  const read = readBy(reader);
  let document =
    [...read.documents, ...read.sent].find((d) => d.id === id) ?? null;
  if (!document) return null;
  const me = READERS[reader].id;
  if (state === "sent") {
    // Just sent: now, with nothing opened yet.
    document = {
      ...document,
      sentAt: CHAT_DEMO_NOW,
      openedAt: null,
      openedBy: null,
    };
  }
  if (state === "removed" && document.removedAt === null) {
    document = {
      ...document,
      removedAt: CHAT_DEMO_NOW,
      removedBy: me,
      removedReason: "wrong_person",
      fileGoneAfter: new Date(
        Date.parse(CHAT_DEMO_NOW) + 10 * 60_000,
      ).toISOString(),
    };
  }
  const office = READERS[reader].office;
  const removed = document.removedAt !== null;
  return {
    business: "demo",
    reader: READERS[reader],
    clock: documentsDemoClock,
    document,
    people: documentsDemoPeople,
    removable: removed
      ? []
      : [
          ...(document.authorId === me && state === "sent"
            ? (["taken_back"] as const)
            : []),
          ...(office
            ? (["wrong_person", "wrong_file", "duplicate", "other"] as const)
            : []),
        ],
    restorable: removed && document.removedBy === me && state === "removed",
    demo: false,
  };
}

/** `/design/chat/documents/send`, for Noa (to the business) or Shiran (both ways). */
export function documentsDemoSend(
  reader: "staff" | "manager",
  samples: boolean,
): DocumentSendData {
  const me = READERS[reader].id;
  const staff = chatDemoPeople.filter((p) => p.id !== me);
  return {
    business: "demo",
    me,
    demo: samples,
    files: samples ? "demo" : "yes",
    toBusiness: true,
    toPeople: reader === "manager",
    people: staff.map((p) => ({ id: p.id, name: p.name, photo: p.photo })),
    departments: [
      { id: "dep-kitchen", name: "מטבח", members: ["noa", "itay", "omer"] },
      { id: "dep-bar", name: "בר", members: ["yoav", "ron"] },
      {
        id: "dep-floor",
        name: "מלצרות",
        members: ["maya", "dana", "shira"],
      },
    ],
  };
}
