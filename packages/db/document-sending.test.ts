import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The secret key's side as the database and Storage answer it (chat C7's
 * sending of documents with a file of their own): each call recorded, an
 * answer per function, and Storage's writes, removals and signed links.
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
  storage: [] as {
    bucket: string;
    op: "remove" | "upload" | "signUpload" | "sign";
    paths: string[];
    upsert?: boolean;
    size?: number;
  }[],
  signedUploadBucket: "documents",
}));

const SUPABASE = "http://127.0.0.1:54321";

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
        upload: async (
          path: string,
          data: Uint8Array,
          options: { upsert?: boolean },
        ) => {
          admin.storage.push({
            bucket,
            op: "upload",
            paths: [path],
            upsert: options.upsert,
            size: data.length,
          });
          return { data: { path }, error: null };
        },
        createSignedUploadUrl: async (path: string) => {
          admin.storage.push({ bucket, op: "signUpload", paths: [path] });
          return {
            data: {
              signedUrl: `${SUPABASE}/storage/v1/object/upload/sign/${admin.signedUploadBucket}/${path}?token=t`,
            },
            error: null,
          };
        },
        createSignedUrl: async (path: string) => {
          admin.storage.push({ bucket, op: "sign", paths: [path] });
          return {
            data: {
              signedUrl: `${SUPABASE}/storage/v1/object/sign/${bucket}/${path}?token=t`,
            },
            error: null,
          };
        },
      }),
    },
  }),
}));
vi.mock("./supabase/server", () => ({ createClient: async () => ({}) }));
vi.mock("./env", () => ({
  publicEnv: () => ({ url: SUPABASE, publishableKey: "sb_publishable_test" }),
}));

const {
  cancelDocumentPdf,
  finishDocumentPdf,
  seeDocumentsNotice,
  sendDocumentPhoto,
  sendDocumentSample,
  startDocumentPdf,
} = await import("./documents");

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const ACTOR = "00000000-0000-4000-a000-000000000011";
const NOA = "00000000-0000-4000-a000-000000000012";
const DOCUMENT = "30000000-0000-4000-a000-000000000001";
const UPLOAD = "40000000-0000-4000-a000-000000000001";
const KEY = "0123456789abcdef0123456789abcdef";
const PHOTO_PATH = `${BUSINESS}/${KEY}.webp`;
const PDF_PATH = `${BUSINESS}/${KEY}.pdf`;

const ok = (data: unknown) => () => ({ data, error: null });
const no =
  (code: string, hint: string | null = null) =>
  () => ({ data: null, error: { code, hint } });

/** A still WebP as the screen's re-encoding makes one: 1 x 1, no metadata. */
function webp(): Blob {
  const stream = [0x2f, 0, 0, 0, 0];
  const bytes = new Uint8Array(12 + 8 + stream.length + 1);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12);
  view.setUint32(16, stream.length, true);
  bytes.set(stream, 20);
  return new Blob([bytes], { type: "image/webp" });
}

const sickNote = {
  direction: "from_person",
  category: "sick_note",
  title: "אישור מחלה",
} as const;

/** The place `document_upload_place` gives back. */
const place = (more: Record<string, unknown> = {}) => ({
  upload: UPLOAD,
  path: PDF_PATH,
  kind: "pdf",
  size: 2048,
  name: "אישור.pdf",
  used: false,
  document: null,
  fresh: true,
  ...more,
});

/** Storage's answer to the server's ranged read of a PDF's first KB. */
function stored(bytes: string | null) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      bytes === null
        ? new Response(null, { status: 404 })
        : new Response(new TextEncoder().encode(bytes), { status: 206 }),
    ),
  );
}

