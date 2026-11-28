import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, sep } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  askHidden,
  BackupError,
  BUCKETS,
  backup,
  Cancelled,
  CI_REFUSAL,
  folderRefusal,
  HEADER_BYTES,
  KDF,
  keyKind,
  listObjects,
  MANIFEST_FORMAT,
  main,
  NO_TERMINAL,
  NotATerminal,
  openBackup,
  projectOf,
  REPO_ROOT,
  Refusal,
  StorageError,
  stampOf,
  storageClient,
  writeBackup,
} from "./backup-files.mjs";
import { answers, fakeStorage, lines } from "./fake-storage";

// tooling/backup-files.mjs, the files' half of Orel's backup (closing the
// pilot, PR 20; docs/production.md, B8). Never against a real project here:
// Storage is the in-memory stand-in of ./fake-storage, and the folders are
// fresh ones under the system's temp folder, outside any checkout. What it
// keeps: no plain file ever inside this repo or another checkout, whichever
// way a path is read (its words, its links, `..`); a manifest with each
// file's bucket, path, size, content type and SHA-256; one encrypted file
// that opens with its passphrase alone, and fails when it is the wrong one
// or the file changed; the plain folder gone whatever happened; and counts
// on the screen, never a file's name, the address or the key.

/** Fast scrypt for the tests; KDF itself is checked once. */
const FAST = { N: 2 ** 14, r: 8, p: 1 };
const PASSPHRASE = "correct horse battery staple";
const SECRET = "sb_secret_TEST_ONLY_not_a_real_key";
const REF = "abcdefghijklmnopqrst";
const NOW = new Date(2026, 10, 28, 9, 5);

const made: string[] = [];
const links: string[] = [];
afterEach(() => {
  // Links first, on their own: never a recursive delete through one.
  for (const link of links.splice(0)) unlinkSync(link);
  for (const folder of made.splice(0)) {
    rmSync(folder, { recursive: true, force: true });
  }
});

/** A new empty folder under the system's temp folder. */
function scratch(): string {
  const folder = mkdtempSync(join(tmpdir(), "backup-files-test-"));
  made.push(folder);
  return folder;
}

/** A directory link (a junction on Windows, which needs no rights). */
function link(target: string, at: string): string {
  symlinkSync(target, at, "junction");
  links.push(at);
  return at;
}

/** Every path under `folder`, from it, with forward slashes. */
function tree(folder: string): string[] {
  return readdirSync(folder, { recursive: true, encoding: "utf8" })
    .map((path) => path.split(sep).join("/"))
    .sort();
}

/** Files in each of the four buckets, folders inside folders. */
const SEED = {
  avatars: {
    "11111111-aaaa/photo-one.jpg": "avatar one",
    "22222222-bbbb/photo-two.webp": "avatar two",
  },
  "list-photos": {
    "biz-1/list-1/item-1.jpg": "list photo",
  },
  "chat-files": {
    "biz-1/chat-1/msg-1/full.webp": "chat full",
    "biz-1/chat-1/msg-1/thumb.webp": "chat thumb",
    "biz-1/chat-2/msg-9/file.pdf": "%PDF-1.7 chat",
  },
  documents: {
    "biz-1/person-1/sick-note.pdf": "%PDF-1.7 a document",
  },
};
const SEED_PATHS = Object.values(SEED).flatMap((files) => Object.keys(files));
const SEED_TEXTS = Object.values(SEED).flatMap((files) => Object.values(files));

async function backedUp(
  seed: Record<string, Record<string, string>> = SEED,
  options: Parameters<typeof fakeStorage>[1] = {},
) {
  const parent = scratch();
  const storage = fakeStorage(seed, options);
  const printed = lines();
  const result = await backup({
    client: storage,
    source: REF,
    parent,
    passphrase: PASSPHRASE,
    now: NOW,
    out: printed.out,
    kdf: FAST,
    sleep: async () => {},
  });
  return { parent, storage, printed, result };
}

describe("the buckets", () => {
  it("are the ones the migrations create, every one", () => {
    const folder = join(REPO_ROOT, "supabase/migrations");
    const created = readdirSync(folder)
      .sort()
      .flatMap((file) => [
        ...readFileSync(join(folder, file), "utf8")
          .replace(/--[^\n]*/g, "")
          .matchAll(
            /insert into storage\.buckets\s*\([^)]*\)\s*values\s*\(\s*'([^']+)'/gi,
          ),
      ])
      .map(([, id]) => id);
    expect(created).toEqual(BUCKETS);
    expect(BUCKETS).toEqual([
      "avatars",
      "list-photos",
      "chat-files",
      "documents",
    ]);
  });
});

