import { describe, expect, it } from "vitest";
import {
  documentIdInput,
  documentPdfCancelInput,
  documentPdfFinishInput,
  documentPdfStartInput,
  documentRemoveReasonInput,
  documentSampleInput,
  documentSendInput,
} from "./document-sending";

const NOA = "00000000-0000-4000-a000-000000000012";
const UPLOAD = "40000000-0000-4000-a000-000000000001";
const person = (n: number) =>
  `00000000-0000-4000-a000-${n.toString(16).padStart(12, "0")}`;

describe("what the documents' actions take", () => {
  it("reads a document's fields, ids in lower case", () => {
    expect(
      documentSendInput.parse({
        direction: "to_people",
        category: "payslip",
        title: "תלוש שכר",
        to: [NOA.toUpperCase()],
        asks: true,
      }),
    ).toEqual({
      direction: "to_people",
      category: "payslip",
      title: "תלוש שכר",
      to: [NOA],
      asks: true,
    });
    expect(
      documentPdfFinishInput.parse({
        direction: "from_person",
        category: "sick_note",
        title: "אישור מחלה",
        note: null,
        upload: UPLOAD.toUpperCase(),
      }).upload,
    ).toBe(UPLOAD);
  });

  it("takes nothing that is no document: another way, category or key, no one, too many", () => {
    const base = {
      direction: "to_people",
      category: "payslip",
      title: "x",
      to: [NOA],
    };
    for (const input of [
      { ...base, direction: "sideways" },
      { ...base, category: "medical_file" },
      { ...base, file_path: "x" },
      { ...base, to: [] },
      { ...base, to: ["../admin"] },
      { ...base, to: Array.from({ length: 201 }, (_, n) => person(n + 1)) },
      { ...base, title: "x".repeat(1001) },
    ]) {
      expect(documentSendInput.safeParse(input).success).toBe(false);
    }
    expect(
      documentSendInput.safeParse({
        ...base,
        to: Array.from({ length: 200 }, (_, n) => person(n + 1)),
      }).success,
    ).toBe(true);
  });

  it("gives a demo's document no title or note at all", () => {
    expect(
      documentSampleInput.safeParse({
        direction: "from_person",
        category: "sick_note",
      }).success,
    ).toBe(true);
    for (const extra of [{ title: "x" }, { note: "x" }, { upload: UPLOAD }]) {
      expect(
        documentSampleInput.safeParse({
          direction: "from_person",
          category: "sick_note",
          ...extra,
        }).success,
      ).toBe(false);
    }
  });

  it("reads a PDF's start and stop, an id and a reason from the list", () => {
    expect(
      documentPdfStartInput.safeParse({
        direction: "to_people",
        name: "a.pdf",
        size: 10,
      }).success,
    ).toBe(true);
    expect(
      documentPdfStartInput.safeParse({
        direction: "to_people",
        name: "a.pdf",
        size: 1.5,
      }).success,
    ).toBe(false);
    expect(documentPdfCancelInput.safeParse({ upload: "x" }).success).toBe(
      false,
    );
    expect(documentIdInput.safeParse(NOA).success).toBe(true);
    expect(documentIdInput.safeParse("x").success).toBe(false);
    expect(documentRemoveReasonInput.safeParse("wrong_file").success).toBe(
      true,
    );
    expect(documentRemoveReasonInput.safeParse("he was sick").success).toBe(
      false,
    );
  });
});
