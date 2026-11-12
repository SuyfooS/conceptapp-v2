import { describe, expect, it } from "vitest";
import {
  CHAT_PDF_MAX_BYTES,
  CHAT_UPLOAD_HOURS,
  FILES_GUARD_BYTES,
  STORAGE_PLAN_BYTES,
} from "./chat-files";
import {
  canRemoveDocument,
  canRestoreDocument,
  checkDocumentNote,
  checkDocumentPhoto,
  checkDocumentTitle,
  DOCUMENT_CATEGORIES,
  DOCUMENT_CATEGORY_KEYS,
  DOCUMENT_PDF_MAX_BYTES,
  DOCUMENT_PHOTO_MAX_BYTES,
  DOCUMENT_PHOTO_STEPS,
  DOCUMENT_PHOTO_TARGET_BYTES,
  DOCUMENT_REMOVE_REASONS,
  DOCUMENT_SAMPLES,
  DOCUMENTS_GUARD_BYTES,
  type DocumentRow,
  documentFileKindOf,
  documentFilePath,
  documentFileSrc,
  documentMarkSchema,
  documentPhotoVerdict,
  documentRowSchema,
  documentState,
  isDocumentCategory,
  isDocumentFilePath,
  isDocumentFileSrc,
  isDocumentRemoveReason,
  OFFICE_REMOVE_REASONS,
  openedDocumentSchema,
  parseDocumentFilePath,
  takesCategory,
} from "./documents";

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const NOA = "11111111-1111-4111-8111-111111111111";
const URI = "22222222-2222-4222-8222-222222222222";
const GALIT = "33333333-3333-4333-8333-333333333333";
const DOCUMENT = "44444444-4444-4444-8444-444444444444";
const KEY = "0123456789abcdef0123456789abcdef";

const SENT = "2026-11-11T08:00:00.000Z";

/** A document to the business from Noa, as the database gives it back. */
function sickNote(extra: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: DOCUMENT,
    direction: "from_person",
    personId: NOA,
    authorId: NOA,
    category: "sick_note",
    title: "אישור מחלה",
    note: null,
    asksConfirmation: false,
    sentAt: SENT,
    openedAt: null,
    openedBy: null,
    removedAt: null,
    removedBy: null,
    removedReason: null,
    fileGoneAfter: null,
    hasFile: true,
    fileKind: "image",
    fileName: null,
    fileSize: 300_000,
    fileSrc: documentFileSrc(`${BUSINESS}/${KEY}.webp`),
    sample: null,
    ...extra,
  };
}

/** Galit's payslip to people. */
function payslip(extra: Partial<DocumentRow> = {}): DocumentRow {
  return sickNote({
    direction: "to_people",
    personId: null,
    authorId: GALIT,
    category: "payslip",
    title: "תלוש שכר אוקטובר",
    ...extra,
  });
}

const noa = { id: NOA, office: false };
const uri = { id: URI, office: true };
const galit = { id: GALIT, office: true };
const at = (minutes: number) => new Date(Date.parse(SENT) + minutes * 60_000);

describe("a document's categories", () => {
  it("go each their own way: a sick note only to the business", () => {
    expect(DOCUMENT_CATEGORIES.from_person).toEqual([
      "sick_note",
      "form",
      "other",
    ]);
    expect(DOCUMENT_CATEGORIES.to_people).not.toContain("sick_note");
    expect(takesCategory("from_person", "sick_note")).toBe(true);
    expect(takesCategory("to_people", "sick_note")).toBe(false);
    expect(takesCategory("from_person", "payslip")).toBe(false);
    expect(takesCategory("to_people", "procedure")).toBe(true);
  });

  it("are all taken one way or the other, and nothing else is one", () => {
    const taken = new Set([
      ...DOCUMENT_CATEGORIES.from_person,
      ...DOCUMENT_CATEGORIES.to_people,
    ]);
    expect([...taken].sort()).toEqual([...DOCUMENT_CATEGORY_KEYS].sort());
    expect(isDocumentCategory("payslip")).toBe(true);
    expect(isDocumentCategory("medical")).toBe(false);
    expect(isDocumentCategory(null)).toBe(false);
  });

  it("have a sample only where the demo has one, of its own category", () => {
    for (const sample of DOCUMENT_SAMPLES) {
      expect(isDocumentCategory(sample), sample).toBe(true);
    }
  });
});