describe("where the plain files may go", () => {
  it("is never this repo or anything inside it", () => {
    expect(folderRefusal(REPO_ROOT)).toBe("repo");
    expect(folderRefusal(join(REPO_ROOT, "backups"))).toBe("repo");
    expect(folderRefusal(join(REPO_ROOT, "tooling", "new", "deeper"))).toBe(
      "repo",
    );
    expect(folderRefusal("backups", { cwd: REPO_ROOT })).toBe("repo");
    expect(folderRefusal(".", { cwd: join(REPO_ROOT, "docs") })).toBe("repo");
  });

  it("is never inside it by way of ..", () => {
    // Out of the repo and back in, and down and up again.
    const back = [REPO_ROOT, "..", basename(REPO_ROOT), "backups"].join(sep);
    expect(folderRefusal(back)).toBe("repo");
    const up = [REPO_ROOT, "tooling", "..", "backups"].join(sep);
    expect(folderRefusal(up)).toBe("repo");
    const relative = ["..", "..", basename(REPO_ROOT), "x"].join(sep);
    expect(folderRefusal(relative, { cwd: join(REPO_ROOT, "docs") })).toBe(
      "repo",
    );
  });

  it("is never inside it through a link, or a link and then ..", () => {
    const outside = scratch();
    const toRepo = link(REPO_ROOT, join(outside, "to-repo"));
    expect(folderRefusal(toRepo)).toBe("repo");
    expect(folderRefusal(join(toRepo, "backups", "2026"))).toBe("repo");
    // The words say outside (outside/x); the link says inside (the repo's
    // own x): either is enough.
    const toTooling = link(join(REPO_ROOT, "tooling"), join(outside, "t"));
    expect(folderRefusal([toTooling, "..", "x"].join(sep))).toBe("repo");
  });

  it("is never inside another git checkout, nor through a link that leads nowhere", () => {
    const other = scratch();
    mkdirSync(join(other, ".git"));
    expect(folderRefusal(join(other, "some", "folder"))).toBe("checkout");
    const outside = scratch();
    const nowhere = link(join(outside, "gone"), join(outside, "dangling"));
    expect(folderRefusal(join(nowhere, "x"))).toBe("link");
  });

  it.runIf(process.platform === "win32" || process.platform === "darwin")(
    "is the repo whatever the letters' case, where the disk ignores it",
    () => {
      expect(folderRefusal(REPO_ROOT.toUpperCase())).toBe("repo");
      expect(folderRefusal(join(REPO_ROOT.toLowerCase(), "x"))).toBe("repo");
    },
  );

  it("may be a folder outside, even one reached through a link", () => {
    const outside = scratch();
    expect(folderRefusal(outside)).toBeNull();
    expect(folderRefusal(join(outside, "not", "yet", "made"))).toBeNull();
    const elsewhere = scratch();
    expect(folderRefusal(join(link(elsewhere, join(outside, "l")), "x"))).toBe(
      null,
    );
  });

  it("is refused by the backup before anything is made or downloaded", async () => {
    const storage = fakeStorage(SEED);
    await expect(
      backup({
        client: storage,
        source: REF,
        parent: join(REPO_ROOT, "never-made"),
        passphrase: PASSPHRASE,
        now: NOW,
        out: lines().out,
        kdf: FAST,
      }),
    ).rejects.toEqual(new Refusal("repo"));
    expect(storage.calls).toEqual([]);
    expect(readdirSync(REPO_ROOT)).not.toContain("never-made");
  });
});

describe("the project and its key", () => {
  it("is a hosted project by its ref, or the local stack", () => {
    expect(projectOf(`https://${REF}.supabase.co`)).toEqual({
      origin: `https://${REF}.supabase.co`,
      ref: REF,
    });
    expect(projectOf(` https://${REF}.supabase.co/ `)?.ref).toBe(REF);
    expect(projectOf("http://127.0.0.1:54321")).toEqual({
      origin: "http://127.0.0.1:54321",
      ref: "local",
    });
    expect(projectOf("http://localhost:54321")?.ref).toBe("local");
  });

  it("is nothing else", () => {
    for (const address of [
      `http://${REF}.supabase.co`,
      `https://${REF}.supabase.co:8443`,
      `https://${REF}.supabase.co/rest/v1`,
      `https://${REF}.supabase.co/?key=x`,
      `https://user:pass@${REF}.supabase.co`,
      `https://${REF}.supabase.co.example.com`,
      "https://short.supabase.co",
      "https://www.conceptapp.co.il",
      `${REF}.supabase.co`,
      "",
      "not an address",
    ]) {
      expect(projectOf(address), address).toBeNull();
    }
    expect(projectOf(undefined)).toBeNull();
  });

  it("takes a secret key, and says when it was the publishable one", () => {
    const jwt = (role: string) =>
      [
        Buffer.from('{"alg":"HS256"}').toString("base64url"),
        Buffer.from(JSON.stringify({ role })).toString("base64url"),
        "signature",
      ].join(".");
    expect(keyKind(SECRET)).toBe("secret");
    expect(keyKind(jwt("service_role"))).toBe("secret");
    expect(keyKind("sb_publishable_abcdefghijkl")).toBe("publishable");
    expect(keyKind(jwt("anon"))).toBe("publishable");
    expect(keyKind("hunter2")).toBe("other");
    expect(keyKind("")).toBe("other");
  });
});

