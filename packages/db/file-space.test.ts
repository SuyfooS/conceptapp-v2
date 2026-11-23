import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * How full a business's spaces are (bigger teams, the first fixes): the
 * secret key's `public.file_space` for a business's own people, and the
 * console's `public.admin_storage` with each business's documents, as the
 * database answers them.
 */
type Failure = { code?: string; message: string };

const db = vi.hoisted(() => ({
  calls: [] as { fn: string; args: Record<string, unknown> }[],
  answer: { data: null as unknown, error: null as Failure | null },
}));

const rpc = async (fn: string, args: Record<string, unknown> = {}) => {
  db.calls.push({ fn, args });
  return db.answer;
};
vi.mock("./supabase/admin", () => ({ createAdminClient: () => ({ rpc }) }));
vi.mock("./supabase/server", () => ({ createClient: async () => ({ rpc }) }));

const { getFileSpace, getStorageUse } = await import("./chat-files");

const ACTOR = "9b000000-0000-4000-a000-000000000001";
const BUSINESS = "9b000000-0000-4000-b000-000000000001";
const MB = 1024 * 1024;

const space = {
  files_open: true,
  document_bytes: 12 * MB,
  document_space_bytes: 50 * MB,
  chat_bytes: 97 * MB,
  chat_space_bytes: 100 * MB,
};

let logged: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  db.calls = [];
  db.answer = { data: space, error: null };
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

describe("getFileSpace", () => {
  it("asks for the actor in the business, and reads the sizes", async () => {
    expect(await getFileSpace(ACTOR, BUSINESS)).toEqual({
      filesOpen: true,
      documentBytes: 12 * MB,
      documentSpaceBytes: 50 * MB,
      chatBytes: 97 * MB,
      chatSpaceBytes: 100 * MB,
    });
    expect(db.calls).toEqual([
      { fn: "file_space", args: { actor: ACTOR, business: BUSINESS } },
    ]);
  });

  it("says nothing before its migration, or to someone it refuses", async () => {
    for (const code of ["PGRST202", "42883", "42501"]) {
      db.answer = { data: null, error: { code, message: "no" } };
      expect(await getFileSpace(ACTOR, BUSINESS)).toBeNull();
    }
    expect(logged).not.toHaveBeenCalled();
  });

  it("says nothing of an answer it can't read, and logs its code alone", async () => {
    db.answer = { data: { ...space, chat_bytes: -1 }, error: null };
    expect(await getFileSpace(ACTOR, BUSINESS)).toBeNull();
    db.answer = { data: null, error: { code: "XX000", message: "broken" } };
    expect(await getFileSpace(ACTOR, BUSINESS)).toBeNull();
    expect(logged.mock.calls).toEqual([
      ["the space for files could not be read", "a shape it doesn't know"],
      ["the space for files could not be read", "XX000"],
    ]);
  });
});

describe("getStorageUse", () => {
  const storage = (business: Record<string, unknown>) => ({
    database_bytes: 40 * MB,
    storage_bytes: 200 * MB,
    guard_bytes: 900 * MB,
    buckets: [],
    businesses: [
      {
        business: BUSINESS,
        slug: "bistro",
        name: "Bistro",
        chat_bytes: 97 * MB,
        files_open: true,
        chat_cap_bytes: 100 * MB,
        document_cap_bytes: 50 * MB,
        ...business,
      },
    ],
    chat_caps_bytes: 100 * MB,
    document_caps_bytes: 50 * MB,
  });

  it("gives each business's documents beside its chat files", async () => {
    db.answer = { data: storage({ document_bytes: 47 * MB }), error: null };
    const use = await getStorageUse();
    expect(use?.businesses[0]).toMatchObject({
      chatBytes: 97 * MB,
      documentBytes: 47 * MB,
      documentCapBytes: 50 * MB,
    });
  });

  it("knows none before the migration gives them", async () => {
    db.answer = { data: storage({}), error: null };
    expect((await getStorageUse())?.businesses[0]?.documentBytes).toBeNull();
  });
});