describe("removing a document's file", () => {
  it("has the database's reasons, the office's all but taking back", () => {
    expect(DOCUMENT_REMOVE_REASONS).toEqual([
      "taken_back",
      "wrong_person",
      "wrong_file",
      "duplicate",
      "other",
    ]);
    expect(OFFICE_REMOVE_REASONS).toEqual(
      DOCUMENT_REMOVE_REASONS.filter((reason) => reason !== "taken_back"),
    );
    expect(isDocumentRemoveReason("duplicate")).toBe(true);
    expect(isDocumentRemoveReason("health")).toBe(false);
  });

  it("is its sender's to take back in their first 10 minutes", () => {
    expect(canRemoveDocument(sickNote(), noa, at(0))).toEqual(["taken_back"]);
    expect(canRemoveDocument(sickNote(), noa, at(10))).toEqual(["taken_back"]);
    expect(canRemoveDocument(sickNote(), noa, at(10.01))).toEqual([]);
  });

  it("is the office's with a reason from the list, at any time", () => {
    expect(canRemoveDocument(sickNote(), uri, at(600))).toEqual([
      ...OFFICE_REMOVE_REASONS,
    ]);
    // Galit sent it and is in the office: both, while her 10 minutes last.
    expect(canRemoveDocument(payslip(), galit, at(2))).toEqual([
      "taken_back",
      ...OFFICE_REMOVE_REASONS,
    ]);
    expect(canRemoveDocument(payslip(), galit, at(11))).toEqual([
      ...OFFICE_REMOVE_REASONS,
    ]);
  });

  it("is nobody else's, and nothing once it is removed", () => {
    expect(canRemoveDocument(payslip(), noa, at(1))).toEqual([]);
    expect(
      canRemoveDocument(sickNote({ removedAt: SENT }), uri, at(1)),
    ).toEqual([]);
    expect(
      canRemoveDocument(sickNote({ sentAt: "not a time" }), noa, at(1)),
    ).toEqual([]);
  });

  it("is undone by whoever removed it, before the file goes", () => {
    const removed = sickNote({
      removedAt: at(5).toISOString(),
      removedBy: URI,
      removedReason: "wrong_person",
      fileGoneAfter: at(15).toISOString(),
    });
    expect(canRestoreDocument(removed, uri, at(14))).toBe(true);
    expect(canRestoreDocument(removed, uri, at(15))).toBe(false);
    expect(canRestoreDocument(removed, galit, at(6))).toBe(false);
    expect(canRestoreDocument(sickNote(), uri, at(6))).toBe(false);
    // Its file gone already: nothing to put back. A sample stays one.
    expect(canRestoreDocument({ ...removed, hasFile: false }, uri, at(6))).toBe(
      false,
    );
    expect(
      canRestoreDocument(
        { ...removed, hasFile: false, sample: "sick_note" },
        uri,
        at(6),
      ),
    ).toBe(true);
  });
});

describe("documentState", () => {
  it("says a document to the business is sent, then received", () => {
    expect(documentState(sickNote(), noa)).toBe("sent");
    expect(documentState(sickNote(), uri)).toBe("waiting");
    const opened = sickNote({ openedAt: at(30).toISOString(), openedBy: URI });
    expect(documentState(opened, noa)).toBe("received");
    expect(documentState(opened, galit)).toBe("received");
  });

  it("gives a recipient their own task first", () => {
    const asks = payslip({ asksConfirmation: true });
    const none = { openedAt: null, confirmedAt: null };
    const opened = { openedAt: at(1).toISOString(), confirmedAt: null };
    const confirmed = {
      openedAt: at(1).toISOString(),
      confirmedAt: at(2).toISOString(),
    };
    expect(documentState(asks, noa, none)).toBe("toConfirm");
    expect(documentState(asks, noa, opened)).toBe("toConfirm");
    expect(documentState(asks, noa, confirmed)).toBe("confirmed");
    expect(documentState(payslip(), noa, none)).toBe("waiting");
    expect(documentState(payslip(), noa, opened)).toBe("received");
    // The owner was sent the procedure too: his own task, not the office's.
    expect(documentState(asks, uri, none)).toBe("toConfirm");
  });

  it("says a document to people is sent, for its sender and the office", () => {
    expect(documentState(payslip(), galit)).toBe("sent");
    expect(documentState(payslip({ asksConfirmation: true }), uri)).toBe(
      "sent",
    );
  });

  it("says removed before anything else", () => {
    const removed = { removedAt: at(3).toISOString() };
    expect(documentState(sickNote(removed), noa)).toBe("removed");
    expect(documentState(payslip(removed), galit)).toBe("removed");
  });
});

