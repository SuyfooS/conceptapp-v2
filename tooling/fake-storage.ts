import { BUCKETS, StorageError } from "./backup-files.mjs";

// A stand-in for one project's Storage, in memory, for the tests of
// tooling/backup-files.mjs and tooling/restore-files.mjs: the four calls the
// scripts make, folders listed a page at a time as Storage lists them (a
// folder is an entry with no id and no metadata), and every call recorded.
// No network.

export type StoredFile = {
  bytes: Uint8Array;
  contentType: string;
  cacheControl: string;
};

export type StorageCall =
  | { kind: "buckets" }
  | {
      kind: "list";
      bucket: string;
      prefix: string;
      limit: number;
      offset: number;
    }
  | { kind: "download"; bucket: string; path: string }
  | {
      kind: "upload";
      bucket: string;
      path: string;
      contentType: string;
      cacheControl: string;
      upsert: boolean;
    };

type Seed = Record<string, Record<string, string | Uint8Array>>;

type Options = {
  /** The buckets the project has (the app's four by default). */
  buckets?: readonly string[];
  /** Paths ("bucket/path") whose download answers with this status. */
  downloadFails?: Record<string, number>;
  /** Paths ("bucket/path") whose upload answers with this status. */
  uploadFails?: Record<string, number>;
};

const typeOf = (path: string) =>
  path.endsWith(".pdf")
    ? "application/pdf"
    : path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

export function fakeStorage(seed: Seed = {}, options: Options = {}) {
  const { buckets = BUCKETS, downloadFails = {}, uploadFails = {} } = options;
  const store = new Map<string, Map<string, StoredFile>>(
    buckets.map((id) => [id, new Map()]),
  );
  for (const [bucket, files] of Object.entries(seed)) {
    const held = store.get(bucket);
    if (!held) throw new Error(`no bucket ${bucket} in the stand-in`);
    for (const [path, content] of Object.entries(files)) {
      held.set(path, {
        bytes:
          typeof content === "string"
            ? new TextEncoder().encode(content)
            : content,
        contentType: typeOf(path),
        cacheControl: "max-age=3600",
      });
    }
  }
  const calls: StorageCall[] = [];
  const bucketOf = (bucket: string) => {
    const held = store.get(bucket);
    if (!held) throw new StorageError(404);
    return held;
  };

  return {
    store,
    calls,
    /** The bytes of a file, as text. */
    text(bucket: string, path: string) {
      const file = store.get(bucket)?.get(path);
      return file ? new TextDecoder().decode(file.bytes) : undefined;
    },
    async listBuckets() {
      calls.push({ kind: "buckets" });
      return [...store.keys()].map((id) => ({
        id,
        public: false,
        file_size_limit: 10485760,
        allowed_mime_types: ["image/jpeg", "image/webp", "application/pdf"],
      }));
    },
    async list(
      bucket: string,
      prefix: string,
      { limit, offset }: { limit: number; offset: number },
    ) {
      calls.push({ kind: "list", bucket, prefix, limit, offset });
      const base = prefix === "" ? "" : `${prefix}/`;
      const entries = new Map<
        string,
        {
          name: string;
          id: string | null;
          metadata: {
            size: number;
            mimetype: string;
            cacheControl: string;
          } | null;
        }
      >();
      for (const [path, file] of bucketOf(bucket)) {
        if (!path.startsWith(base)) continue;
        const rest = path.slice(base.length);
        const slash = rest.indexOf("/");
        if (slash === -1) {
          entries.set(rest, {
            name: rest,
            id: `id-${bucket}-${path}`,
            metadata: {
              size: file.bytes.length,
              mimetype: file.contentType,
              cacheControl: file.cacheControl,
            },
          });
        } else {
          const folder = rest.slice(0, slash);
          if (!entries.has(folder)) {
            entries.set(folder, { name: folder, id: null, metadata: null });
          }
        }
      }
      return [...entries.values()]
        .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
        .slice(offset, offset + limit);
    },
    async download(bucket: string, path: string) {
      calls.push({ kind: "download", bucket, path });
      const status = downloadFails[`${bucket}/${path}`];
      if (status !== undefined) throw new StorageError(status);
      const file = bucketOf(bucket).get(path);
      if (!file) throw new StorageError(400);
      return new Uint8Array(file.bytes);
    },
    async upload(
      bucket: string,
      path: string,
      bytes: Uint8Array,
      {
        contentType,
        cacheControl,
        upsert,
      }: { contentType: string; cacheControl: string; upsert: boolean },
    ) {
      calls.push({
        kind: "upload",
        bucket,
        path,
        contentType,
        cacheControl,
        upsert,
      });
      const status = uploadFails[`${bucket}/${path}`];
      if (status !== undefined) throw new StorageError(status);
      const held = bucketOf(bucket);
      if (held.has(path) && !upsert) throw new StorageError(409);
      held.set(path, {
        bytes: new Uint8Array(bytes),
        contentType,
        cacheControl,
      });
    },
  };
}

/** Lines written by a script, both kinds in their order. */
export function lines() {
  const written: string[] = [];
  return {
    written,
    out: {
      log: (text: string) => {
        written.push(text);
      },
      error: (text: string) => {
        written.push(text);
      },
    },
    text: () => written.join("\n"),
  };
}

/** Answers to a script's questions, in order, each question recorded. */
export function answers(...given: string[]) {
  const asked: string[] = [];
  const queue = [...given];
  return {
    asked,
    ask: async (question: string) => {
      asked.push(question);
      const next = queue.shift();
      if (next === undefined) throw new Error(`no answer for: ${question}`);
      return next;
    },
    left: () => queue.length,
  };
}
