import { FILE_CONTENT_POLICY } from "@domain/security-headers";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The route of a document's file (chat C7) with the database stood in for:
// who is signed in (`getOwnPlace`), the opening (`openDocument`, which
// decides, marks and logs), the document's row as the reader reads it
// (`documentToServe`), and its stored file, read with the secret key
// (`documentFileBytes`). It holds the rules of plan §6.3: only the app's own
// request opens a document, never a prefetch or another site's; nobody
// else's document, a view session's, a removed one's or a gone one's is
// anything but the same 404; it looks at the document in the business the
// address names first (so an address with another business in it opens
// nothing), then opens, then reads the row, and only then the file (Orel, 12
// November 2026: the documents bucket has no policy, so every file served
// follows its line in the log), and nothing is read that the opening and the
// row don't agree on; and every answer is kept by nobody, in a sandbox.

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getOwnPlace: vi.fn(),
  openDocument: vi.fn(),
  documentIdForFile: vi.fn(),
  documentFileBytes: vi.fn(),
  documentToServe: vi.fn(),
}));
vi.mock("@db/session", () => ({ getOwnPlace: mocks.getOwnPlace }));
vi.mock("@db/documents", () => ({
  openDocument: mocks.openDocument,
  documentIdForFile: mocks.documentIdForFile,
  documentFileBytes: mocks.documentFileBytes,
  documentToServe: mocks.documentToServe,
}));

const { GET, HEAD } = await import("./route");

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const OTHER = "10000000-0000-4000-b000-000000000002";
const DOCUMENT = "30000000-0000-4000-a000-000000000001";
const USER = "00000000-0000-4000-a000-000000000011";
const KEY = "0123456789abcdef0123456789abcdef";
const PDF = `${BUSINESS}/${KEY}.pdf`;

const asked = (
  file: string,
  headers: Record<string, string> = { "sec-fetch-site": "same-origin" },
  business = BUSINESS,
) =>
  GET(
    new Request(`http://localhost:3000/document-files/${business}/${file}`, {
      headers,
    }),
    { params: Promise.resolve({ business, file }) },
  );

const opened = (more: Record<string, unknown> = {}) => ({
  ok: true,
  value: {
    document: DOCUMENT,
    business: BUSINESS,
    path: PDF,
    kind: "pdf",
    name: "תלוש נובמבר.pdf",
    sample: null,
    ...more,
  },
});

/** The row as the reader reads it (`documentToServe`). */
const row = (more: Record<string, unknown> = {}) => ({
  id: DOCUMENT,
  path: PDF,
  sample: null,
  title: "תלוש נובמבר",
  ...more,
});

const pdfStream = () =>
  new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new TextEncoder().encode("%PDF-1.7\n..."));
      controller.close();
    },
  });

function expectSandboxed(response: Response) {
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("content-security-policy")).toBe(
    FILE_CONTENT_POLICY,
  );
  expect(response.headers.get("cross-origin-resource-policy")).toBe(
    "same-origin",
  );
}