describe("Storage's REST API", () => {
  type Seen = { url: string; init: RequestInit };
  function fetchOf(answer: (url: string) => Response) {
    const seen: Seen[] = [];
    const fetchImpl = (async (input: string | URL | Request, init = {}) => {
      seen.push({ url: String(input), init });
      return answer(String(input));
    }) as typeof fetch;
    return { seen, fetchImpl };
  }
  const headersOf = (init: RequestInit) =>
    Object.fromEntries(
      Object.entries((init.headers ?? {}) as Record<string, string>),
    );

  it("lists, downloads and uploads with the key in its two headers, never in an address", async () => {
    const { seen, fetchImpl } = fetchOf((url) =>
      url.endsWith("/bucket")
        ? Response.json([{ id: "avatars" }])
        : url.includes("/object/list/")
          ? Response.json([{ name: "a.jpg", id: "1", metadata: {} }])
          : new Response(new Uint8Array([1, 2, 3])),
    );
    const client = storageClient(
      `https://${REF}.supabase.co`,
      SECRET,
      fetchImpl,
    );
    expect(await client.listBuckets()).toEqual([{ id: "avatars" }]);
    await client.list("chat-files", "biz/chat", { limit: 100, offset: 200 });
    expect(await client.download("documents", "biz/a b/שלום.pdf")).toEqual(
      new Uint8Array([1, 2, 3]),
    );
    await client.upload("avatars", "u/x.jpg", new Uint8Array([9]), {
      contentType: "image/jpeg",
      cacheControl: "max-age=3600",
      upsert: false,
    });
    const root = `https://${REF}.supabase.co/storage/v1`;
    expect(seen.map(({ url, init }) => `${init.method} ${url}`)).toEqual([
      `GET ${root}/bucket`,
      `POST ${root}/object/list/chat-files`,
      `GET ${root}/object/documents/biz/a%20b/%D7%A9%D7%9C%D7%95%D7%9D.pdf`,
      `POST ${root}/object/avatars/u/x.jpg`,
    ]);
    expect(JSON.parse(String(seen[1]?.init.body))).toEqual({
      prefix: "biz/chat",
      limit: 100,
      offset: 200,
      sortBy: { column: "name", order: "asc" },
    });
    const upload = headersOf(seen[3]?.init ?? {});
    expect(upload).toMatchObject({
      "content-type": "image/jpeg",
      "cache-control": "max-age=3600",
      "x-upsert": "false",
    });
    for (const { url, init } of seen) {
      expect(url).not.toContain(SECRET);
      expect(headersOf(init)).toMatchObject({
        apikey: SECRET,
        authorization: `Bearer ${SECRET}`,
      });
    }
  });

  it("throws Storage's status alone, never its body", async () => {
    const { fetchImpl } = fetchOf(
      () =>
        new Response('{"message":"biz-1/person-1/sick-note.pdf exists"}', {
          status: 409,
        }),
    );
    const client = storageClient(
      `https://${REF}.supabase.co`,
      SECRET,
      fetchImpl,
    );
    const error = await client
      .upload("documents", "biz-1/person-1/sick-note.pdf", new Uint8Array(), {
        contentType: "application/pdf",
        cacheControl: "max-age=3600",
        upsert: false,
      })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StorageError);
    expect((error as StorageError).status).toBe(409);
    expect(String((error as Error).message)).not.toMatch(/sick-note|sb_secret/);
  });
});

