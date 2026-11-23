import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * The /chat-files and /list-photos readers
 * (20261127000300_files_server_only.sql): the row is read under the reader's
 * own session (`session`, whose Storage throws if touched: no session reads a
 * bucket), and only then the file with the secret key (`admin`, whose
 * downloads are recorded). `events` keeps the order of both.
 */
const fake = vi.hoisted(() => ({
  events: [] as string[],
  /** The row each table answers with, or none. */
  rows: {} as Record<string, unknown>,
  /** The bytes Storage holds for a download. */
  held: new Uint8Array() as Uint8Array,
}));

function chainFor(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    or: () => chain,
    limit: () => chain,
    maybeSingle: async () => {
      fake.events.push(`row ${table}`);
      return { data: fake.rows[table] ?? null, error: null };
    },
  };
  return chain;
}

vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    from: (table: string) => chainFor(table),
    get storage(): never {
      throw new Error("the session reads no bucket");
    },
  }),
}));
vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    storage: {
      from: (bucket: string) => ({
        download: (path: string) => {
          const answer = () => {
            fake.events.push(`download ${bucket} ${path}`);
            return fake.held;
          };
          return {
            // biome-ignore lint/suspicious/noThenProperty: Storage's download is a thenable with asStream beside it
            then: (resolve: (value: { data: Blob; error: null }) => void) =>
              resolve({
                data: new Blob([answer() as Uint8Array<ArrayBuffer>]),
                error: null,
              }),
            asStream: async () => {
              const bytes = answer();
              return {
                data: new ReadableStream<Uint8Array>({
                  start(controller) {
                    controller.enqueue(bytes);
                    controller.close();
                  },
                }),
                error: null,
              };
            },
          };
        },
        createSignedUrl: async () => {
          throw new Error("no signed link reads a file here");
        },
      }),
    },
  }),
}));
vi.mock("./env", () => ({
  publicEnv: () => ({
    url: "http://127.0.0.1:54321",
    publishableKey: "sb_publishable_test",
  }),
}));

const { chatFileBytes, chatPdfDownload } = await import("./chat-files");
const { listPhotoBytes } = await import("./list-photos");

const BUSINESS = "10000000-0000-4000-b000-000000000001";
const CONVERSATION = "20000000-0000-4000-a000-000000000001";
const LIST = "30000000-0000-4000-a000-000000000001";
const KEY = "0123456789abcdef0123456789abcdef";
const PICTURE = `${BUSINESS}/${CONVERSATION}/${KEY}.webp`;
const THUMB = `${BUSINESS}/${CONVERSATION}/${KEY}-s.webp`;
const PDF = `${BUSINESS}/${CONVERSATION}/${KEY}.pdf`;
const PHOTO = `${BUSINESS}/${LIST}/kitchen-1.webp`;

/** A WebP's first bytes, enough for its type. */
const webp = () =>
  new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  ]);
const jpeg = () => new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const pdf = () => new TextEncoder().encode("%PDF-1.7\n%menu\n");

const picture = (changes: Record<string, unknown> = {}) => ({
  file_kind: "image",
  file_path: PICTURE,
  thumb_path: THUMB,
  file_removed_at: null,
  removed_at: null,
  ...changes,
});
const pdfMessage = (changes: Record<string, unknown> = {}) => ({
  file_kind: "pdf",
  file_path: PDF,
  file_name: "תפריט.pdf",
  file_removed_at: null,
  removed_at: null,
  ...changes,
});

const downloads = () => fake.events.filter((e) => e.startsWith("download"));

async function readAll(body: ReadableStream<Uint8Array>): Promise<string> {
  return await new Response(body).text();
}

beforeEach(() => {
  fake.events = [];
  fake.rows = {};
  fake.held = webp();
});

