import { describe, expect, it } from "vitest";
import {
  audienceOf,
  type DocumentShown,
  documentDirectory,
  documentMonths,
  documentPeople,
  indexOf,
  matchesFilters,
  ownMark,
  peopleOf,
  recipientsSummary,
  stateFor,
  waitsFor,
} from "./documents-screen";

const NOA = "00000000-0000-4000-a000-000000000003";
const YOAV = "00000000-0000-4000-a000-000000000004";
const URI = "00000000-0000-4000-a000-000000000001";
const SHIRAN = "00000000-0000-4000-a000-000000000002";

const office = { id: URI, office: true };
const noa = { id: NOA, office: false };

function shown(overrides: Partial<DocumentShown>): DocumentShown {
  return {
    id: "10000000-0000-4000-a000-000000000001",
    direction: "from_person",
    personId: NOA,
    authorId: NOA,
    category: "sick_note",
    title: "אישור מחלה",
    note: null,
    asksConfirmation: false,
    sentAt: "2026-11-10T07:30:00.000Z",
    openedAt: null,
    openedBy: null,
    removedAt: null,
    removedBy: null,
    removedReason: null,
    fileGoneAfter: null,
    hasFile: true,
    fileKind: "image",
    fileName: null,
    fileSize: 1000,
    fileSrc: null,
    sample: null,
    recipients: [],
    src: null,
    shownKind: "image",
    ...overrides,
  };
}

const procedure = shown({
  id: "10000000-0000-4000-a000-000000000002",
  direction: "to_people",
  personId: null,
  authorId: SHIRAN,
  category: "procedure",
  asksConfirmation: true,
  sentAt: "2026-11-11T10:00:00.000Z",
  recipients: [
    {
      documentId: "10000000-0000-4000-a000-000000000002",
      personId: NOA,
      openedAt: null,
      confirmedAt: null,
    },
    {
      documentId: "10000000-0000-4000-a000-000000000002",
      personId: YOAV,
      openedAt: "2026-11-11T12:00:00.000Z",
      confirmedAt: "2026-11-11T12:02:00.000Z",
    },
  ],
});

describe("a document for its reader", () => {
  it("finds the reader's own mark, and none for someone it wasn't sent to", () => {
    expect(ownMark(procedure, { id: YOAV })).toEqual({
      openedAt: "2026-11-11T12:00:00.000Z",
      confirmedAt: "2026-11-11T12:02:00.000Z",
    });
    expect(ownMark(procedure, { id: URI })).toBeNull();
  });

  it("is a task for a recipient asked to confirm, and sent for the office", () => {
    expect(stateFor(procedure, noa)).toBe("toConfirm");
    expect(stateFor(procedure, { id: YOAV, office: false })).toBe("confirmed");
    expect(stateFor(procedure, office)).toBe("sent");
  });

  it("is about its person, or its recipients", () => {
    expect(peopleOf(shown({}))).toEqual([NOA]);
    expect(peopleOf(procedure)).toEqual([NOA, YOAV]);
  });
});

describe("what waits", () => {
  it("waits for the office until someone there opens it, never their own", () => {
    expect(waitsFor(shown({}), office)).toBe(true);
    expect(
      waitsFor(shown({ openedAt: "2026-11-10T09:00:00.000Z" }), office),
    ).toBe(false);
    expect(waitsFor(shown({ personId: URI, authorId: URI }), office)).toBe(
      false,
    );
    expect(waitsFor(shown({}), noa)).toBe(false);
  });

  it("waits for a recipient's confirmation, and never once removed", () => {
    expect(waitsFor(procedure, noa)).toBe(true);
    expect(
      waitsFor({ ...procedure, removedAt: "2026-11-11T11:00:00.000Z" }, noa),
    ).toBe(false);
  });

  it("counts opened and confirmed", () => {
    expect(recipientsSummary(procedure.recipients)).toEqual({
      total: 2,
      opened: 1,
      confirmed: 1,
    });
  });
});