describe("listing a bucket", () => {
  it("goes page by page, into every folder, in the order of the paths", async () => {
    const seed: Record<string, string> = { "top.jpg": "top" };
    for (let n = 0; n < 230; n += 1) {
      seed[`biz/list/${String(n).padStart(3, "0")}.jpg`] = `photo ${n}`;
    }
    seed["biz/other/deep/er/x.jpg"] = "deep";
    const storage = fakeStorage({ "list-photos": seed });
    const listed = await listObjects(storage, "list-photos", 100);
    expect(listed.map((item) => item.path)).toEqual(Object.keys(seed).sort());
    expect(listed[0]).toEqual({
      path: "biz/list/000.jpg",
      size: 7,
      contentType: "image/jpeg",
      cacheControl: "max-age=3600",
    });
    const pages = storage.calls.flatMap((call) =>
      call.kind === "list" && call.prefix === "biz/list"
        ? [[call.limit, call.offset]]
        : [],
    );
    expect(pages).toEqual([
      [100, 0],
      [100, 100],
      [100, 200],
    ]);
  });

  it("stops when a full page brings nothing new, rather than going round", async () => {
    const stuck = {
      ...fakeStorage(),
      list: async () =>
        Array.from({ length: 2 }, (_, n) => ({
          name: `same-${n}.jpg`,
          id: `id-${n}`,
          metadata: { size: 1, mimetype: "image/jpeg" },
        })),
    };
    await expect(listObjects(stuck, "avatars", 2)).rejects.toBeInstanceOf(
      StorageError,
    );
  });
});