beforeEach(() => {
  admin.calls = [];
  admin.answers = { documents_closed: ok(false) };
  admin.storage = [];
  admin.signedUploadBucket = "documents";
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("sendDocumentPhoto", () => {
  it("refuses what the database would before reserving anything", async () => {
    for (const input of [
      { ...sickNote, category: "payslip" as const },
      { ...sickNote, title: "  " },
      { ...sickNote, to: [NOA] },
      { ...sickNote, asks: true },
    ]) {
      expect(
        await sendDocumentPhoto(ACTOR, BUSINESS, { ...input, file: webp() }),
      ).toEqual({ ok: false, failure: "invalid" });
    }
    expect(admin.calls).toEqual([]);
  });

  it("takes no file in a demo business that takes none", async () => {
    admin.answers.documents_closed = ok(true);
    expect(
      await sendDocumentPhoto(ACTOR, BUSINESS, { ...sickNote, file: webp() }),
    ).toEqual({ ok: false, failure: "demo" });
    expect(admin.calls.map((call) => call.fn)).toEqual(["documents_closed"]);
  });

  it("checks the photo again: a page that isn't a JPEG or WebP goes nowhere", async () => {
    const file = new Blob([new TextEncoder().encode("<svg/>")], {
      type: "image/webp",
    });
    expect(
      await sendDocumentPhoto(ACTOR, BUSINESS, { ...sickNote, file }),
    ).toEqual({ ok: false, failure: "type" });
    expect(admin.storage).toEqual([]);
  });

  it("reserves its place, uploads it with the secret key and sends the document", async () => {
    admin.answers.reserve_document_upload = ok({
      upload: UPLOAD,
      path: PHOTO_PATH,
    });
    admin.answers.send_document = ok(DOCUMENT);
    expect(
      await sendDocumentPhoto(ACTOR, BUSINESS, {
        ...sickNote,
        note: "  ליומיים ",
        file: webp(),
      }),
    ).toEqual({ ok: true, value: { document: DOCUMENT } });
    const reserve = admin.calls.find((c) => c.fn === "reserve_document_upload");
    expect(reserve?.args).toMatchObject({
      actor: ACTOR,
      business: BUSINESS,
      upload_direction: "from_person",
      upload_kind: "image",
      upload_type: "image/webp",
      upload_size: 26,
    });
    expect(admin.storage).toEqual([
      {
        bucket: "documents",
        op: "upload",
        paths: [PHOTO_PATH],
        upsert: false,
        size: 26,
      },
    ]);
    expect(
      admin.calls.find((c) => c.fn === "send_document")?.args,
    ).toMatchObject({
      send_direction: "from_person",
      send_category: "sick_note",
      send_title: "אישור מחלה",
      send_note: "ליומיים",
      upload: UPLOAD,
    });
  });

  it("removes the photo when the document is refused", async () => {
    admin.answers.reserve_document_upload = ok({
      upload: UPLOAD,
      path: PHOTO_PATH,
    });
    admin.answers.send_document = no("54000", "space");
    admin.answers.document_upload_place = ok(
      place({ path: PHOTO_PATH, kind: "image" }),
    );
    expect(
      await sendDocumentPhoto(ACTOR, BUSINESS, { ...sickNote, file: webp() }),
    ).toEqual({ ok: false, failure: "full" });
    expect(admin.storage.at(-1)).toEqual({
      bucket: "documents",
      op: "remove",
      paths: [PHOTO_PATH],
    });
  });

  it("gives the document when it was written though its answer was lost", async () => {
    admin.answers.reserve_document_upload = ok({
      upload: UPLOAD,
      path: PHOTO_PATH,
    });
    admin.answers.send_document = () => ({ data: null, error: { code: "" } });
    admin.answers.document_upload_place = ok(
      place({
        path: PHOTO_PATH,
        kind: "image",
        used: true,
        document: DOCUMENT,
      }),
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await sendDocumentPhoto(ACTOR, BUSINESS, { ...sickNote, file: webp() }),
    ).toEqual({ ok: true, value: { document: DOCUMENT } });
    logged.mockRestore();
    expect(admin.storage.filter((s) => s.op === "remove")).toEqual([]);
  });
});

describe("a document's PDF", () => {
  it("starts with its name and size checked, its place reserved and its upload signed for that path", async () => {
    expect(
      await startDocumentPdf(ACTOR, BUSINESS, {
        direction: "to_people",
        name: "payslip.docx",
        size: 10,
      }),
    ).toEqual({ ok: false, failure: "notPdf" });
    expect(
      await startDocumentPdf(ACTOR, BUSINESS, {
        direction: "to_people",
        name: "payslip.pdf",
        size: 10 * 1024 * 1024 + 1,
      }),
    ).toEqual({ ok: false, failure: "tooBig" });
    expect(admin.calls).toEqual([]);

    admin.answers.reserve_document_upload = ok({
      upload: UPLOAD,
      path: PDF_PATH,
    });
    const started = await startDocumentPdf(ACTOR, BUSINESS, {
      direction: "to_people",
      name: " תלוש\u0000 נובמבר.pdf ",
      size: 2048,
    });
    expect(started).toEqual({
      ok: true,
      value: {
        upload: UPLOAD,
        signedUrl: `${SUPABASE}/storage/v1/object/upload/sign/documents/${PDF_PATH}?token=t`,
        name: "תלוש נובמבר.pdf",
        size: 2048,
      },
    });
    expect(
      admin.calls.find((c) => c.fn === "reserve_document_upload")?.args,
    ).toMatchObject({
      upload_direction: "to_people",
      upload_kind: "pdf",
      upload_type: "application/pdf",
      upload_size: 2048,
      upload_name: "תלוש נובמבר.pdf",
    });
  });

  it("lets its place go when Storage signs an upload for anywhere else", async () => {
    admin.answers.reserve_document_upload = ok({
      upload: UPLOAD,
      path: PDF_PATH,
    });
    admin.signedUploadBucket = "chat-files";
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(
      await startDocumentPdf(ACTOR, BUSINESS, {
        direction: "to_people",
        name: "a.pdf",
        size: 2048,
      }),
    ).toEqual({ ok: false, failure: "failed" });
    logged.mockRestore();
    expect(admin.storage.at(-1)).toMatchObject({
      bucket: "documents",
      op: "upload",
      paths: [PDF_PATH],
      upsert: true,
      size: 1,
    });
  });

  const payslip = {
    direction: "to_people",
    category: "payslip",
    title: "תלוש שכר",
    to: [NOA],
    asks: true,
    upload: UPLOAD,
  } as const;

  it("finishes once its first KB is a PDF's, and sends it", async () => {
    admin.answers.document_upload_place = ok(place());
    admin.answers.send_document = ok(DOCUMENT);
    stored("%PDF-1.7\n%...");
    expect(await finishDocumentPdf(ACTOR, BUSINESS, payslip)).toEqual({
      ok: true,
      value: { document: DOCUMENT },
    });
    expect(
      admin.calls.find((c) => c.fn === "send_document")?.args,
    ).toMatchObject({
      send_direction: "to_people",
      send_to: [NOA],
      asks: true,
      upload: UPLOAD,
    });
    expect(admin.storage).toEqual([
      { bucket: "documents", op: "sign", paths: [PDF_PATH] },
    ]);
  });

  it("refuses bytes that aren't a PDF's, and lets the place go", async () => {
    admin.answers.document_upload_place = ok(place());
    stored("<!doctype html><script>alert(1)</script>");
    expect(await finishDocumentPdf(ACTOR, BUSINESS, payslip)).toEqual({
      ok: false,
      failure: "notPdf",
    });
    expect(admin.calls.some((c) => c.fn === "send_document")).toBe(false);
    expect(admin.storage.at(-1)).toMatchObject({ op: "upload", upsert: true });
  });

  it("says when nothing arrived, when its time is over, and gives back one sent already", async () => {
    admin.answers.document_upload_place = ok(place());
    stored(null);
    expect(await finishDocumentPdf(ACTOR, BUSINESS, payslip)).toEqual({
      ok: false,
      failure: "notUploaded",
    });

    admin.answers.document_upload_place = ok(place({ fresh: false }));
    expect(await finishDocumentPdf(ACTOR, BUSINESS, payslip)).toEqual({
      ok: false,
      failure: "expired",
    });

    admin.storage = [];
    admin.answers.document_upload_place = ok(
      place({ used: true, document: DOCUMENT }),
    );
    expect(await finishDocumentPdf(ACTOR, BUSINESS, payslip)).toEqual({
      ok: true,
      value: { document: DOCUMENT },
    });
    expect(admin.storage).toEqual([]);
  });

  it("finishes nobody else's place, nor a photo's", async () => {
    admin.answers.document_upload_place = ok(null);
    expect(await finishDocumentPdf(ACTOR, BUSINESS, payslip)).toEqual({
      ok: false,
      failure: "noAccess",
    });
    admin.answers.document_upload_place = ok(
      place({ path: PHOTO_PATH, kind: "image" }),
    );
    expect(await finishDocumentPdf(ACTOR, BUSINESS, payslip)).toEqual({
      ok: false,
      failure: "noAccess",
    });
  });

  it("stops: its place let go, unless it was sent", async () => {
    admin.answers.document_upload_place = ok(place());
    expect(await cancelDocumentPdf(ACTOR, BUSINESS, UPLOAD)).toEqual({
      ok: true,
      value: { sent: false, document: null },
    });
    expect(admin.storage.at(-1)).toMatchObject({ op: "upload", upsert: true });

    admin.storage = [];
    admin.answers.document_upload_place = ok(
      place({ used: true, document: DOCUMENT }),
    );
    expect(await cancelDocumentPdf(ACTOR, BUSINESS, UPLOAD)).toEqual({
      ok: true,
      value: { sent: true, document: DOCUMENT },
    });
    expect(admin.storage).toEqual([]);
  });
});

describe("a demo's document", () => {
  it("is its category's sample, with no title or note of anyone's", async () => {
    expect(
      await sendDocumentSample(ACTOR, BUSINESS, {
        direction: "to_people",
        category: "contract",
        to: [NOA],
      }),
    ).toEqual({ ok: false, failure: "invalid" });
    admin.answers.send_document = ok(DOCUMENT);
    expect(
      await sendDocumentSample(ACTOR, BUSINESS, {
        direction: "to_people",
        category: "payslip",
        to: [NOA],
      }),
    ).toEqual({ ok: true, value: { document: DOCUMENT } });
    const args = admin.calls.find((c) => c.fn === "send_document")?.args;
    expect(args).toMatchObject({
      send_category: "payslip",
      send_sample: "payslip",
    });
    expect(args).not.toHaveProperty("send_note");
    expect(args).not.toHaveProperty("upload");
  });
});

describe("the office's notice", () => {
  it("is read once by the server, for someone in the office", async () => {
    expect(await seeDocumentsNotice(ACTOR, BUSINESS)).toEqual({
      ok: true,
      value: null,
    });
    expect(admin.calls).toEqual([
      {
        fn: "see_documents_notice",
        args: { actor: ACTOR, business: BUSINESS },
      },
    ]);
    admin.answers.see_documents_notice = no("42501");
    expect(await seeDocumentsNotice(NOA, BUSINESS)).toEqual({
      ok: false,
      failure: "noAccess",
    });
  });
});
