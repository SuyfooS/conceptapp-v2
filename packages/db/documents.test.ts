import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The secret key's side as the database answers it: each call recorded, an
 * answer per function, and Storage's writes and removals by bucket.
 */
const admin = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  answers: {} as Record<
    string,
    (args: Record<string, unknown>) => {
      data: unknown;
      error: { code?: string; hint?: string | null } | null;
    }
  >,
  storage: [] as { bucket: string; op: "remove" | "upload"; paths: string[] }[],
}));

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: async (fn: string, args: Record<string, unknown>) => {
      admin.calls.push({ fn, args });
      const answer = admin.answers[fn];
      return answer ? answer(args) : { data: null, error: null };
    },
    storage: {
      from: (bucket: string) => ({
        remove: async (paths: string[]) => {
          admin.storage.push({ bucket, op: "remove", paths });
          return { data: [], error: null };
        },
        upload: async (path: string) => {
          admin.storage.push({ bucket, op: "upload", paths: [path] });
          return { data: { path }, error: null };
        },
      }),
    },
  }),
}));
vi.mock("./supabase/server", () => ({ createClient: async () => ({}) }));

const { documentFailureOf, openDocument, reserveDocumentUpload, sendDocument } =
  await import("./documents");
const { cleanChatFiles } = await import("./chat-files");

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const OTHER = "10000000-0000-4000-b000-000000000002";
const CHAT = "20000000-0000-4000-a000-000000000001";
const ACTOR = "00000000-0000-4000-a000-000000000011";
const NOA = "00000000-0000-4000-a000-000000000012";
const DOCUMENT = "30000000-0000-4000-a000-000000000001";
const UPLOAD = "40000000-0000-4000-a000-000000000001";
const KEY = "0123456789abcdef0123456789abcdef";
const KEY2 = "fedcba9876543210fedcba9876543210";
const KEY3 = "00112233445566778899aabbccddeeff";

const ok = (data: unknown) => () => ({ data, error: null });
const no =
  (code: string, hint: string | null = null) =>
  () => ({
    data: null,
    error: { code, hint },
  });

beforeEach(() => {
  admin.calls = [];
  admin.answers = {};
  admin.storage = [];
});

describe("a document write's refusal", () => {
  it("reads its code and hint, never its words", () => {
    expect(documentFailureOf({ code: "42501" })).toBe("noAccess");
    expect(documentFailureOf({ code: "P0002" })).toBe("noAccess");
    expect(documentFailureOf({ code: "22023" })).toBe("invalid");
    expect(documentFailureOf({ code: "55000" })).toBe("closed");
    expect(documentFailureOf({ code: "54000" })).toBe("tooFast");
    expect(documentFailureOf({ code: "54000", hint: "space" })).toBe("full");
    expect(documentFailureOf({ code: "54000", hint: "storage" })).toBe(
      "noRoom",
    );
    expect(documentFailureOf({ code: "54000", hint: "pdfs" })).toBe("tooMany");
    expect(documentFailureOf({ code: "PGRST202" })).toBe("notYet");
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(documentFailureOf({ code: "XX000" })).toBe("failed");
    expect(logged).toHaveBeenCalledWith("a document write failed", "XX000");
    logged.mockRestore();
  });
});

describe("sendDocument", () => {
  const toPeople = {
    direction: "to_people",
    category: "payslip",
    title: "  תלוש   שכר ",
    to: [NOA.toUpperCase(), NOA],
    asks: true,
    upload: UPLOAD,
  } as const;

  it("checks what the database will before asking it", async () => {
    for (const input of [
      { ...toPeople, category: "sick_note" as const },
      { ...toPeople, title: " " },
      { ...toPeople, note: "א".repeat(301) },
      { ...toPeople, to: [] },
      { ...toPeople, to: ["../admin"] },
      { ...toPeople, upload: "not an id" },
      {
        direction: "from_person" as const,
        category: "sick_note" as const,
        title: "אישור מחלה",
        to: [NOA],
        upload: UPLOAD,
      },
      {
        direction: "from_person" as const,
        category: "form" as const,
        title: "טופס",
        asks: true,
        upload: UPLOAD,
      },
    ]) {
      expect(await sendDocument(ACTOR, BUSINESS, input)).toEqual({
        ok: false,
        failure: "invalid",
      });
    }
    expect(admin.calls).toEqual([]);
  });

  it("sends to people once each, with the title cleaned and the place", async () => {
    admin.answers.send_document = ok(DOCUMENT.toUpperCase());
    expect(await sendDocument(ACTOR, BUSINESS, toPeople)).toEqual({
      ok: true,
      value: { document: DOCUMENT },
    });
    expect(admin.calls).toEqual([
      {
        fn: "send_document",
        args: {
          actor: ACTOR,
          business: BUSINESS,
          send_direction: "to_people",
          send_category: "payslip",
          send_title: "תלוש שכר",
          send_to: [NOA],
          asks: true,
          upload: UPLOAD,
        },
      },
    ]);
  });

  it("sends a demo's sample to the business, with nobody named and no note", async () => {
    admin.answers.send_document = ok(DOCUMENT);
    await sendDocument(ACTOR, BUSINESS, {
      direction: "from_person",
      category: "sick_note",
      title: "אישור מחלה",
      note: "  ",
      sample: "sick_note",
    });
    expect(admin.calls[0]?.args).toEqual({
      actor: ACTOR,
      business: BUSINESS,
      send_direction: "from_person",
      send_category: "sick_note",
      send_title: "אישור מחלה",
      send_sample: "sick_note",
    });
  });

  it("says a demo business takes no file, and the space is full", async () => {
    admin.answers.send_document = no("55000");
    admin.answers.documents_closed = ok(true);
    expect(await sendDocument(ACTOR, BUSINESS, toPeople)).toEqual({
      ok: false,
      failure: "demo",
    });
    admin.answers.send_document = no("54000", "space");
    expect(await sendDocument(ACTOR, BUSINESS, toPeople)).toEqual({
      ok: false,
      failure: "full",
    });
  });
});