describe("a backup", () => {
  it("holds every file of every bucket, with its manifest, and nothing else is left", async () => {
    const { parent, result } = await backedUp();
    expect(result.file).toBe(join(parent, "files-2026-11-28-0905.backup"));
    expect(result.files).toBe(SEED_PATHS.length);
    expect(result.missing).toBe(0);
    // The plain folder is gone: one encrypted file is all there is.
    expect(tree(parent)).toEqual(["files-2026-11-28-0905.backup"]);
    const raw = readFileSync(result.file);
    for (const text of SEED_TEXTS) {
      expect(raw.includes(Buffer.from(text)), text).toBe(false);
    }
    for (const path of SEED_PATHS) {
      expect(raw.includes(Buffer.from(path)), path).toBe(false);
    }
  });

  it("writes a manifest with each file's bucket, path, size, content type and SHA-256", async () => {
    const { result } = await backedUp();
    const got: Record<string, string> = {};
    const { manifest } = await openBackup(result.file, PASSPHRASE, {
      onObject: (item, bytes) => {
        got[`${item.bucket}/${item.path}`] = bytes.toString("utf8");
      },
    });
    expect(manifest).toMatchObject({
      format: MANIFEST_FORMAT,
      version: 1,
      createdAt: NOW.toISOString(),
      source: REF,
      missing: [],
    });
    expect(manifest.buckets.map((bucket) => bucket.id)).toEqual(BUCKETS);
    const sha = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    expect(manifest.objects).toContainEqual({
      bucket: "documents",
      path: "biz-1/person-1/sick-note.pdf",
      size: 19,
      contentType: "application/pdf",
      cacheControl: "max-age=3600",
      sha256: sha("%PDF-1.7 a document"),
    });
    for (const item of manifest.objects) {
      const text = (SEED as Record<string, Record<string, string>>)[
        item.bucket
      ]?.[item.path];
      expect(text, item.path).toBeDefined();
      expect(item.sha256).toBe(sha(text ?? ""));
      expect(item.size).toBe(Buffer.byteLength(text ?? ""));
      expect(got[`${item.bucket}/${item.path}`]).toBe(text);
    }
    expect(Object.keys(got)).toHaveLength(SEED_PATHS.length);
  });

  it("says counts and sizes for each bucket, never a file's name or what is in it", async () => {
    const { printed } = await backedUp();
    expect(printed.written).toEqual([
      "[v] avatars: 2 קבצים (20 B)",
      "[v] list-photos: קובץ אחד (10 B)",
      "[v] chat-files: 3 קבצים (32 B)",
      "[v] documents: קובץ אחד (19 B)",
    ]);
    for (const secret of [...SEED_PATHS, ...SEED_TEXTS, "biz-1", "sick"]) {
      expect(printed.text()).not.toContain(secret);
    }
  });

  it("keeps going past a file that won't download, and lists it inside the backup only", async () => {
    const { printed, result } = await backedUp(SEED, {
      downloadFails: {
        "documents/biz-1/person-1/sick-note.pdf": 404,
        "avatars/22222222-bbbb/photo-two.webp": 500,
      },
    });
    expect(result.files).toBe(SEED_PATHS.length - 2);
    expect(result.missing).toBe(2);
    expect(printed.written).toContain(
      "[x] avatars: קובץ אחד (10 B), וקובץ אחד לא ירד",
    );
    expect(printed.text()).not.toContain("photo-two");
    const { manifest } = await openBackup(result.file, PASSPHRASE);
    expect(manifest.missing).toEqual([
      { bucket: "avatars", path: "22222222-bbbb/photo-two.webp" },
      { bucket: "documents", path: "biz-1/person-1/sick-note.pdf" },
    ]);
  });

  it("tries a download three times before it counts the file as missing, and a gone one once", async () => {
    const { storage } = await backedUp(SEED, {
      downloadFails: {
        "documents/biz-1/person-1/sick-note.pdf": 404,
        "avatars/22222222-bbbb/photo-two.webp": 500,
      },
    });
    const tries = (path: string) =>
      storage.calls.filter(
        (call) => call.kind === "download" && call.path === path,
      ).length;
    expect(tries("22222222-bbbb/photo-two.webp")).toBe(3);
    expect(tries("biz-1/person-1/sick-note.pdf")).toBe(1);
    expect(tries("11111111-aaaa/photo-one.jpg")).toBe(1);
  });

  it("refuses a project without the app's buckets, before anything is made", async () => {
    const parent = scratch();
    const storage = fakeStorage({}, { buckets: ["avatars", "documents"] });
    await expect(
      backup({
        client: storage,
        source: REF,
        parent,
        passphrase: PASSPHRASE,
        now: NOW,
        out: lines().out,
        kdf: FAST,
      }),
    ).rejects.toEqual(new Refusal("buckets"));
    expect(tree(parent)).toEqual([]);
  });

  it("deletes the plain folder and the half-written file when it stops half way", async () => {
    const parent = scratch();
    const storage = fakeStorage(SEED);
    const failing = {
      ...storage,
      list: async (
        bucket: string,
        prefix: string,
        page: { limit: number; offset: number },
      ) => {
        if (bucket === "documents") throw new Error("the network went");
        return storage.list(bucket, prefix, page);
      },
    };
    const work = {
      plain: null as string | null,
      partial: null as string | null,
    };
    await expect(
      backup({
        client: failing,
        source: REF,
        parent,
        passphrase: PASSPHRASE,
        now: NOW,
        out: lines().out,
        kdf: FAST,
        work,
        sleep: async () => {},
      }),
    ).rejects.toThrow("the network went");
    expect(tree(parent)).toEqual([]);
    expect(work).toEqual({ plain: null, partial: null });
  });

  it("never writes over a backup already there", async () => {
    const parent = scratch();
    writeFileSync(join(parent, "files-2026-11-28-0905.backup"), "kept");
    await expect(
      backup({
        client: fakeStorage(SEED),
        source: REF,
        parent,
        passphrase: PASSPHRASE,
        now: NOW,
        out: lines().out,
        kdf: FAST,
      }),
    ).rejects.toEqual(new Refusal("exists"));
    expect(
      readFileSync(join(parent, "files-2026-11-28-0905.backup"), "utf8"),
    ).toBe("kept");
    expect(tree(parent)).toEqual(["files-2026-11-28-0905.backup"]);
  });

  it("holds an empty file and an empty project as well", async () => {
    const { result } = await backedUp({ avatars: { "u/empty.jpg": "" } });
    const sizes: number[] = [];
    const { manifest } = await openBackup(result.file, PASSPHRASE, {
      onObject: (_, bytes) => {
        sizes.push(bytes.length);
      },
    });
    expect(manifest.objects.map((item) => [item.path, item.size])).toEqual([
      ["u/empty.jpg", 0],
    ]);
    expect(sizes).toEqual([0]);
    const none = await backedUp({});
    expect(none.result.files).toBe(0);
    expect(
      (await openBackup(none.result.file, PASSPHRASE)).manifest.objects,
    ).toEqual([]);
  });

  it("is named by the computer's own date and time", () => {
    expect(stampOf(new Date(2027, 0, 3, 14, 30))).toBe("2027-01-03-1430");
  });
});

