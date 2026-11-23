import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

/**
 * Both sides as the database and Storage answer them
 * (20261127000300_files_server_only.sql): the secret key's (`admin`) and the
 * reader's own session's (`session`). Each call is recorded, an answer per
 * function, and Storage's uploads, removals and downloads; a removal answers
 * from a queue, so one can fail and the next go. Nothing signs a link to a
 * photo: asking for one fails the test.
 */
type Answer = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};
const db = vi.hoisted(() => ({
  calls: [] as { side: "admin" | "session"; fn: string; args: unknown }[],
  answers: {} as Record<string, (args: Record<string, unknown>) => Answer>,
  storage: [] as {
    side: "admin" | "session";
    op: "upload" | "remove" | "download";
    paths: string[];
  }[],
  /** What each removal answers, in turn; then it goes. */
  removals: [] as ({
    statusCode: string;
    status: number;
    name: string;
  } | null)[],
  /** The bytes Storage holds for a download. */
  held: new Uint8Array() as Uint8Array,
  /** The profile's own row, for the way before the migration. */
  avatarPath: null as string | null,
  updates: [] as { avatar_path: string | null }[],
  updateError: null as { code?: string } | null,
  profileReads: 0,
}));

function storageFor(side: "admin" | "session") {
  return {
    from: (_bucket: string) => ({
      upload: async (path: string) => {
        db.storage.push({ side, op: "upload", paths: [path] });
        return { data: { path }, error: null };
      },
      remove: async (paths: string[]) => {
        db.storage.push({ side, op: "remove", paths });
        const error = db.removals.shift() ?? null;
        return { data: error ? null : [], error };
      },
      download: async (path: string) => {
        db.storage.push({ side, op: "download", paths: [path] });
        return {
          data: new Blob([db.held as Uint8Array<ArrayBuffer>]),
          error: null,
        };
      },
      createSignedUrl: async () => {
        throw new Error("no signed link reads a profile photo");
      },
      createSignedUrls: async () => {
        throw new Error("no signed link reads a profile photo");
      },
    }),
  };
}

function rpcFor(side: "admin" | "session") {
  return async (fn: string, args: Record<string, unknown> = {}) => {
    db.calls.push({ side, fn, args });
    const answer = db.answers[`${side}:${fn}`];
    return answer ? answer(args) : { data: null, error: null };
  };
}

vi.mock("./supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: rpcFor("admin"),
    storage: storageFor("admin"),
    from: (table: string) => {
      if (table !== "profiles") throw new Error(`no table ${table} here`);
      return {
        select: () => ({
          eq: () => ({
            single: async () => {
              db.profileReads += 1;
              return { data: { avatar_path: db.avatarPath }, error: null };
            },
          }),
        }),
        update: (row: { avatar_path: string | null }) => ({
          eq: async () => {
            db.updates.push(row);
            return { error: db.updateError };
          },
        }),
      };
    },
  }),
}));
vi.mock("./supabase/server", () => ({
  createClient: async () => ({
    rpc: rpcFor("session"),
    storage: storageFor("session"),
  }),
}));

const {
  cleanProfilePhotos,
  profilePhotoBytes,
  removeProfilePhoto,
  setProfilePhoto,
} = await import("./profile-photos");

const USER = "00000000-0000-4000-a000-000000000003";
const OTHER = "00000000-0000-4000-a000-000000000004";
const OLD = `${USER}/oldphotokey01.webp`;
const PATH = new RegExp(`^${USER}/[A-Za-z0-9_-]{16}\\.webp$`);

const ok = (data: unknown) => () => ({ data, error: null });
const no = (code?: string) => () => ({
  data: null,
  error: code === undefined ? { message: "fetch failed" } : { code },
});

/** A still WebP as the picker's re-encoding makes one: 1 x 1, no metadata. */
function webpBytes(): Uint8Array<ArrayBuffer> {
  const stream = [0x2f, 0, 0, 0, 0];
  const bytes = new Uint8Array(12 + 8 + stream.length + 1);
  const view = new DataView(bytes.buffer);
  bytes.set([0x52, 0x49, 0x46, 0x46], 0);
  view.setUint32(4, bytes.length - 8, true);
  bytes.set([0x57, 0x45, 0x42, 0x50], 8);
  bytes.set([0x56, 0x50, 0x38, 0x4c], 12);
  view.setUint32(16, stream.length, true);
  bytes.set(stream, 20);
  return bytes;
}
const photo = () => new Blob([webpBytes()], { type: "image/webp" });

const uploaded = () =>
  db.storage.filter((s) => s.op === "upload").flatMap((s) => s.paths);
const removed = () =>
  db.storage.filter((s) => s.op === "remove").map((s) => s.paths);
const asked = (fn: string) => db.calls.filter((c) => c.fn === fn);