describe("reserveDocumentUpload", () => {
  const input = {
    direction: "from_person",
    kind: "pdf",
    type: "application/pdf",
    size: 120_000,
    name: "אישור.pdf",
  } as const;

  it("gives the place the database made, in the business's folder", async () => {
    const path = `${BUSINESS}/${KEY}.pdf`;
    admin.answers.reserve_document_upload = ok({ upload: UPLOAD, path });
    expect(await reserveDocumentUpload(ACTOR, BUSINESS, input)).toEqual({
      ok: true,
      value: { upload: UPLOAD, path },
    });
    expect(admin.calls[0]?.args).toMatchObject({
      upload_direction: "from_person",
      upload_kind: "pdf",
      upload_type: "application/pdf",
      upload_size: 120_000,
      upload_name: "אישור.pdf",
    });
  });

  it("refuses a path in another business's folder, or of another kind", async () => {
    for (const path of [
      `${OTHER}/${KEY}.pdf`,
      `${BUSINESS}/${KEY}.webp`,
      `${BUSINESS}/${CHAT}/${KEY}.pdf`,
    ]) {
      admin.answers.reserve_document_upload = ok({ upload: UPLOAD, path });
      expect(await reserveDocumentUpload(ACTOR, BUSINESS, input), path).toEqual(
        { ok: false, failure: "failed" },
      );
    }
  });

  it("says the business's space and the project's are full", async () => {
    admin.answers.reserve_document_upload = no("54000", "space");
    expect(await reserveDocumentUpload(ACTOR, BUSINESS, input)).toEqual({
      ok: false,
      failure: "full",
    });
    admin.answers.reserve_document_upload = no("54000", "storage");
    expect(await reserveDocumentUpload(ACTOR, BUSINESS, input)).toEqual({
      ok: false,
      failure: "noRoom",
    });
  });
});

describe("openDocument", () => {
  const opened = (path: string | null) => ({
    document: DOCUMENT,
    business: BUSINESS,
    path,
    kind: path ? "pdf" : null,
    name: null,
    sample: path ? null : "payslip",
  });

  it("gives where its file is, or its sample", async () => {
    admin.answers.open_document = ok(opened(`${BUSINESS}/${KEY}.pdf`));
    expect(await openDocument(ACTOR, DOCUMENT)).toMatchObject({
      ok: true,
      value: { path: `${BUSINESS}/${KEY}.pdf` },
    });
    admin.answers.open_document = ok(opened(null));
    expect(await openDocument(ACTOR, DOCUMENT)).toMatchObject({
      ok: true,
      value: { path: null, sample: "payslip" },
    });
  });

  it("serves no path outside the document's business, and nothing unknown", async () => {
    admin.answers.open_document = ok(opened(`${OTHER}/${KEY}.pdf`));
    expect(await openDocument(ACTOR, DOCUMENT)).toEqual({
      ok: false,
      failure: "failed",
    });
    admin.answers.open_document = no("P0002");
    expect(await openDocument(ACTOR, DOCUMENT)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    expect(await openDocument(ACTOR, "../x")).toEqual({
      ok: false,
      failure: "noAccess",
    });
  });
});

describe("the chat job's clean-up, with documents", () => {
  it("removes each file from its own bucket, a document's PDF with its tombstone while its upload may write", async () => {
    const chatPicture = `${BUSINESS}/${CHAT}/${KEY}.webp`;
    const documentPdf = `${BUSINESS}/${KEY2}.pdf`;
    const documentPhoto = `${BUSINESS}/${KEY3}.jpg`;
    const notADocument = `${BUSINESS}/${CHAT}/${KEY3}.pdf`;
    admin.answers.expired_files = ok([
      { bucket: "chat-files", path: chatPicture },
      { bucket: "documents", path: documentPdf },
      { bucket: "documents", path: documentPhoto },
      { bucket: "documents", path: notADocument },
      { bucket: "avatars", path: `${BUSINESS}/${KEY}.webp` },
    ]);
    admin.answers.chat_paths_signed = (args) => ({
      data: (args.paths as string[]).filter((path) => path === documentPdf),
      error: null,
    });
    admin.answers.forget_files = ok(3);

    expect(await cleanChatFiles()).toBe(3);
    expect(admin.storage).toEqual([
      { bucket: "chat-files", op: "remove", paths: [chatPicture] },
      { bucket: "documents", op: "upload", paths: [documentPdf] },
      { bucket: "documents", op: "remove", paths: [documentPhoto] },
    ]);
    // Only the documents' paths were asked about, with a PDF among them.
    expect(
      admin.calls
        .filter((call) => call.fn === "chat_paths_signed")
        .map((call) => call.args.paths),
    ).toEqual([[documentPdf, documentPhoto]]);
    // Every path listed is marked, so none is listed again.
    expect(admin.calls.at(-1)).toEqual({
      fn: "forget_files",
      args: {
        paths: [
          chatPicture,
          documentPdf,
          documentPhoto,
          notADocument,
          `${BUSINESS}/${KEY}.webp`,
        ],
      },
    });
  });
});