describe("chatFileBytes", () => {
  it("reads a picture with the secret key only after its message, under the session", async () => {
    fake.rows.chat_messages = picture();
    expect(await chatFileBytes(PICTURE)).toEqual({
      bytes: webp(),
      type: "image/webp",
    });
    expect(fake.events).toEqual([
      "row chat_messages",
      `download chat-files ${PICTURE}`,
    ]);
  });

  it("reads its thumbnail the same way", async () => {
    fake.rows.chat_messages = picture();
    expect((await chatFileBytes(THUMB))?.type).toBe("image/webp");
    expect(downloads()).toEqual([`download chat-files ${THUMB}`]);
  });

  it("downloads nothing with no message the reader reads, a removed one, or a file no longer kept", async () => {
    expect(await chatFileBytes(PICTURE)).toBeNull();
    fake.rows.chat_messages = picture({
      removed_at: "2026-11-20T08:00:00Z",
    });
    expect(await chatFileBytes(PICTURE)).toBeNull();
    fake.rows.chat_messages = picture({
      file_removed_at: "2026-11-20T08:00:00Z",
    });
    expect(await chatFileBytes(PICTURE)).toBeNull();
    fake.rows.chat_messages = picture({ file_path: PDF, file_kind: "pdf" });
    expect(await chatFileBytes(PICTURE)).toBeNull();
    expect(downloads()).toEqual([]);
  });

  it("serves nothing whose bytes aren't the path's type", async () => {
    fake.rows.chat_messages = picture();
    fake.held = jpeg();
    expect(await chatFileBytes(PICTURE)).toBeNull();
  });

  it("reads no row for a PDF or a path of another shape", async () => {
    expect(await chatFileBytes(PDF)).toBeNull();
    expect(await chatFileBytes(`${BUSINESS}/../${KEY}.webp`)).toBeNull();
    expect(fake.events).toEqual([]);
  });
});

describe("chatPdfDownload", () => {
  it("streams a PDF read with the secret key only after its message, under the session", async () => {
    fake.rows.chat_messages = pdfMessage();
    fake.held = pdf();
    const file = await chatPdfDownload(PDF);
    expect(file?.name).toBe("תפריט.pdf");
    expect(await readAll(file?.body ?? new ReadableStream())).toBe(
      "%PDF-1.7\n%menu\n",
    );
    expect(fake.events).toEqual([
      "row chat_messages",
      `download chat-files ${PDF}`,
    ]);
  });

  it("downloads nothing with no message the reader reads, a removed one, or a file no longer kept", async () => {
    expect(await chatPdfDownload(PDF)).toBeNull();
    fake.rows.chat_messages = pdfMessage({
      removed_at: "2026-11-20T08:00:00Z",
    });
    expect(await chatPdfDownload(PDF)).toBeNull();
    fake.rows.chat_messages = pdfMessage({
      file_removed_at: "2026-11-20T08:00:00Z",
    });
    expect(await chatPdfDownload(PDF)).toBeNull();
    expect(downloads()).toEqual([]);
  });

  it("serves nothing whose first bytes aren't a PDF's", async () => {
    fake.rows.chat_messages = pdfMessage();
    fake.held = new TextEncoder().encode("<!doctype html><script></script>");
    expect(await chatPdfDownload(PDF)).toBeNull();
  });
});

describe("listPhotoBytes", () => {
  it("reads a photo with the secret key only after its item, under the session", async () => {
    fake.rows.list_items = { photo_path: PHOTO, photo_removed_at: null };
    expect(await listPhotoBytes(PHOTO)).toEqual({
      bytes: webp(),
      type: "image/webp",
    });
    expect(fake.events).toEqual([
      "row list_items",
      `download list-photos ${PHOTO}`,
    ]);
  });

  it("downloads nothing with no item the reader reads, or a photo no longer kept", async () => {
    expect(await listPhotoBytes(PHOTO)).toBeNull();
    fake.rows.list_items = {
      photo_path: PHOTO,
      photo_removed_at: "2027-02-09T06:00:00Z",
    };
    expect(await listPhotoBytes(PHOTO)).toBeNull();
    expect(downloads()).toEqual([]);
  });

  it("serves nothing whose bytes aren't a photo the lists keep, and reads no row for another shape", async () => {
    fake.rows.list_items = { photo_path: PHOTO, photo_removed_at: null };
    fake.held = new TextEncoder().encode("GIF89a");
    expect(await listPhotoBytes(PHOTO)).toBeNull();
    fake.events = [];
    expect(await listPhotoBytes(`${BUSINESS}/${LIST}/Kitchen.png`)).toBeNull();
    expect(fake.events).toEqual([]);
  });
});
