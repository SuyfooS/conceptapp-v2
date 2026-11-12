import {
  type DocumentCategory,
  type DocumentDirection,
  type DocumentMark,
  type DocumentReader,
  type DocumentRecipientMark,
  type DocumentRow,
  type DocumentState,
  documentState,
} from "./documents";

/*
 * What the documents' screens (chat C7, plan §11.5 to §11.7) work out from
 * the rows a reader reads, free of words and of React: whose a document is,
 * where it stands for the reader, what waits for the office, how far its
 * recipients got, the filters of the office's table, and to whom a document
 * to people goes. The words are the screens'.
 */

/** A document as the screens show it: its row, its recipients' marks, its address. */
export type DocumentShown = DocumentRow & {
  /** Every recipient's marks for its sender and the office, a recipient's own for them. */
  recipients: DocumentRecipientMark[];
  /** Where its file or sample opens (`documentSrc`), while there is one. */
  src: string | null;
  /** What `src` serves: a photo of a page inline, or a PDF to download. */
  shownKind: "image" | "pdf" | null;
};

/** The reader's own mark on a document, when it was sent to them. */
export function ownMark(
  document: Pick<DocumentShown, "recipients">,
  reader: Pick<DocumentReader, "id">,
): DocumentMark | null {
  const me = reader.id.toLowerCase();
  const mark = document.recipients.find(
    (recipient) => recipient.personId.toLowerCase() === me,
  );
  return mark
    ? { openedAt: mark.openedAt, confirmedAt: mark.confirmedAt }
    : null;
}

/** Where a document stands for its reader (`documentState`, with their own mark). */
export function stateFor(
  document: DocumentShown,
  reader: DocumentReader,
): DocumentState {
  return documentState(document, reader, ownMark(document, reader));
}

/**
 * Whom a document is about, by id: its person for one to the business, its
 * recipients for one to people (as far as the reader sees them).
 */
export function peopleOf(
  document: Pick<DocumentShown, "direction" | "personId" | "recipients">,
): string[] {
  if (document.direction === "from_person") {
    return document.personId ? [document.personId.toLowerCase()] : [];
  }
  return [...new Set(document.recipients.map((r) => r.personId.toLowerCase()))];
}

/** Whether a document is about this person (theirs, or sent to them). */
export function isAbout(document: DocumentShown, person: string): boolean {
  return peopleOf(document).includes(person.toLowerCase());
}

/**
 * Whether a document waits for the reader ("מחכה לך"): for the office, one
 * to the business nobody there opened yet (their own aside); for anyone, one
 * sent to them that asks for "קראתי" they haven't given.
 */
export function waitsFor(
  document: DocumentShown,
  reader: DocumentReader,
): boolean {
  if (document.removedAt !== null) return false;
  if (document.direction === "from_person") {
    return (
      reader.office &&
      document.openedAt === null &&
      document.personId?.toLowerCase() !== reader.id.toLowerCase()
    );
  }
  return stateFor(document, reader) === "toConfirm";
}

/** How far a document's recipients got: how many, opened, confirmed. */
export type RecipientsSummary = {
  total: number;
  opened: number;
  confirmed: number;
};

export function recipientsSummary(
  recipients: readonly DocumentRecipientMark[],
): RecipientsSummary {
  return {
    total: recipients.length,
    opened: recipients.filter((r) => r.openedAt !== null).length,
    confirmed: recipients.filter((r) => r.confirmedAt !== null).length,
  };
}

/** A person in the office's list: their documents, and how many wait. */
export type DocumentPerson = {
  id: string;
  /** Documents about them the reader reads. */
  count: number;
  /** Of those, how many wait for the reader. */
  waiting: number;
  /** When the newest was sent (ISO). */
  latest: string;
};

/**
 * Every document of the business in brief, as the office reads them
 * (`getDocumentsIndex` in @db/documents): when each was sent, which way and
 * whom it is about. What the office's list of people and a month's download
 * are counted from, never only the newest documents the screen read.
 */
export type DocumentIndex = {
  documents: readonly {
    id: string;
    direction: DocumentDirection;
    personId: string | null;
    sentAt: string;
  }[];
  recipients: readonly { documentId: string; personId: string }[];
};

/** The index of documents read whole (the design demo's, whose list is all of them). */
export function indexOf(documents: readonly DocumentShown[]): DocumentIndex {
  return {
    documents: documents.map((document) => ({
      id: document.id,
      direction: document.direction,
      personId: document.personId,
      sentAt: document.sentAt,
    })),
    recipients: documents.flatMap((document) =>
      document.recipients.map((mark) => ({
        documentId: document.id,
        personId: mark.personId,
      })),
    ),
  };
}

/**
 * The people the documents are about, as the office's list shows them: each
 * counted over every document of the business (`index`, so someone whose
 * documents are all old is still there), with how many of the documents the
 * screen holds wait for the reader (every one waiting is among them, as the
 * screen reads); those with something waiting first, then by their newest
 * document.
 */
