import { describe, expect, it } from "vitest";
import {
  csvOf,
  DOCUMENTS_DOWNLOAD_PATH,
  documentsDownloadField,
  documentsDownloadOf,
  downloadAsciiName,
  downloadEntryName,
  downloadListName,
  downloadName,
  isMonth,
} from "./documents-download";

const PERSON = "00000000-0000-4000-a000-000000000012";
const params = (query: string) => new URLSearchParams(query);
const text = (bytes: Uint8Array) => new TextDecoder().decode(bytes);
/** The marks that turn text around: right-to-left override, right-to-left mark. */
const RLO = String.fromCharCode(0x202e);
const RLM = String.fromCharCode(0x200f);

describe("what a download is of", () => {
  it("is one person's documents, or a month's", () => {
    expect(
      documentsDownloadOf(params(`person=${PERSON.toUpperCase()}`)),
    ).toEqual({ person: PERSON });
    expect(documentsDownloadOf(params("month=2026-11"))).toEqual({
      month: "2026-11",
    });
  });

  it("is nothing else: both, neither, more, or a month that isn't one", () => {
    for (const query of [
      "",
      `person=${PERSON}&month=2026-11`,
      `person=${PERSON}&x=1`,
      `person=${PERSON}&person=${PERSON}`,
      "person=../admin",
      "month=2026-13",
      "month=2026-1",
      "month=1999-01",
      "month=2026-11-01",
    ]) {
      expect(documentsDownloadOf(params(query)), query).toBe(null);
    }
    expect(isMonth("2026-00")).toBe(false);
    expect(isMonth("2100-12")).toBe(true);
  });

  it("is asked for by the page's form, at its route, with its one field", () => {
    expect(DOCUMENTS_DOWNLOAD_PATH).toBe("/document-files/download");
    const person = documentsDownloadField({ person: PERSON });
    const month = documentsDownloadField({ month: "2026-11" });
    expect(person).toEqual({ name: "person", value: PERSON });
    expect(month).toEqual({ name: "month", value: "2026-11" });
    // What the form sends is what the route reads back.
    for (const field of [person, month]) {
      const sent = new URLSearchParams([[field.name, field.value]]);
      expect(documentsDownloadOf(sent)).toEqual({ [field.name]: field.value });
    }
  });
});

describe("the names in a download", () => {
  it("number each file, keep its words and its type, and drop what a file system refuses", () => {
    expect(
      downloadEntryName(7, ["2026-11-10", "נועה", "אישור מחלה"], "webp"),
    ).toBe("007 2026-11-10 - נועה - אישור מחלה.webp");
    expect(
      downloadEntryName(12, ["2026-11-10", 'a/b\\c:d*e?"f<g>h|i'], "pdf"),
    ).toBe("012 2026-11-10 - a b c d e f g h i.pdf");
    // A direction mark can't turn "fdp.exe" into "exe.pdf".
    expect(downloadEntryName(1, [`${RLO}exe.pdf`, `${RLM}title`], "pdf")).toBe(
      "001 exe.pdf - title.pdf",
    );
  });

  it("keep a long one to 120 characters with its type", () => {
    const name = downloadEntryName(1, ["א".repeat(300)], "pdf");
    expect([...name].length).toBe(120);
    expect(name.endsWith(".pdf")).toBe(true);
    expect(name.startsWith("001 ")).toBe(true);
  });

  it("give the archive a name in words and one in ASCII", () => {
    expect(downloadName("מסמכים - המסעדה - 2026-11")).toBe(
      "מסמכים - המסעדה - 2026-11.zip",
    );
    expect(downloadName("a/b")).toBe("a b.zip");
    expect(downloadListName("רשימת המסמכים")).toBe("רשימת המסמכים.csv");
    expect(downloadAsciiName("Demo Restaurant!", { month: "2026-11" })).toBe(
      "documents-demo-restaurant-2026-11.zip",
    );
    expect(downloadAsciiName("קפה", { person: PERSON })).toBe(
      "documents-business-person.zip",
    );
    const long = downloadAsciiName("x".repeat(200), { month: "2026-11" });
    expect(long.length).toBeLessThanOrEqual(64);
    expect(long).toMatch(/^[A-Za-z0-9._-]+$/);
  });
});

describe("the list as CSV", () => {
  it("is UTF-8 with a byte order mark, every field quoted, lines ended CRLF", () => {
    const bytes = csvOf([
      ["מספר", "שם"],
      ["1", 'נועה "הגדולה"'],
    ]);
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(text(bytes.slice(3))).toBe(
      '"מספר","שם"\r\n"1","נועה ""הגדולה"""\r\n',
    );
  });

  it("defuses a formula anyone could type in a title, and keeps each row on one line", () => {
    const csv = text(
      csvOf([['=HYPERLINK("x")', "+1", "-2", "@a", "line\nbreak\r\nhere"]]),
    );
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
    expect(csv).toContain(`"'+1","'-2","'@a"`);
    expect(csv).toContain('"line break here"');
    expect(csv.slice(1).split("\r\n")).toHaveLength(2);
  });
});
