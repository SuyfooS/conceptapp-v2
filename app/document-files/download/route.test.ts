import { FILE_CONTENT_POLICY } from "@domain/security-headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { unzip } from "@/e2e/unzip";

// "הורדת כל המסמכים" (chat C7) with the database stood in for: who is asking
// (`documentsAccess`), the documents and people they read, each document's
// row and file, and each opening (`openDocument`, which marks and logs). It
// holds the rules: the page's own form alone (a POST from the app's own
// origin, never a link, followed in the app or from outside it), the office
// alone, never a view session; every document, past the newest 200 too, and
// every file still kept goes in, read first and opened once after, a removed
// one in the list only; and the list says what each is, in the business's
// words, with nothing a spreadsheet would run.

vi.mock("server-only", () => ({}));

const ORIGIN = "http://localhost:3000";
const BUSINESS = "10000000-0000-4000-b000-000000000001";
const OWNER = "00000000-0000-4000-a000-000000000011";
const NOA = "00000000-0000-4000-a000-000000000012";
const YOAV = "00000000-0000-4000-a000-000000000013";
const SICK = "30000000-0000-4000-a000-000000000001";
const PAYSLIP = "30000000-0000-4000-a000-000000000002";
const KEY = "0123456789abcdef0123456789abcdef";
const PDF = `${BUSINESS}/${KEY}.pdf`;

const mocks = vi.hoisted(() => ({
  documentsAccess: vi.fn(),
  getDocumentsToKeep: vi.fn(),
  documentToServe: vi.fn(),
  openDocument: vi.fn(),
  documentFileBytes: vi.fn(),
  seeDocumentsNotice: vi.fn(),
  getChatAuthors: vi.fn(),
}));
vi.mock("../../(app)/chat/documents/documents-access", () => ({
  documentsAccess: mocks.documentsAccess,
}));
vi.mock("../../(app)/current-wording", async () => {
  const { baseWording } = await import("../../(app)/wording");
  return { currentWording: async () => baseWording };
});
vi.mock("@/app/origin", () => ({ requestOrigin: async () => ORIGIN }));
vi.mock("@db/documents", () => ({
  getDocumentsToKeep: mocks.getDocumentsToKeep,
  documentToServe: mocks.documentToServe,
  openDocument: mocks.openDocument,
  documentFileBytes: mocks.documentFileBytes,
  seeDocumentsNotice: mocks.seeDocumentsNotice,
  documentSession: async () => ({ session: "the reader's" }),
}));
vi.mock("@db/chat", () => ({ getChatAuthors: mocks.getChatAuthors }));

const { GET, HEAD, POST } = await import("./route");

const office = {
  userId: OWNER,
  businessId: BUSINESS,
  businessName: "המסעדה",
  businessSlug: "demo-restaurant",
  role: "owner",
  timeZone: "Asia/Jerusalem",
  viewing: false,
  demo: false,
  staff: true,
  office: true,
  sends: true,
};

/** A document as @db/documents reads it. */
const document = (more: Record<string, unknown>) => ({
  id: SICK,
  direction: "from_person",
  personId: NOA,
  authorId: NOA,
  category: "sick_note",
  title: '=HYPERLINK("x")',
  note: null,
  asksConfirmation: false,
  sentAt: "2026-11-10T06:30:00Z",
  openedAt: "2026-11-10T07:00:00Z",
  openedBy: OWNER,
  removedAt: null,
  removedBy: null,
  removedReason: null,
  fileGoneAfter: null,
  hasFile: true,
  fileKind: "pdf",
  fileName: "a.pdf",
  fileSize: 12,
  fileSrc: null,
  sample: null,
  recipients: [],
  src: `/document-files/${BUSINESS}/${SICK}`,
  shownKind: "pdf",
  ...more,
});

const FORM = "application/x-www-form-urlencoded";
const OWN = { "sec-fetch-site": "same-origin", origin: ORIGIN };