beforeEach(() => {
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.getOwnPlace.mockResolvedValue({
    userId: USER,
    place: null,
    viewing: false,
  });
  mocks.documentToServe.mockResolvedValue(row());
  mocks.openDocument.mockResolvedValue(opened());
  mocks.documentFileBytes.mockImplementation(async () => ({
    kind: "pdf",
    body: pdfStream(),
    name: "תלוש נובמבר.pdf",
  }));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /document-files/<business>/<file>", () => {
  it("opens nothing for another site, a browser that says nothing, or a prefetch", async () => {
    for (const headers of [
      { "sec-fetch-site": "cross-site" },
      { "sec-fetch-site": "same-site" },
      {},
      { "sec-fetch-site": "same-origin", "next-router-prefetch": "1" },
      { "sec-fetch-site": "same-origin", rsc: "1" },
      { "sec-fetch-site": "same-origin", "sec-purpose": "prefetch" },
    ] as Record<string, string>[]) {
      const response = await asked(DOCUMENT, headers);
      expect(response.status, JSON.stringify(headers)).toBe(404);
      expectSandboxed(response);
    }
    expect(mocks.getOwnPlace).not.toHaveBeenCalled();
    expect(mocks.documentToServe).not.toHaveBeenCalled();
    expect(mocks.openDocument).not.toHaveBeenCalled();
  });

  it("serves a PDF as a download: looked at, opened, then its row, then its file", async () => {
    const response = await asked(DOCUMENT, { "sec-fetch-site": "none" });
    expect(response.status).toBe(200);
    expectSandboxed(response);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toBe(
      `attachment; filename="document.pdf"; filename*=UTF-8''${encodeURIComponent("תלוש נובמבר.pdf")}`,
    );
    expect(await response.text()).toBe("%PDF-1.7\n...");
    expect(mocks.openDocument).toHaveBeenCalledWith(USER, DOCUMENT);
    expect(mocks.documentToServe).toHaveBeenCalledTimes(2);
    expect(mocks.documentToServe).toHaveBeenNthCalledWith(
      1,
      BUSINESS,
      DOCUMENT,
    );
    expect(mocks.documentToServe).toHaveBeenNthCalledWith(
      2,
      BUSINESS,
      DOCUMENT,
    );
    expect(mocks.documentFileBytes).toHaveBeenCalledWith(PDF);
    // A look at its row in the business asked for first, the opening (the
    // database's word, its mark and log line) next, the row as the reader
    // reads it then, and only then the file.
    const [look = 0, row = 0] = mocks.documentToServe.mock.invocationCallOrder;
    const open = mocks.openDocument.mock.invocationCallOrder[0] ?? 0;
    const read = mocks.documentFileBytes.mock.invocationCallOrder[0] ?? 0;
    expect(look).toBeLessThan(open);
    expect(open).toBeLessThan(row);
    expect(row).toBeLessThan(read);
  });

  it("serves a photo of a page inline, by its stored name too", async () => {
    const path = `${BUSINESS}/${KEY}.webp`;
    mocks.documentIdForFile.mockResolvedValue(DOCUMENT);
    mocks.documentToServe.mockResolvedValue(row({ path }));
    mocks.openDocument.mockResolvedValue(opened({ path, kind: "image" }));
    mocks.documentFileBytes.mockResolvedValue({
      kind: "image",
      bytes: new Uint8Array([1, 2, 3]),
      type: "image/webp",
    });
    const response = await asked(`${KEY}.webp`);
    expect(response.status).toBe(200);
    expectSandboxed(response);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toBe("inline");
    // By its stored name, the look is the file's own row in that business;
    // the row is read once, after the opening.
    expect(mocks.documentIdForFile).toHaveBeenCalledWith(path);
    expect(mocks.documentToServe).toHaveBeenCalledTimes(1);
  });

  it("serves a demo's sample from the app's own files, by the document's address only", async () => {
    mocks.documentToServe.mockResolvedValue(
      row({ path: null, sample: "payslip", title: "תלוש שכר" }),
    );
    mocks.openDocument.mockResolvedValue(
      opened({ path: null, kind: null, name: null, sample: "payslip" }),
    );
    const response = await asked(DOCUMENT);
    expect(response.status).toBe(200);
    expectSandboxed(response);
    expect(response.headers.get("content-type")).toBe("application/pdf");
    expect(response.headers.get("content-disposition")).toContain(
      encodeURIComponent("תלוש שכר.pdf"),
    );
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe("%PDF-");
    expect(mocks.documentFileBytes).not.toHaveBeenCalled();

    // A sick note's sample is a photo, shown inline.
    mocks.documentToServe.mockResolvedValue(
      row({ path: null, sample: "sick_note", title: "אישור מחלה" }),
    );
    mocks.openDocument.mockResolvedValue(
      opened({ path: null, kind: null, name: null, sample: "sick_note" }),
    );
    const photo = await asked(DOCUMENT);
    expect(photo.headers.get("content-type")).toBe("image/webp");
    expect(photo.headers.get("content-disposition")).toBe("inline");

    // Never by a stored file's name: the database names no file for it.
    mocks.documentToServe.mockClear();
    mocks.documentIdForFile.mockResolvedValue(DOCUMENT);
    expect((await asked(`${KEY}.webp`)).status).toBe(404);
    expect(mocks.documentToServe).not.toHaveBeenCalled();
  });

  it("answers the same 404 for nobody signed in, a view session, and a document not theirs", async () => {
    mocks.getOwnPlace.mockResolvedValueOnce(null);
    expect((await asked(DOCUMENT)).status).toBe(404);
    mocks.getOwnPlace.mockResolvedValueOnce({
      userId: USER,
      place: null,
      viewing: true,
    });
    expect((await asked(DOCUMENT)).status).toBe(404);
    expect(mocks.openDocument).not.toHaveBeenCalled();
    expect(mocks.documentToServe).not.toHaveBeenCalled();

    // Not theirs, or none: no row they read, so nothing is opened.
    mocks.documentToServe.mockResolvedValueOnce(null);
    expect((await asked(DOCUMENT)).status).toBe(404);
    expect(mocks.openDocument).not.toHaveBeenCalled();

    // Or the database's same answer at the opening: nothing more is read,
    // neither the row again nor the file.
    mocks.documentToServe.mockClear();
    mocks.openDocument.mockResolvedValue({ ok: false, failure: "noAccess" });
    const refused = await asked(DOCUMENT);
    expect(refused.status).toBe(404);
    expectSandboxed(refused);
    expect(mocks.documentToServe).toHaveBeenCalledTimes(1);
    expect(mocks.documentFileBytes).not.toHaveBeenCalled();
  });

  it("reads nothing of a removed one, even within its 10 minutes of undo, nor of one whose file is gone", async () => {
    // The row the reader reads says so: nothing is opened by its address.
    mocks.documentToServe.mockResolvedValueOnce(null);
    expect((await asked(DOCUMENT)).status).toBe(404);
    expect(mocks.openDocument).not.toHaveBeenCalled();

    // Removed between that look and the opening: the database serves nothing
    // of it (and logs nothing for it), by either address, and the row isn't
    // read again.
    mocks.documentToServe.mockClear();
    mocks.openDocument.mockResolvedValue(
      opened({ path: null, kind: null, name: null, sample: null }),
    );
    expect((await asked(DOCUMENT)).status).toBe(404);
    mocks.documentIdForFile.mockResolvedValue(DOCUMENT);
    expect((await asked(`${KEY}.pdf`)).status).toBe(404);
    expect(mocks.documentToServe).toHaveBeenCalledTimes(1);
    expect(mocks.documentFileBytes).not.toHaveBeenCalled();

    // Opened just before it was removed: the row the reader reads then says
    // so.
    mocks.openDocument.mockResolvedValue(opened());
    mocks.documentToServe
      .mockResolvedValueOnce(row())
      .mockResolvedValueOnce(null);
    expect((await asked(DOCUMENT)).status).toBe(404);
    expect(mocks.documentFileBytes).not.toHaveBeenCalled();
  });

  it("serves nothing when its file can't be read, its opening already in the log", async () => {
    mocks.documentFileBytes.mockResolvedValue(null);
    expect((await asked(DOCUMENT)).status).toBe(404);
    mocks.documentFileBytes.mockRejectedValue({ code: "storage" });
    const failed = await asked(DOCUMENT);
    expect(failed.status).toBe(404);
    expectSandboxed(failed);
    expect(mocks.openDocument).toHaveBeenCalledTimes(2);
    expect(console.error).toHaveBeenCalledWith(
      "a document's file could not be read",
      "storage",
    );
  });

  it("opens nothing of another business's, and serves nothing of a row that disagrees with the opening or an address in another shape", async () => {
    // This business in the address and another's document in it, typed by
    // someone in the office of both: there is no such row in this business,
    // so nothing is opened, marked or logged in the other.
    mocks.documentToServe.mockResolvedValueOnce(null);
    expect((await asked(DOCUMENT, { "sec-fetch-site": "none" })).status).toBe(
      404,
    );
    expect(mocks.documentToServe).toHaveBeenCalledWith(BUSINESS, DOCUMENT);
    expect(mocks.openDocument).not.toHaveBeenCalled();

    // Should the database's word still be another business: nothing more is
    // read.
    mocks.documentToServe.mockClear();
    mocks.openDocument.mockResolvedValue(opened({ business: OTHER }));
    expect((await asked(DOCUMENT)).status).toBe(404);
    expect(mocks.documentToServe).toHaveBeenCalledTimes(1);

    // The row the reader reads after the opening must say what the database
    // said: the same file, the same sample. Otherwise the file isn't read.
    mocks.openDocument.mockResolvedValue(opened());
    for (const disagrees of [
      row({ path: `${BUSINESS}/${"f".repeat(32)}.pdf` }),
      row({ path: null, sample: "payslip" }),
    ]) {
      mocks.documentToServe
        .mockResolvedValueOnce(row())
        .mockResolvedValueOnce(disagrees);
      expect((await asked(DOCUMENT)).status).toBe(404);
    }
    expect(mocks.documentFileBytes).not.toHaveBeenCalled();

    // A stored file by its name must be the one the document points at.
    mocks.documentToServe.mockClear();
    mocks.documentIdForFile.mockResolvedValue(DOCUMENT);
    mocks.openDocument.mockResolvedValue(
      opened({ path: `${BUSINESS}/${"f".repeat(32)}.pdf` }),
    );
    expect((await asked(`${KEY}.pdf`)).status).toBe(404);
    expect(mocks.documentToServe).not.toHaveBeenCalled();

    mocks.openDocument.mockClear();
    for (const file of [DOCUMENT.toUpperCase(), `${KEY}.svg`, "x"]) {
      expect((await asked(file)).status, file).toBe(404);
    }
    expect((await asked(DOCUMENT, undefined, "nope")).status).toBe(404);
    expect(mocks.openDocument).not.toHaveBeenCalled();
    expect(mocks.documentFileBytes).not.toHaveBeenCalled();
  });

  it("answers HEAD without opening anything", async () => {
    const response = HEAD();
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET");
    expectSandboxed(response);
  });
});