describe("the encrypted file", () => {
  it("starts with a small header: the cipher, scrypt's parameters, the salt, the IV and the tag", async () => {
    const { result } = await backedUp();
    const raw = readFileSync(result.file);
    const head = raw.subarray(0, HEADER_BYTES).toString("utf8");
    expect(head.endsWith("\n")).toBe(true);
    const header = JSON.parse(head.trim());
    expect(Object.keys(header).sort()).toEqual(
      [
        "check",
        "cipher",
        "format",
        "iv",
        "kdf",
        "salt",
        "tag",
        "version",
      ].sort(),
    );
    expect(header).toMatchObject({
      format: "conceptapp-files-backup",
      version: 1,
      cipher: "aes-256-gcm",
      kdf: { name: "scrypt", ...FAST },
    });
    expect(Buffer.from(header.salt, "base64")).toHaveLength(16);
    expect(Buffer.from(header.iv, "base64")).toHaveLength(12);
    expect(Buffer.from(header.tag, "base64")).toHaveLength(16);
    // Nothing about the project or its files is in the clear.
    expect(head).not.toContain(REF);
  });

  it("uses scrypt at 2^17, 8, 1 by default, and opens with it", async () => {
    expect(KDF).toEqual({ N: 2 ** 17, r: 8, p: 1 });
    const folder = scratch();
    const file = join(folder, "default.backup");
    const manifest = {
      format: MANIFEST_FORMAT,
      version: 1,
      createdAt: NOW.toISOString(),
      source: "local",
      buckets: [],
      objects: [],
      missing: [],
    };
    await writeBackup(file, manifest, async () => new Uint8Array(), PASSPHRASE);
    const header = JSON.parse(
      readFileSync(file).subarray(0, HEADER_BYTES).toString("utf8"),
    );
    expect(header.kdf).toEqual({ name: "scrypt", N: 2 ** 17, r: 8, p: 1 });
    expect((await openBackup(file, PASSPHRASE)).manifest).toEqual(manifest);
  });

  it("gets a new salt and IV every time", async () => {
    const one = await backedUp();
    const two = await backedUp();
    const head = (file: string) =>
      JSON.parse(readFileSync(file).subarray(0, HEADER_BYTES).toString("utf8"));
    expect(head(one.result.file).salt).not.toBe(head(two.result.file).salt);
    expect(head(one.result.file).iv).not.toBe(head(two.result.file).iv);
  });

  it("doesn't open with the wrong passphrase", async () => {
    const { result } = await backedUp();
    const seen: string[] = [];
    await expect(
      openBackup(result.file, "correct horse battery stapler", {
        onObject: (item) => {
          seen.push(item.path);
        },
      }),
    ).rejects.toEqual(new BackupError("passphrase"));
    expect(seen).toEqual([]);
  });

  /** A copy of the backup with `change` applied to its bytes. */
  async function changed(change: (bytes: Buffer) => Buffer) {
    const { parent, result } = await backedUp();
    const bad = join(parent, "changed.backup");
    writeFileSync(bad, change(Buffer.from(readFileSync(result.file))));
    return bad;
  }

  it("fails when one byte of what it holds changed", async () => {
    for (const at of [HEADER_BYTES + 2, HEADER_BYTES + 200, -1]) {
      const bad = await changed((bytes) => {
        const index = at < 0 ? bytes.length + at : at;
        bytes[index] = (bytes[index] ?? 0) ^ 0x01;
        return bytes;
      });
      await expect(openBackup(bad, PASSPHRASE), String(at)).rejects.toEqual(
        new BackupError("damaged"),
      );
    }
  });

  it("fails when the tag in its header changed, or it was cut short or added to", async () => {
    const tag = await changed((bytes) => {
      const header = JSON.parse(
        bytes.subarray(0, HEADER_BYTES).toString("utf8"),
      );
      const flipped = Buffer.from(header.tag, "base64");
      flipped[0] = (flipped[0] ?? 0) ^ 0x01;
      const text = JSON.stringify({
        ...header,
        tag: flipped.toString("base64"),
      });
      const slot = Buffer.alloc(HEADER_BYTES, 0x20);
      slot.write(text);
      slot[HEADER_BYTES - 1] = 0x0a;
      slot.copy(bytes);
      return bytes;
    });
    await expect(openBackup(tag, PASSPHRASE)).rejects.toEqual(
      new BackupError("damaged"),
    );
    const short = await changed((bytes) =>
      bytes.subarray(0, bytes.length - 20),
    );
    await expect(openBackup(short, PASSPHRASE)).rejects.toEqual(
      new BackupError("damaged"),
    );
    const longer = await changed((bytes) =>
      Buffer.concat([bytes, Buffer.from("x")]),
    );
    await expect(openBackup(longer, PASSPHRASE)).rejects.toEqual(
      new BackupError("damaged"),
    );
  });

  it("fails when its header's parameters changed, or it is no backup at all", async () => {
    const salt = await changed((bytes) => {
      const header = JSON.parse(
        bytes.subarray(0, HEADER_BYTES).toString("utf8"),
      );
      const other = Buffer.from(header.salt, "base64");
      other[0] = (other[0] ?? 0) ^ 0x01;
      const slot = Buffer.alloc(HEADER_BYTES, 0x20);
      slot.write(JSON.stringify({ ...header, salt: other.toString("base64") }));
      slot.copy(bytes);
      return bytes;
    });
    await expect(openBackup(salt, PASSPHRASE)).rejects.toEqual(
      new BackupError("passphrase"),
    );
    const huge = await changed((bytes) => {
      const header = JSON.parse(
        bytes.subarray(0, HEADER_BYTES).toString("utf8"),
      );
      const slot = Buffer.alloc(HEADER_BYTES, 0x20);
      slot.write(
        JSON.stringify({ ...header, kdf: { ...header.kdf, N: 2 ** 22 } }),
      );
      slot.copy(bytes);
      return bytes;
    });
    await expect(openBackup(huge, PASSPHRASE)).rejects.toEqual(
      new BackupError("format"),
    );
    const folder = scratch();
    const text = join(folder, "notes.txt");
    writeFileSync(text, "just some notes ".repeat(100));
    await expect(openBackup(text, PASSPHRASE)).rejects.toEqual(
      new BackupError("format"),
    );
    const tiny = join(folder, "tiny.backup");
    writeFileSync(tiny, "{}");
    await expect(openBackup(tiny, PASSPHRASE)).rejects.toEqual(
      new BackupError("format"),
    );
  });

  it("says when a file inside doesn't match its SHA-256, and hands on none from there", async () => {
    const folder = scratch();
    const file = join(folder, "lying.backup");
    const bytes = [
      Buffer.from("first"),
      Buffer.from("second"),
      Buffer.from("third"),
    ];
    const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");
    const objects = bytes.map((b, n) => ({
      bucket: "avatars",
      path: `p/${n}.jpg`,
      size: b.length,
      contentType: "image/jpeg",
      cacheControl: "max-age=3600",
      sha256: n === 1 ? sha(Buffer.from("other")) : sha(b),
    }));
    await writeBackup(
      file,
      {
        format: MANIFEST_FORMAT,
        version: 1,
        createdAt: NOW.toISOString(),
        source: REF,
        buckets: [],
        objects,
        missing: [],
      },
      async (index) => bytes[index] ?? new Uint8Array(),
      PASSPHRASE,
      { kdf: FAST },
    );
    const handed: string[] = [];
    await expect(
      openBackup(file, PASSPHRASE, {
        onObject: (item) => {
          handed.push(item.path);
        },
      }),
    ).rejects.toEqual(new BackupError("hash"));
    expect(handed).toEqual(["p/0.jpg"]);
  });
});