describe("the office's people", () => {
  it("lists who documents are about, those with something waiting first", () => {
    const people = documentPeople([shown({}), procedure], office);
    expect(people.map((p) => [p.id, p.count, p.waiting])).toEqual([
      [NOA, 2, 1],
      [YOAV, 1, 0],
    ]);
    expect(people[0]?.latest).toBe("2026-11-11T10:00:00.000Z");
  });

  it("counts everyone over every document, never only those the screen read", () => {
    // 250 old payslips to Yoav, and one to Shiran, past the newest 200 the
    // screen holds: they are still in the list, with their counts.
    const old = Array.from({ length: 250 }, (_, at) => ({
      id: `20000000-0000-4000-a000-${String(at).padStart(12, "0")}`,
      direction: "to_people" as const,
      personId: null,
      sentAt: "2025-01-10T07:30:00.000Z",
    }));
    const index = indexOf([shown({}), procedure]);
    const people = documentDirectory(
      {
        documents: [
          ...index.documents,
          ...old,
          {
            id: "20000000-0000-4000-b000-000000000001",
            direction: "from_person",
            personId: SHIRAN,
            sentAt: "2024-05-01T07:30:00.000Z",
          },
        ],
        recipients: [
          ...index.recipients,
          ...old.map((document) => ({
            documentId: document.id,
            personId: YOAV,
          })),
          // A page read twice repeats a mark: counted once.
          ...old.slice(0, 3).map((document) => ({
            documentId: document.id,
            personId: YOAV,
          })),
        ],
      },
      [shown({}), procedure],
      office,
    );
    expect(people.map((p) => [p.id, p.count, p.waiting])).toEqual([
      [NOA, 2, 1],
      [YOAV, 251, 0],
      [SHIRAN, 1, 0],
    ]);
    // A document the screen read after the index still counts, once.
    const late = shown({
      id: "10000000-0000-4000-a000-000000000009",
      sentAt: "2026-11-12T07:30:00.000Z",
    });
    const again = documentDirectory(
      index,
      [shown({}), procedure, late],
      office,
    );
    expect(again.map((p) => [p.id, p.count, p.waiting])).toEqual([
      [NOA, 3, 2],
      [YOAV, 1, 0],
    ]);
  });
});

describe("the office's filters", () => {
  const all = { person: null, category: null, state: "all" } as const;

  it("narrows to a person, a category and a state", () => {
    expect(matchesFilters(procedure, { ...all, person: YOAV }, office)).toBe(
      true,
    );
    expect(matchesFilters(shown({}), { ...all, person: YOAV }, office)).toBe(
      false,
    );
    expect(
      matchesFilters(shown({}), { ...all, category: "procedure" }, office),
    ).toBe(false);
    expect(
      matchesFilters(shown({}), { ...all, state: "waiting" }, office),
    ).toBe(true);
    expect(
      matchesFilters(procedure, { ...all, state: "unconfirmed" }, office),
    ).toBe(true);
    expect(
      matchesFilters(procedure, { ...all, state: "removed" }, office),
    ).toBe(false);
  });
});

describe("months", () => {
  it("names the months documents were sent in, in the business's clock", () => {
    expect(
      documentMonths(
        [
          { sentAt: "2026-10-31T22:30:00.000Z" },
          { sentAt: "2026-10-15T10:00:00.000Z" },
          { sentAt: "nonsense" },
        ],
        "Asia/Jerusalem",
      ),
    ).toEqual(["2026-11", "2026-10"]);
  });
});

describe("to whom a document goes", () => {
  const staff = [URI, SHIRAN, NOA, YOAV];
  const departments = [{ id: "kitchen", members: [NOA, SHIRAN] }];

  it("resolves a person, a department or everyone, never the sender", () => {
    expect(
      audienceOf({ kind: "person", person: NOA }, staff, departments, SHIRAN),
    ).toEqual([NOA]);
    expect(
      audienceOf(
        { kind: "department", department: "kitchen" },
        staff,
        departments,
        SHIRAN,
      ),
    ).toEqual([NOA]);
    expect(
      audienceOf({ kind: "everyone" }, staff, departments, SHIRAN),
    ).toEqual([URI, NOA, YOAV].sort());
  });

  it("takes nobody off the staff, and nothing before a choice", () => {
    expect(
      audienceOf(
        { kind: "person", person: "00000000-0000-4000-a000-000000000014" },
        staff,
        departments,
        SHIRAN,
      ),
    ).toEqual([]);
    expect(
      audienceOf({ kind: "person", person: null }, staff, departments, SHIRAN),
    ).toEqual([]);
    expect(
      audienceOf(
        { kind: "department", department: null },
        staff,
        departments,
        SHIRAN,
      ),
    ).toEqual([]);
  });
});