/** The page's form, sending `body` (`person=…` or `month=…`). */
const asked = (
  body: string,
  headers: Record<string, string> = OWN,
  address = `${ORIGIN}/document-files/download`,
) =>
  POST(
    new Request(address, {
      method: "POST",
      headers: { "content-type": FORM, ...headers },
      body,
    }),
  );

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.documentsAccess.mockResolvedValue(office);
  mocks.getChatAuthors.mockResolvedValue([
    { id: NOA, name: "נועה", photo: null },
    { id: OWNER, name: "אורי", photo: null },
  ]);
  mocks.seeDocumentsNotice.mockResolvedValue({ ok: true, value: null });
  mocks.documentToServe.mockImplementation(async (_, id: string) => ({
    id,
    path: PDF,
    sample: null,
    title: "a",
  }));
  mocks.openDocument.mockImplementation(async (_, id: string) => ({
    ok: true,
    value: {
      document: id,
      business: BUSINESS,
      path: PDF,
      kind: "pdf",
      name: "a.pdf",
      sample: null,
    },
  }));
  mocks.documentFileBytes.mockImplementation(async () => ({
    kind: "pdf",
    name: "a.pdf",
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("%PDF-1.7"));
        controller.enqueue(new TextEncoder().encode("\n%%EOF"));
        controller.close();
      },
    }),
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /document-files/download", () => {
  it("downloads nothing for a link: a GET followed in the app or from outside it, or HEAD", () => {
    for (const response of [GET(), HEAD()]) {
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.documentsAccess).not.toHaveBeenCalled();
    expect(mocks.openDocument).not.toHaveBeenCalled();
  });

  it("answers only the page's own form: not another site's, nor one from outside the browser", async () => {
    for (const headers of [
      { "sec-fetch-site": "cross-site", origin: "https://evil.test" },
      { "sec-fetch-site": "same-site", origin: "https://x.localhost:3000" },
      { "sec-fetch-site": "none", origin: ORIGIN },
      { origin: ORIGIN },
      { "sec-fetch-site": "same-origin" },
      { "sec-fetch-site": "same-origin", origin: "https://evil.test" },
      { "sec-fetch-site": "same-origin", origin: "null" },
    ] as Record<string, string>[]) {
      const response = await asked(`person=${NOA}`, headers);
      expect(response.status, JSON.stringify(headers)).toBe(404);
      expect(response.headers.get("cache-control")).toBe("private, no-store");
    }
    expect(mocks.documentsAccess).not.toHaveBeenCalled();
    expect(mocks.getDocumentsToKeep).not.toHaveBeenCalled();
    expect(mocks.openDocument).not.toHaveBeenCalled();
  });

  it("gives nothing to anyone but the office, a view session, or a form in another shape", async () => {
    for (const access of [
      null,
      { ...office, office: false },
      { ...office, viewing: true },
    ]) {
      mocks.documentsAccess.mockResolvedValueOnce(access);
      const response = await asked(`person=${NOA}`);
      expect(response.status).toBe(404);
    }
    for (const body of ["", "month=2026-13", `person=${NOA}&month=2026-11`]) {
      expect((await asked(body)).status, body).toBe(404);
    }
    // Its one field in the form, never in the address.
    expect(
      (
        await asked(
          `person=${NOA}`,
          OWN,
          `${ORIGIN}/document-files/download?month=2026-11`,
        )
      ).status,
    ).toBe(404);
    // A form's own type and size, nothing larger.
    expect(
      (
        await POST(
          new Request(`${ORIGIN}/document-files/download`, {
            method: "POST",
            headers: { "content-type": "application/json", ...OWN },
            body: JSON.stringify({ person: NOA }),
          }),
        )
      ).status,
    ).toBe(404);
    expect((await asked(`person=${NOA}&x=${"a".repeat(2000)}`)).status).toBe(
      404,
    );
    expect(mocks.getDocumentsToKeep).not.toHaveBeenCalled();
    expect(mocks.openDocument).not.toHaveBeenCalled();
  });

  it("puts each kept file in a ZIP, read first and opened once, and lists them all", async () => {
    mocks.getDocumentsToKeep.mockResolvedValue({
      more: false,
      documents: [
        // Oldest first, as read: Noa's sick note, then a payslip to Noa and
        // Yoav whose file was removed.
        document({}),
        document({
          id: PAYSLIP,
          direction: "to_people",
          personId: null,
          authorId: OWNER,
          category: "payslip",
          title: "תלוש שכר",
          asksConfirmation: true,
          sentAt: "2026-11-11T08:00:00Z",
          openedAt: null,
          removedAt: "2026-11-11T08:05:00Z",
          removedBy: OWNER,
          removedReason: "wrong_person",
          fileGoneAfter: "2026-11-11T08:15:00Z",
          src: null,
          recipients: [
            {
              documentId: PAYSLIP,
              personId: NOA,
              openedAt: "2026-11-11T08:01:00Z",
              confirmedAt: null,
            },
            {
              documentId: PAYSLIP,
              personId: YOAV,
              openedAt: null,
              confirmedAt: null,
            },
          ],
        }),
      ],
    });
    const response = await asked(`person=${NOA.toUpperCase()}`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("application/zip");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-security-policy")).toBe(
      FILE_CONTENT_POLICY,
    );
    const disposition = response.headers.get("content-disposition") ?? "";
    expect(disposition).toMatch(
      /^attachment; filename="documents-demo-restaurant-person\.zip"; filename\*=UTF-8''/,
    );
    expect(decodeURIComponent(disposition.split("''")[1] ?? "")).toBe(
      "מסמכים - המסעדה - נועה.zip",
    );

    expect(mocks.getDocumentsToKeep).toHaveBeenCalledWith(
      BUSINESS,
      { person: NOA },
      5000,
    );
    const entries = unzip(new Uint8Array(await response.arrayBuffer()));
    // Its title's quotes go from the name (a file system refuses them).
    const pdf = "001 2026-11-10 - נועה - אישור מחלה - =HYPERLINK( x ).pdf";
    expect([...entries.keys()]).toEqual([pdf, "רשימת המסמכים.csv"]);
    expect(entries.get(pdf)?.data.toString("latin1")).toBe("%PDF-1.7\n%%EOF");
    // Each file read under the reader's session, then opened once; the
    // removed one neither read nor opened.
    expect(mocks.documentToServe).toHaveBeenCalledTimes(1);
    expect(mocks.documentToServe).toHaveBeenCalledWith(BUSINESS, SICK, {
      session: "the reader's",
    });
    expect(mocks.documentFileBytes).toHaveBeenCalledWith(PDF, {
      session: "the reader's",
    });
    expect(mocks.openDocument).toHaveBeenCalledTimes(1);
    expect(mocks.openDocument).toHaveBeenCalledWith(OWNER, SICK);
    expect(
      mocks.documentFileBytes.mock.invocationCallOrder[0] ?? 0,
    ).toBeLessThan(mocks.openDocument.mock.invocationCallOrder[0] ?? 0);
    expect(mocks.seeDocumentsNotice).toHaveBeenCalledWith(OWNER, BUSINESS);

    const csv = entries.get("רשימת המסמכים.csv")?.data.toString("utf8") ?? "";
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines).toEqual([
      '"מספר","שם","לאן","סוג","כותרת","הערה","נשלח","מי שלח","נפתח","אישור קריאה","קובץ"',
      `"1","נועה","לעסק","אישור מחלה","'=HYPERLINK(""x"")","","2026-11-10 08:30","נועה","2026-11-10 09:00","לא התבקש","${pdf}"`,
      // Only Noa's mark: the download is hers.
      '"2","נועה","מהעסק","תלוש שכר","תלוש שכר","","2026-11-11 10:00","אורי","2026-11-11 10:01","עוד לא אושר","הקובץ נמחק: נשלח לאדם הלא נכון"',
    ]);
  });

  it("opens nothing it couldn't read: the list says the file isn't in it", async () => {
    mocks.getDocumentsToKeep.mockResolvedValue({
      more: false,
      documents: [document({})],
    });
    mocks.documentFileBytes.mockResolvedValue(null);
    const response = await asked(`person=${NOA}`);
    const entries = unzip(new Uint8Array(await response.arrayBuffer()));
    expect([...entries.keys()]).toEqual(["רשימת המסמכים.csv"]);
    expect(entries.get("רשימת המסמכים.csv")?.data.toString("utf8")).toContain(
      "הקובץ לא נכלל בהורדה",
    );
    expect(mocks.openDocument).not.toHaveBeenCalled();
  });

  it("downloads a month's, every one of it past the newest 200, in the business's clock", async () => {
    // 230 documents in the month: each one goes in, numbered in order.
    const many = Array.from({ length: 230 }, (_, at) =>
      document({
        id: `30000000-0000-4000-b000-${String(at).padStart(12, "0")}`,
        sentAt: new Date(Date.UTC(2026, 10, 2, 6, at)).toISOString(),
      }),
    );
    mocks.getDocumentsToKeep.mockResolvedValue({ more: true, documents: many });
    const response = await asked("month=2026-11");
    expect(response.status).toBe(200);
    const [, of, most] = mocks.getDocumentsToKeep.mock.calls[0] ?? [];
    expect(of).toEqual({
      sentFrom: new Date("2026-10-31T22:00:00Z"),
      sentBefore: new Date("2026-11-30T22:00:00Z"),
    });
    expect(most).toBe(5000);
    const entries = unzip(new Uint8Array(await response.arrayBuffer()));
    expect(entries.size).toBe(231);
    expect([...entries.keys()][229]).toMatch(/^230 2026-11-02 /);
    expect(mocks.openDocument).toHaveBeenCalledTimes(230);
    // Past the most one download holds, its list says what was left out.
    const csv = entries.get("רשימת המסמכים.csv")?.data.toString("utf8") ?? "";
    expect(csv.trimEnd().split("\r\n").at(-1)).toContain("5,000");
  });
});