describe("the hidden question", () => {
  /** A terminal's stand-in: what is typed comes as data, nothing is echoed. */
  function terminal(isTTY = true) {
    const listeners = new Set<(chunk: string) => void>();
    const written: string[] = [];
    const modes: boolean[] = [];
    return {
      written,
      modes,
      type: (text: string) => {
        for (const listener of listeners) listener(text);
      },
      io: {
        input: {
          isTTY,
          setRawMode: (on: boolean) => modes.push(on),
          setEncoding: () => {},
          resume: () => {},
          pause: () => {},
          on: (_: string, listener: (chunk: string) => void) =>
            listeners.add(listener),
          off: (_: string, listener: (chunk: string) => void) =>
            listeners.delete(listener),
        },
        output: { write: (text: string) => written.push(text) },
      },
    };
  }

  it("shows nothing of what is typed, and takes backspace", async () => {
    const term = terminal();
    const asked = askHidden("סיסמה: ", term.io);
    term.type("sb_secret_x");
    term.type("y\u007fz\bZ");
    term.type("\r");
    expect(await asked).toBe("sb_secret_xZ");
    expect(term.written).toEqual(["סיסמה: ", "\n"]);
    expect(term.modes).toEqual([true, false]);
  });

  it("stops on Ctrl+C, and needs a terminal", async () => {
    const term = terminal();
    const asked = askHidden("סיסמה: ", term.io);
    term.type("half\u0003");
    await expect(asked).rejects.toBeInstanceOf(Cancelled);
    expect(term.modes).toEqual([true, false]);
    await expect(
      askHidden("סיסמה: ", terminal(false).io),
    ).rejects.toBeInstanceOf(NotATerminal);
  });
});

