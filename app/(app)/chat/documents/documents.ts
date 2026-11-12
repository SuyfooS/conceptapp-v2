import { getChatAuthors } from "@db/chat";
import { getDepartments } from "@db/departments";
import {
  type DocumentView,
  documentsNoticeSeen,
  getDocument,
  getDocuments,
  getDocumentsForToday,
  getDocumentsIndex,
} from "@db/documents";
import { getColleagues } from "@db/team";
import { isUuid } from "@domain/activity";
import { dateIn } from "@domain/availability";
import {
  canRemoveDocument,
  canRestoreDocument,
  type DocumentReader,
  type DocumentRemoveReason,
} from "@domain/documents";
import {
  type DocumentShown,
  documentDirectory,
  documentMonths,
  indexOf,
} from "@domain/documents-screen";
import { isStaff } from "@domain/modules";
import { cache } from "react";
import type {
  DocumentClock,
  DocumentPageData,
  DocumentPeople,
  DocumentSendData,
  DocumentsScreenData,
  DocumentsTodayData,
} from "./document-screen-types";
import { documentFilesAllowed, documentsAccess } from "./documents-access";

/*
 * What the documents' screens read (chat C7), once per request, under the
 * signed-in person's own session: the database decides what they see (RLS),
 * and these only shape it. Null while someone views the business as a role
 * (the screens then say documents aren't shown) and for anyone the documents
 * aren't for. Nothing here logs a document's category, title, note or file.
 */

/** The business's active people, once per request. */
const currentColleagues = cache((businessId: string) =>
  getColleagues(businessId),
);

/**
 * Names and photos for everyone these documents name: their person, their
 * recipients, who sent, opened or removed them. Someone who left keeps the
 * name their profile has, or none ("מי שכבר לא בצוות").
 */
async function peopleFor(
  businessId: string,
  documents: readonly DocumentView[],
  /** Others to name besides: the office's people whose documents weren't read. */
  others: readonly string[] = [],
): Promise<DocumentPeople> {
  const colleagues = await currentColleagues(businessId);
  const people: DocumentPeople = {};
  for (const colleague of colleagues) {
    people[colleague.userId.toLowerCase()] = {
      name: colleague.name,
      photo: colleague.photo,
      former: false,
    };
  }
  const wanted = new Set<string>(
    others
      .map((id) => id.toLowerCase())
      .filter((id) => isUuid(id) && !people[id]),
  );
  for (const document of documents) {
    for (const id of [
      document.personId,
      document.authorId,
      document.openedBy,
      document.removedBy,
      ...document.recipients.map((r) => r.personId),
    ]) {
      if (id && !people[id.toLowerCase()]) wanted.add(id.toLowerCase());
    }
  }
  if (wanted.size > 0) {
    for (const author of await getChatAuthors([...wanted])) {
      people[author.id] = {
        name: author.name,
        photo: author.photo,
        former: true,
      };
    }
  }
  return people;
}

/** The business's clock now: its zone and today's date there. */
function clockOf(timeZone: string, now: Date): DocumentClock {
  return { timeZone, today: dateIn(now, timeZone), now: now.toISOString() };
}

/** What a server read gives the browser: the row, its marks, its address. */
const shown = (document: DocumentView): DocumentShown => document;

/**
 * A read the office's screen stands without: what it adds (every one
 * waiting, a chosen person's, the brief of all) falls back to the newest
 * 200, logged by its code alone, rather than taking the screen down.
 */
async function besides<T>(read: Promise<T>, what: string): Promise<T | null> {
  try {
    return await read;
  } catch (error) {
    console.error(
      `documents (${what}) could not be read`,
      (error as { code?: string } | null)?.code ?? "without a code",
    );
    return null;
  }
}

/** Each document once, newest first. */
function merged(
  ...lists: readonly (readonly DocumentView[])[]
): DocumentView[] {
  const byId = new Map<string, DocumentView>();
  for (const list of lists) {
    for (const document of list) byId.set(document.id, document);
  }
  return [...byId.values()].sort(
    (a, b) =>
      Date.parse(b.sentAt) - Date.parse(a.sentAt) ||
      (a.id < b.id ? 1 : a.id > b.id ? -1 : 0),
  );
}

/**
 * The documents' list (`/chat/documents`): for someone on the staff their
 * own, both ways, and for a sender also those they sent ("שלחת"). For the
 * office the newest 200 of the business, with every one that waits for them
 * and the chosen person's (`?person=`) newest 200 besides, so "מחכה לך" and a
 * person's documents are whole however many there are; its people and the
 * months a download is offered for come from every document in brief
 * (`getDocumentsIndex`), so nobody and no month drops out as documents pile
 * up. With the keep-a-copy notice until someone there read it.
 */