describe("a document's title and note", () => {
  it("take a title on one line, of 1 to 80 characters", () => {
    expect(checkDocumentTitle("  תלוש   שכר  ")).toEqual({
      ok: true,
      title: "תלוש שכר",
    });
    expect(checkDocumentTitle("   ")).toEqual({ ok: false, reason: "empty" });
    expect(checkDocumentTitle("א".repeat(80))).toMatchObject({ ok: true });
    expect(checkDocumentTitle("א".repeat(81))).toEqual({
      ok: false,
      reason: "tooLong",
    });
    expect(checkDocumentTitle("שורה\nשנייה")).toEqual({
      ok: false,
      reason: "control",
    });
  });

  it("take a note of at most 300 characters, or none", () => {
    expect(checkDocumentNote(undefined)).toEqual({ ok: true, note: null });
    expect(checkDocumentNote(" \n ")).toEqual({ ok: true, note: null });
    expect(checkDocumentNote(" לשלושה\r\nימים\t ")).toEqual({
      ok: true,
      note: "לשלושה\nימים",
    });
    expect(checkDocumentNote("a\u0007b")).toEqual({ ok: true, note: "ab" });
    expect(checkDocumentNote("א".repeat(300))).toMatchObject({ ok: true });
    expect(checkDocumentNote("א".repeat(301))).toEqual({
      ok: false,
      reason: "tooLong",
    });
  });
});

describe("a document's file", () => {
  it("is a photo of at most 700 KB or a PDF of at most 10 MiB, as in chat", () => {
    expect(DOCUMENT_PHOTO_MAX_BYTES).toBe(716_800);
    expect(DOCUMENT_PDF_MAX_BYTES).toBe(CHAT_PDF_MAX_BYTES);
    expect(CHAT_UPLOAD_HOURS).toBe(2);
    const empty = new Uint8Array(0);
    expect(
      checkDocumentPhoto({ type: "image/webp", size: 0, bytes: empty }),
    ).toEqual({ ok: false, problem: "empty" });
    const big = new Uint8Array(DOCUMENT_PHOTO_MAX_BYTES + 1);
    expect(
      checkDocumentPhoto({ type: "image/webp", size: big.length, bytes: big }),
    ).toEqual({ ok: false, problem: "tooBig" });
  });

  it("is taken until 980 MB of the plan, after chat files stop", () => {
    expect(DOCUMENTS_GUARD_BYTES).toBe(1_027_604_480);
    expect(DOCUMENTS_GUARD_BYTES).toBeGreaterThan(FILES_GUARD_BYTES);
    expect(DOCUMENTS_GUARD_BYTES).toBeLessThan(STORAGE_PLAN_BYTES);
  });

  it("goes in its business's folder, under a key that names nobody", () => {
    const path = documentFilePath(BUSINESS, KEY, "pdf");
    expect(path).toBe(`${BUSINESS}/${KEY}.pdf`);
    expect(parseDocumentFilePath(path)).toEqual({
      businessId: BUSINESS,
      key: KEY,
      extension: "pdf",
    });
    expect(isDocumentFilePath(path, BUSINESS)).toBe(true);
    expect(isDocumentFilePath(path, NOA)).toBe(false);
    expect(documentFileKindOf("jpg")).toBe("image");
    expect(documentFileKindOf("pdf")).toBe("pdf");
  });

  it("is in no other shape: not a chat file's, not upper case, not a climb", () => {
    for (const path of [
      `${BUSINESS}/${BUSINESS}/${KEY}.pdf`,
      `${BUSINESS}/${KEY}-s.webp`,
      `${BUSINESS}/${KEY.toUpperCase()}.pdf`,
      `${BUSINESS}/${KEY}.png`,
      `${"-".repeat(36)}/${KEY}.pdf`,
      `../${KEY}.pdf`,
      `${BUSINESS}/${KEY}.pdf/..`,
      "",
    ]) {
      expect(isDocumentFilePath(path), path).toBe(false);
    }
  });

  it("is served by the app's own route, and only in its shape", () => {
    const path = `${BUSINESS}/${KEY}.webp`;
    expect(documentFileSrc(path)).toBe(`/document-files/${path}`);
    expect(documentFileSrc(null)).toBeNull();
    expect(documentFileSrc("../etc/passwd")).toBeNull();
    expect(isDocumentFileSrc(`/document-files/${path}`)).toBe(true);
    expect(isDocumentFileSrc(`/chat-files/${path}`)).toBe(false);
  });
});