let errors: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  db.calls = [];
  db.storage = [];
  db.removals = [];
  db.held = webpBytes();
  db.avatarPath = null;
  db.updates = [];
  db.updateError = null;
  db.profileReads = 0;
  db.answers = { "admin:keeps_demo_profile": ok(false) };
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  errors.mockRestore();
});

/** Every argument logged, as one string, to look for what must not be there. */
const logged = () => JSON.stringify(errors.mock.calls);

describe("setProfilePhoto", () => {
  it("uploads under a new key, points the profile at it under the row's lock, and removes what that replaced", async () => {
    db.answers["admin:set_avatar_path"] = ok(OLD);
    const result = await setProfilePhoto(USER, photo());
    const [path = ""] = uploaded();
    expect(path).toMatch(PATH);
    expect(result).toEqual({ ok: true, path });
    expect(asked("set_avatar_path")).toEqual([
      {
        side: "admin",
        fn: "set_avatar_path",
        args: { person: USER, new_path: path },
      },
    ]);
    expect(removed()).toEqual([[OLD]]);
    // The photo it replaced is the database's answer, never one read before.
    expect(db.profileReads).toBe(0);
    expect(db.updates).toEqual([]);
  });

  it("removes nothing when it replaced none, or gives back someone else's", async () => {
    db.answers["admin:set_avatar_path"] = ok(null);
    expect((await setProfilePhoto(USER, photo())).ok).toBe(true);
    db.answers["admin:set_avatar_path"] = ok(`${OTHER}/oldphotokey01.webp`);
    expect((await setProfilePhoto(USER, photo())).ok).toBe(true);
    expect(removed()).toEqual([]);
  });

  it("tries a removal Storage refuses once more, and logs it by its code alone", async () => {
    db.answers["admin:set_avatar_path"] = ok(OLD);
    db.removals = [{ statusCode: "500", status: 500, name: "StorageApiError" }];
    expect((await setProfilePhoto(USER, photo())).ok).toBe(true);
    expect(removed()).toEqual([[OLD], [OLD]]);
    expect(errors).toHaveBeenCalledWith("a profile photo stayed", "500");
    expect(logged()).not.toContain(USER);
  });

  it("tries no more than twice: what stays is nobody's, for the clean-up", async () => {
    db.answers["admin:set_avatar_path"] = ok(OLD);
    const refused = { statusCode: "503", status: 503, name: "StorageApiError" };
    db.removals = [refused, refused, refused];
    expect((await setProfilePhoto(USER, photo())).ok).toBe(true);
    expect(removed()).toEqual([[OLD], [OLD]]);
    expect(logged()).not.toContain(USER);
  });

  it("says demo when the database keeps the person as they are, and removes the upload", async () => {
    db.answers["admin:set_avatar_path"] = no("55000");
    expect(await setProfilePhoto(USER, photo())).toEqual({
      ok: false,
      failure: "demo",
    });
    expect(removed()).toEqual([uploaded()]);
  });

  it("fails on another refusal, and removes the upload", async () => {
    db.answers["admin:set_avatar_path"] = no("23514");
    expect(await setProfilePhoto(USER, photo())).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(removed()).toEqual([uploaded()]);
    expect(errors).toHaveBeenCalledWith("profile photo save failed", "23514");
  });

  it("keeps the upload when the answer was lost: the profile may point at it", async () => {
    db.answers["admin:set_avatar_path"] = no();
    expect(await setProfilePhoto(USER, photo())).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(uploaded()).toHaveLength(1);
    expect(removed()).toEqual([]);
    expect(logged()).not.toContain(USER);
  });

  it("points the old way before the migration: the profile read, updated, and its photo removed", async () => {
    db.answers["admin:set_avatar_path"] = no("PGRST202");
    db.avatarPath = OLD;
    const result = await setProfilePhoto(USER, photo());
    const [path = ""] = uploaded();
    expect(result).toEqual({ ok: true, path });
    expect(db.updates).toEqual([{ avatar_path: path }]);
    expect(removed()).toEqual([[OLD]]);
  });

  it("uploads nothing for a demo person, nor for a file that isn't a photo we take", async () => {
    db.answers["admin:keeps_demo_profile"] = ok(true);
    expect(await setProfilePhoto(USER, photo())).toEqual({
      ok: false,
      failure: "demo",
    });
    db.answers["admin:keeps_demo_profile"] = ok(false);
    expect(
      (await setProfilePhoto(USER, new Blob(["GIF89a"], { type: "image/gif" })))
        .ok,
    ).toBe(false);
    expect(uploaded()).toEqual([]);
    expect(asked("set_avatar_path")).toEqual([]);
  });
});