export async function currentDocumentsScreen(
  person?: string,
): Promise<DocumentsScreenData | null> {
  const access = await documentsAccess();
  if (!access || access.viewing) return null;
  const { businessId, userId, office } = access;
  const reader: DocumentReader = { id: userId, office };
  const asked = person && isUuid(person) ? person.toLowerCase() : null;
  const [documents, sent, seen, today, theirs, index] = await Promise.all([
    getDocuments(
      businessId,
      office ? { limit: 200 } : { person: userId, limit: 200 },
    ),
    access.sends && !office
      ? getDocuments(businessId, {
          sentBy: userId,
          direction: "to_people",
          limit: 100,
        })
      : null,
    office ? documentsNoticeSeen(businessId) : true,
    office
      ? besides(getDocumentsForToday(businessId, reader, 200), "waiting")
      : null,
    office && asked
      ? besides(
          getDocuments(businessId, { person: asked, limit: 200 }),
          "a person's",
        )
      : null,
    office ? besides(getDocumentsIndex(businessId), "in brief") : null,
  ]);
  const notYet = documents === "notYet";
  const list =
    documents === "notYet"
      ? []
      : merged(
          documents,
          today && today !== "notYet"
            ? [...today.waiting, ...today.toConfirm]
            : [],
          theirs && theirs !== "notYet" ? theirs : [],
        );
  const sentList = sent === null || sent === "notYet" ? null : sent;
  const brief = index && index !== "notYet" ? index : indexOf(list);
  const now = new Date();
  const directory = office ? documentDirectory(brief, list, reader) : [];
  const people = await peopleFor(
    businessId,
    [...list, ...(sentList ?? [])],
    directory.map((p) => p.id),
  );
  return {
    business: businessId,
    reader,
    clock: clockOf(access.timeZone, now),
    mode: office ? "office" : "staff",
    sends: access.sends,
    documents: list.map(shown),
    sent: sentList?.map(shown) ?? null,
    people,
    directory,
    notice: office && !seen && !notYet,
    person: asked && people[asked] ? asked : null,
    months: documentMonths(office ? brief.documents : list, access.timeZone),
    notYet,
  };
}

/**
 * One document's page (`/chat/documents/[id]`): null for one the person
 * doesn't read (the same as none), with what they may do with it now.
 */
export async function currentDocumentPage(
  documentId: string,
): Promise<DocumentPageData | null> {
  const access = await documentsAccess();
  if (!access || access.viewing) return null;
  const { businessId, userId, office } = access;
  const document = await getDocument(businessId, documentId);
  if (!document || document === "notYet") return null;
  const reader: DocumentReader = { id: userId, office };
  const now = new Date();
  const removable: DocumentRemoveReason[] = canRemoveDocument(
    document,
    reader,
    now,
  );
  return {
    business: businessId,
    reader,
    clock: clockOf(access.timeZone, now),
    document: shown(document),
    people: await peopleFor(businessId, [document]),
    removable,
    restorable: canRestoreDocument(document, reader, now),
    demo: access.demo,
  };
}

/**
 * The send screen (`/chat/documents/send`): which ways the person sends
 * (to the business while on the staff; to people as a sender), whether the
 * business takes a file of its own ("demo": samples only), and to people,
 * whom: everyone on the staff but them, and the live departments' people.
 */
export async function currentSendScreen(): Promise<DocumentSendData | null> {
  const access = await documentsAccess();
  if (!access || access.viewing) return null;
  const { businessId, userId } = access;
  const [files, colleagues, departments] = await Promise.all([
    documentFilesAllowed(businessId),
    access.sends ? currentColleagues(businessId) : [],
    access.sends ? getDepartments(businessId) : [],
  ]);
  const me = userId.toLowerCase();
  const staff = colleagues.filter(
    (c) => isStaff(c.role) && c.userId.toLowerCase() !== me,
  );
  const onStaff = new Set(staff.map((c) => c.userId.toLowerCase()));
  return {
    business: businessId,
    me,
    demo: access.demo,
    files,
    toBusiness: access.staff,
    toPeople: access.sends,
    people: staff
      .map((c) => ({
        id: c.userId.toLowerCase(),
        name: c.name,
        photo: c.photo,
      }))
      .sort(
        (a, b) =>
          (a.name === null ? 1 : 0) - (b.name === null ? 1 : 0) ||
          (a.name ?? "").localeCompare(b.name ?? "", "he"),
      ),
    departments:
      departments === "notYet"
        ? []
        : departments
            .filter((d) => d.archivedAt === null)
            .map((d) => ({
              id: d.id,
              name: d.name,
              members: d.members
                .map((id) => id.toLowerCase())
                .filter((id) => onStaff.has(id)),
            })),
  };
}

/**
 * Documents' part of Today (C7): what the person is asked to confirm, and for
 * the office what came to the business that nobody there opened. Null when
 * documents aren't the person's, while viewing, and before the migration.
 */
export const currentDocumentsHome = cache(
  async (): Promise<DocumentsTodayData | null> => {
    const access = await documentsAccess();
    if (!access || access.viewing) return null;
    const { businessId, userId, office } = access;
    let today: Awaited<ReturnType<typeof getDocumentsForToday>>;
    try {
      today = await getDocumentsForToday(
        businessId,
        { id: userId, office },
        50,
      );
    } catch (error) {
      // Today stands without its documents' part.
      console.error(
        "documents for Today could not be read",
        (error as { code?: string } | null)?.code ?? "without a code",
      );
      return null;
    }
    if (today === "notYet") return null;
    const now = new Date();
    return {
      business: businessId,
      reader: { id: userId, office },
      clock: clockOf(access.timeZone, now),
      toConfirm: today.toConfirm.map(shown),
      toConfirmCount: today.toConfirmCount,
      waiting: today.waiting.map(shown),
      waitingCount: today.waitingCount,
      people: await peopleFor(businessId, [
        ...today.toConfirm,
        ...today.waiting,
      ]),
    };
  },
);