describe("a document's row", () => {
  const stored = {
    id: DOCUMENT.toUpperCase(),
    business_id: BUSINESS,
    direction: "from_person",
    person_id: NOA,
    author_id: NOA,
    category: "sick_note",
    title: "אישור מחלה",
    note: null,
    file_kind: "pdf",
    file_path: `${BUSINESS}/${KEY}.pdf`,
    file_name: "אישור.pdf",
    file_size: 120_000,
    sample: null,
    asks_confirmation: false,
    sent_at: "2026-11-11T08:00:00+00:00",
    opened_at: null,
    opened_by: null,
    removed_at: null,
    removed_by: null,
    removed_reason: null,
    file_gone_after: null,
  };

  it("reads into what the screens show, its file served by the app", () => {
    const row = documentRowSchema.parse(stored);
    expect(row).toMatchObject({
      id: DOCUMENT,
      direction: "from_person",
      category: "sick_note",
      hasFile: true,
      fileKind: "pdf",
      fileName: "אישור.pdf",
      fileSrc: `/document-files/${BUSINESS}/${KEY}.pdf`,
    });
  });

  it("reads a file gone, and a reason or sample it doesn't know, as none", () => {
    const row = documentRowSchema.parse({
      ...stored,
      file_kind: null,
      file_path: null,
      file_name: null,
      file_size: null,
      removed_at: "2026-11-11T08:05:00+00:00",
      removed_by: URI,
      removed_reason: "something new",
      file_gone_after: "2026-11-11T08:15:00+00:00",
    });
    expect(row).toMatchObject({
      hasFile: false,
      fileKind: null,
      fileSrc: null,
      removedReason: null,
    });
  });

  it("refuses a category or a direction it doesn't know", () => {
    expect(
      documentRowSchema.safeParse({ ...stored, category: "x" }).success,
    ).toBe(false);
    expect(
      documentRowSchema.safeParse({ ...stored, direction: "both" }).success,
    ).toBe(false);
  });

  it("reads a recipient's marks, and what an opening gives back", () => {
    expect(
      documentMarkSchema.parse({
        document_id: DOCUMENT,
        person_id: NOA.toUpperCase(),
        opened_at: SENT,
        confirmed_at: null,
      }),
    ).toEqual({
      documentId: DOCUMENT,
      personId: NOA,
      openedAt: SENT,
      confirmedAt: null,
    });
    expect(
      openedDocumentSchema.parse({
        document: DOCUMENT,
        business: BUSINESS,
        path: null,
        kind: null,
        name: null,
        sample: "sick_note",
      }).sample,
    ).toBe("sick_note");
  });
});

describe("a photo of a page, as the phone draws it", () => {
  it("keeps the first drawing at most 500 KB", () => {
    expect(documentPhotoVerdict([DOCUMENT_PHOTO_TARGET_BYTES])).toEqual({
      keep: 0,
    });
    expect(
      documentPhotoVerdict([DOCUMENT_PHOTO_MAX_BYTES, 400 * 1024]),
    ).toEqual({ keep: 1 });
  });

  it("tries every step, then keeps the smallest the server takes", () => {
    const over = DOCUMENT_PHOTO_TARGET_BYTES + 1;
    expect(documentPhotoVerdict([over])).toBe("next");
    const sizes = DOCUMENT_PHOTO_STEPS.map((_, at) => over + 10 - at);
    expect(documentPhotoVerdict(sizes)).toEqual({ keep: sizes.length - 1 });
    expect(
      documentPhotoVerdict(
        DOCUMENT_PHOTO_STEPS.map(() => DOCUMENT_PHOTO_MAX_BYTES + 1),
      ),
    ).toBe("tooBig");
  });

  it("starts at the long side the server takes", () => {
    expect(DOCUMENT_PHOTO_STEPS[0]?.pixels).toBe(1600);
  });
});