describe("the command", () => {
  const ADDRESS = `https://${REF}.supabase.co`;

  async function run(
    args: string[],
    given: string[],
    {
      env = {},
      storage = fakeStorage(SEED),
      parent = scratch(),
    }: {
      env?: Record<string, string>;
      storage?: ReturnType<typeof fakeStorage>;
      parent?: string;
    } = {},
  ) {
    const printed = lines();
    const typed = answers(...given);
    const made: { origin: string; key: string }[] = [];
    const code = await main(args, {
      env,
      out: printed.out,
      askSecret: typed.ask,
      client: (origin: string, key: string) => {
        made.push({ origin, key });
        return storage;
      },
      now: () => NOW,
      kdf: FAST,
      sleep: async () => {},
      parent,
    });
    return { code, printed, typed, made, parent, storage };
  }

  it("asks everything with nothing shown, backs up, and prints counts but never the address or the key", async () => {
    const { code, printed, typed, made, parent } = await run(
      [],
      [ADDRESS, SECRET, PASSPHRASE, PASSPHRASE],
    );
    expect(code).toBe(0);
    expect(typed.asked).toHaveLength(4);
    expect(made).toEqual([{ origin: ADDRESS, key: SECRET }]);
    expect(tree(parent)).toEqual(["files-2026-11-28-0905.backup"]);
    const text = printed.text();
    expect(text).toContain("[v] documents: קובץ אחד (19 B)");
    expect(text).toContain(
      `הגיבוי: ${join(parent, "files-2026-11-28-0905.backup")}`,
    );
    for (const secret of [SECRET, REF, PASSPHRASE, ...SEED_PATHS]) {
      expect(text).not.toContain(secret);
    }
  });

  it("takes the address and the key from the session, and says so", async () => {
    const { code, printed, typed } = await run([], [PASSPHRASE, PASSPHRASE], {
      env: { NEXT_PUBLIC_SUPABASE_URL: ADDRESS, SUPABASE_SECRET_KEY: SECRET },
    });
    expect(code).toBe(0);
    expect(typed.asked).toHaveLength(2);
    expect(printed.text()).toContain("NEXT_PUBLIC_SUPABASE_URL");
    expect(printed.text()).not.toContain(SECRET);
  });

  it("never runs in CI or GitHub Actions", async () => {
    const settings: Record<string, string>[] = [
      { CI: "true" },
      { GITHUB_ACTIONS: "true" },
    ];
    for (const env of settings) {
      const { code, printed, typed, storage } = await run([], [], { env });
      expect(code).toBe(2);
      expect(printed.written).toEqual([CI_REFUSAL]);
      expect(typed.asked).toEqual([]);
      expect(storage.calls).toEqual([]);
    }
  });

  it("refuses a folder inside the repo before it asks anything", async () => {
    for (const folder of [
      join(REPO_ROOT, "backups"),
      [REPO_ROOT, "docs", "..", "x"].join(sep),
    ]) {
      const { code, typed, storage } = await run([folder], []);
      expect(code).toBe(2);
      expect(typed.asked).toEqual([]);
      expect(storage.calls).toEqual([]);
    }
  });

  it("refuses a wrong address, the publishable key, a short passphrase and two that differ, downloading nothing", async () => {
    for (const given of [
      ["https://www.conceptapp.co.il"],
      [ADDRESS, "sb_publishable_abcdefghijkl"],
      [ADDRESS, SECRET, "short"],
      [ADDRESS, SECRET, PASSPHRASE, `${PASSPHRASE}!`],
    ]) {
      const { code, storage, parent } = await run([], given);
      expect(code, given.join(" ")).toBe(2);
      expect(storage.calls).toEqual([]);
      expect(tree(parent)).toEqual([]);
    }
  });

  it("ends with 1, and says how many, when files didn't come", async () => {
    const storage = fakeStorage(SEED, {
      downloadFails: { "documents/biz-1/person-1/sick-note.pdf": 404 },
    });
    const { code, printed } = await run(
      [],
      [ADDRESS, SECRET, PASSPHRASE, PASSPHRASE],
      { storage },
    );
    expect(code).toBe(1);
    expect(printed.text()).toContain("[x] קובץ אחד לא ירד.");
    expect(printed.text()).not.toContain("sick-note");
  });

  it("takes no flags and one folder at most", async () => {
    for (const args of [["--to", "x"], ["a", "b"], ["-h"]]) {
      const { code, typed } = await run(args, []);
      expect(code).toBe(2);
      expect(typed.asked).toEqual([]);
    }
  });

  it("says it needs a terminal when there is none", async () => {
    const printed = lines();
    const code = await main([], {
      env: {},
      out: printed.out,
      askSecret: async () => {
        throw new NotATerminal();
      },
      parent: scratch(),
    });
    expect(code).toBe(2);
    expect(printed.written.at(-1)).toBe(NO_TERMINAL);
  });
});