export function documentDirectory(
  index: DocumentIndex,
  documents: readonly DocumentShown[],
  reader: DocumentReader,
): DocumentPerson[] {
  const recipients = new Map<string, string[]>();
  for (const mark of index.recipients) {
    const list = recipients.get(mark.documentId) ?? [];
    list.push(mark.personId.toLowerCase());
    recipients.set(mark.documentId, list);
  }
  // Each document once, by id: the index's, and any the screen read since.
  const about = new Map<string, { people: string[]; sentAt: string }>();
  for (const document of index.documents) {
    about.set(document.id, {
      people:
        document.direction === "from_person"
          ? document.personId
            ? [document.personId.toLowerCase()]
            : []
          : [...new Set(recipients.get(document.id) ?? [])],
      sentAt: document.sentAt,
    });
  }
  for (const document of documents) {
    if (!about.has(document.id)) {
      about.set(document.id, {
        people: peopleOf(document),
        sentAt: document.sentAt,
      });
    }
  }

  const people = new Map<string, DocumentPerson>();
  const personOf = (id: string, sentAt: string) => {
    const person = people.get(id) ?? {
      id,
      count: 0,
      waiting: 0,
      latest: sentAt,
    };
    people.set(id, person);
    return person;
  };
  for (const { people: ids, sentAt } of about.values()) {
    for (const id of ids) {
      const person = personOf(id, sentAt);
      person.count += 1;
      if (Date.parse(sentAt) > Date.parse(person.latest)) {
        person.latest = sentAt;
      }
    }
  }
  for (const document of documents) {
    if (!waitsFor(document, reader)) continue;
    for (const id of peopleOf(document)) {
      personOf(id, document.sentAt).waiting += 1;
    }
  }
  return [...people.values()].sort(
    (a, b) =>
      Number(b.waiting > 0) - Number(a.waiting > 0) ||
      Date.parse(b.latest) - Date.parse(a.latest) ||
      a.id.localeCompare(b.id),
  );
}

/**
 * The people a list of documents is about, when it holds all of them (the
 * design demo's): `documentDirectory` over the list itself.
 */
export function documentPeople(
  documents: readonly DocumentShown[],
  reader: DocumentReader,
): DocumentPerson[] {
  return documentDirectory(indexOf(documents), documents, reader);
}

/** What the office's table can be narrowed to. */
export const DOCUMENT_STATE_FILTERS = [
  "all",
  "waiting",
  "unconfirmed",
  "removed",
] as const;
export type DocumentStateFilter = (typeof DOCUMENT_STATE_FILTERS)[number];

export type DocumentFilters = {
  /** One person's, or everyone's. */
  person: string | null;
  category: DocumentCategory | null;
  state: DocumentStateFilter;
};

/**
 * Whether a document is in the table the filters ask for: about the person,
 * of the category, and in the state: waiting for the reader, asking for
 * "קראתי" someone hasn't given yet, or with its file removed.
 */
export function matchesFilters(
  document: DocumentShown,
  filters: DocumentFilters,
  reader: DocumentReader,
): boolean {
  if (filters.person !== null && !isAbout(document, filters.person)) {
    return false;
  }
  if (filters.category !== null && document.category !== filters.category) {
    return false;
  }
  switch (filters.state) {
    case "all":
      return true;
    case "waiting":
      return waitsFor(document, reader);
    case "unconfirmed": {
      if (document.removedAt !== null || !document.asksConfirmation) {
        return false;
      }
      const { total, confirmed } = recipientsSummary(document.recipients);
      return confirmed < total;
    }
    case "removed":
      return document.removedAt !== null;
    default: {
      const unhandled: never = filters.state;
      return unhandled;
    }
  }
}

/** The months documents were sent in, newest first (YYYY-MM, in `timeZone`). */
export function documentMonths(
  documents: readonly Pick<DocumentShown, "sentAt">[],
  timeZone: string,
): string[] {
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  });
  const months = new Set<string>();
  for (const document of documents) {
    const at = new Date(document.sentAt);
    if (Number.isNaN(at.getTime())) continue;
    const parts = format.formatToParts(at);
    const year = parts.find((p) => p.type === "year")?.value;
    const month = parts.find((p) => p.type === "month")?.value;
    if (year && month) months.add(`${year}-${month}`);
  }
  return [...months].sort().reverse();
}

/** To whom a document to people goes, as the send screen asks it. */
export type DocumentAudience =
  | { kind: "person"; person: string | null }
  | { kind: "department"; department: string | null }
  | { kind: "everyone" };

/**
 * The people a document to people goes to, resolved on the screen so it can
 * say how many: one person, a department's people, or everyone on the staff.
 * Only people on the staff (`staff`, by id), never the sender, at most 200
 * (public.send_document's limit), in a stable order.
 */
export function audienceOf(
  audience: DocumentAudience,
  staff: readonly string[],
  departments: readonly { id: string; members: readonly string[] }[],
  sender: string,
  max = 200,
): string[] {
  const me = sender.toLowerCase();
  const onStaff = new Set(staff.map((id) => id.toLowerCase()));
  onStaff.delete(me);
  let chosen: string[];
  switch (audience.kind) {
    case "person":
      chosen = audience.person ? [audience.person.toLowerCase()] : [];
      break;
    case "department":
      chosen =
        departments
          .find((d) => d.id === audience.department)
          ?.members.map((id) => id.toLowerCase()) ?? [];
      break;
    case "everyone":
      chosen = [...onStaff];
      break;
    default: {
      const unhandled: never = audience;
      return unhandled;
    }
  }
  return [...new Set(chosen)]
    .filter((id) => onStaff.has(id))
    .sort()
    .slice(0, max);
}