describe("removeProfilePhoto", () => {
  it("clears the pointer under the row's lock and removes the photo it had", async () => {
    db.answers["admin:set_avatar_path"] = ok(OLD);
    expect(await removeProfilePhoto(USER)).toEqual({ ok: true, path: null });
    expect(asked("set_avatar_path")).toEqual([
      { side: "admin", fn: "set_avatar_path", args: { person: USER } },
    ]);
    expect(removed()).toEqual([[OLD]]);
  });

  it("removes nothing when there was none", async () => {
    db.answers["admin:set_avatar_path"] = ok(null);
    expect(await removeProfilePhoto(USER)).toEqual({ ok: true, path: null });
    expect(removed()).toEqual([]);
  });

  it("fails on a refusal, removing nothing", async () => {
    db.answers["admin:set_avatar_path"] = no("P0002");
    expect(await removeProfilePhoto(USER)).toEqual({
      ok: false,
      failure: "failed",
    });
    expect(removed()).toEqual([]);
  });

  it("clears the old way before the migration", async () => {
    db.answers["admin:set_avatar_path"] = no("42883");
    db.avatarPath = OLD;
    expect(await removeProfilePhoto(USER)).toEqual({ ok: true, path: null });
    expect(db.updates).toEqual([{ avatar_path: null }]);
    expect(removed()).toEqual([[OLD]]);
  });
});

describe("profilePhotoBytes", () => {
  it("reads nothing at all when the reader may not be shown it", async () => {
    db.answers["session:sees_profile_photo"] = ok(false);
    expect(await profilePhotoBytes(OLD)).toBeNull();
    expect(asked("sees_profile_photo")).toEqual([
      { side: "session", fn: "sees_profile_photo", args: { photo_path: OLD } },
    ]);
    expect(db.storage).toEqual([]);
  });

  it("reads it with the secret key once the database said yes, never under the session", async () => {
    db.answers["session:sees_profile_photo"] = ok(true);
    expect(await profilePhotoBytes(OLD)).toEqual({
      bytes: webpBytes(),
      type: "image/webp",
    });
    expect(db.storage).toEqual([
      { side: "admin", op: "download", paths: [OLD] },
    ]);
  });

  it("serves nothing whose bytes aren't a photo we take", async () => {
    db.answers["session:sees_profile_photo"] = ok(true);
    db.held = new TextEncoder().encode("<!doctype html>");
    expect(await profilePhotoBytes(OLD)).toBeNull();
  });

  it("serves nothing when the database can't be asked, and logs its code", async () => {
    db.answers["session:sees_profile_photo"] = no("57014");
    expect(await profilePhotoBytes(OLD)).toBeNull();
    expect(db.storage).toEqual([]);
    expect(errors).toHaveBeenCalledWith(
      "a profile photo could not be read",
      "57014",
    );
  });

  it("reads under the session before the migration, where the bucket's policy still decides", async () => {
    db.answers["session:sees_profile_photo"] = no("PGRST202");
    expect((await profilePhotoBytes(OLD))?.type).toBe("image/webp");
    expect(db.storage).toEqual([
      { side: "session", op: "download", paths: [OLD] },
    ]);
  });
});

describe("cleanProfilePhotos", () => {
  const path = (n: number) => `${USER}/photo${String(n).padStart(8, "0")}.webp`;

  it("removes a batch of 500 at a time, only what is in the app's shape, and says how many went", async () => {
    const batches = [
      Array.from({ length: 500 }, (_, n) => ({ path: path(n) })),
      [{ path: path(500) }, { path: "zz/abcdefgh.webp" }],
    ];
    db.answers["admin:expired_avatars"] = () => ({
      data: batches.shift() ?? [],
      error: null,
    });
    expect(await cleanProfilePhotos(new Date("2026-11-20T12:00:00Z"))).toBe(
      501,
    );
    expect(asked("expired_avatars").map((c) => c.args)).toEqual([
      { max_rows: 500, at_time: "2026-11-20T12:00:00.000Z" },
      { max_rows: 500, at_time: "2026-11-20T12:00:00.000Z" },
    ]);
    expect(removed()).toHaveLength(2);
    expect(removed()[1]).toEqual([path(500)]);
  });

  it("stops at a batch Storage refuses, logged by its code: the rest wait for tomorrow", async () => {
    db.answers["admin:expired_avatars"] = ok(
      Array.from({ length: 500 }, (_, n) => ({ path: path(n) })),
    );
    db.removals = [{ statusCode: "500", status: 500, name: "StorageApiError" }];
    expect(await cleanProfilePhotos()).toBe(0);
    expect(asked("expired_avatars")).toHaveLength(1);
    expect(errors).toHaveBeenCalledWith("profile photos stayed", "500");
    expect(logged()).not.toContain(USER);
  });

  it("does nothing before the migration", async () => {
    db.answers["admin:expired_avatars"] = no("PGRST202");
    expect(await cleanProfilePhotos()).toBe(0);
    expect(removed()).toEqual([]);
  });
});
