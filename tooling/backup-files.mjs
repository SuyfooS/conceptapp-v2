// Backs up every file the app keeps in Supabase Storage, for Orel's step B8
// in docs/production.md (closing the pilot, PR 20). Supabase's daily backup
// of the database holds the files' rows, not the files themselves (its own
// docs say so), so this is the files' half:
//
//   node tooling/backup-files.mjs            into conceptapp-backups in the user's folder
//   node tooling/backup-files.mjs <folder>   into another folder, never inside a git checkout
//
// It asks for the project's address and its secret key with nothing shown as
// they are typed (or takes NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY
// from the session; never from a file), then for a passphrase, twice. It
// lists the app's buckets page by page and downloads every file into a dated
// folder, writes a manifest (each file's bucket, path, size, content type and
// SHA-256), encrypts the folder into one file (AES-256-GCM, the key from
// scrypt on the passphrase with a random salt; the parameters, the IV and
// the tag in a small header), opens that file again and checks every file in
// it, and only then deletes the plain folder, which also goes when anything
// fails. It prints counts and sizes, never a file's name, the address or the
// key. tooling/restore-files.mjs puts a backup into a temporary project.
//
// Only Orel runs it, on his own computer: it refuses to run where CI or
// GITHUB_ACTIONS is set, so never in GitHub Actions. It runs on Node 20 with
// Node's own fetch and crypto and nothing installed: @supabase/supabase-js
// 2.119 can't make a client on Node 20 (its realtime part wants Node 22's
// WebSocket), so it calls Storage's REST API the way storage-js does.
// tooling/backup-files.test.ts and tooling/restore-files.test.ts check it
// with a fake storage client, never the network.
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";
import { existsSync, lstatSync, realpathSync, rmSync } from "node:fs";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

/**
 * @typedef {{ log: (text: string) => void, error: (text: string) => void }} Out
 * @typedef {{ id: string, public?: boolean, file_size_limit?: number | null, allowed_mime_types?: string[] | null }} Bucket
 * @typedef {{ name?: unknown, id?: unknown, metadata?: { size?: unknown, mimetype?: unknown, cacheControl?: unknown } | null }} Entry
 * @typedef {{
 *   listBuckets: () => Promise<Bucket[]>,
 *   list: (bucket: string, prefix: string, page: { limit: number, offset: number }) => Promise<Entry[]>,
 *   download: (bucket: string, path: string) => Promise<Uint8Array>,
 *   upload: (bucket: string, path: string, bytes: Uint8Array, options: { contentType: string, cacheControl: string, upsert: boolean }) => Promise<void>,
 * }} StorageApi
 * @typedef {{ path: string, size: number, contentType: string, cacheControl: string }} Listed
 * @typedef {{ bucket: string, path: string, size: number, contentType: string, cacheControl: string, sha256: string }} Item
 * @typedef {{ bucket: string, path: string }} Missing
 * @typedef {{
 *   format: string, version: number, createdAt: string, source: string,
 *   buckets: { id: string, public: boolean, fileSizeLimit: number | null, allowedMimeTypes: string[] | null }[],
 *   objects: Item[], missing: Missing[],
 * }} Manifest
 * @typedef {{ N: number, r: number, p: number }} Kdf
 * @typedef {{ plain: string | null, partial: string | null }} Work
 */

/**
 * The buckets the migrations create (supabase/migrations, `insert into
 * storage.buckets`), in the order they came: profile pictures, lists'
 * photos, chat files, documents. tooling/backup-files.test.ts keeps it so.
 */
export const BUCKETS = ["avatars", "list-photos", "chat-files", "documents"];

/** What the encrypted file and its manifest say they are. */
export const FORMAT = "conceptapp-files-backup";
export const MANIFEST_FORMAT = "conceptapp-files-backup-manifest";
export const VERSION = 1;

/** The header's size: JSON, padded with spaces, at the start of the file. */
export const HEADER_BYTES = 1024;

/** scrypt's work for a new backup: 128 MiB, a third of a second here. */
export const KDF = { N: 2 ** 17, r: 8, p: 1 };

/** What a header may ask of scrypt when the file is opened. */
export const KDF_LIMITS = { minN: 2 ** 14, maxN: 2 ** 18, r: 8, maxP: 4 };

/** Files a page when listing a folder of a bucket. */
export const PAGE = 100;

/** The shortest passphrase it takes. */
export const MIN_PASSPHRASE = 12;

/** Storage's own cap on one file (docs/production.md, B3: 50 MB). */
export const MAX_OBJECT_BYTES = 50 * 1024 * 1024;

/** The longest manifest a backup may hold. */
export const MAX_MANIFEST_BYTES = 64 * 1024 * 1024;

/** How long one call to Storage may take. */
export const TIMEOUT_MS = 60_000;

/** The local stack's API (supabase/config.toml, `[api] port`). */
export const LOCAL_API = "http://127.0.0.1:54321";

/** A hosted project's ref, as its address and its dashboard show it. */
export const REF = /^[a-z0-9]{16,32}$/;

/** The repo this script is in: no backup goes inside it. */
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** A cache-control Storage keeps and the upload takes back. */
const CACHE_CONTROL = /^[A-Za-z0-9=,\s-]{1,100}$/;
const DEFAULT_CACHE_CONTROL = "max-age=3600";

const scrypt = promisify(scryptCallback);

/** A backup that can't be used, and why, in a word the scripts turn into Hebrew. */
export class BackupError extends Error {
  /** @param {"format" | "passphrase" | "damaged" | "hash"} kind */
  constructor(kind) {
    super(`backup: ${kind}`);
    this.name = "BackupError";
    this.kind = kind;
  }
}

/** Storage's answer when it wasn't 2xx: its status alone, never its body. */
export class StorageError extends Error {
  /** @param {number} status */
  constructor(status) {
    super(`storage answered ${status}`);
    this.name = "StorageError";
    this.status = status;
  }
}

/** Something it won't do, said in a word the script turns into Hebrew. */
export class Refusal extends Error {
  /** @param {string} kind */
  constructor(kind) {
    super(`refused: ${kind}`);
    this.name = "Refusal";
    this.kind = kind;
  }
}

/** The terminal is needed for a question, and there is none. */
export class NotATerminal extends Error {}

/** Ctrl+C at a question. */
export class Cancelled extends Error {}

// ---------------------------------------------------------------------------
// Where the backup goes

const foldCase = process.platform === "win32" || process.platform === "darwin";
const SEPARATORS = process.platform === "win32" ? /[\\/]+/ : /\/+/;

/** Whether the absolute `path` is `folder` itself or inside it. */
export function within(path, folder) {
  const rel = relative(
    foldCase ? folder.toLowerCase() : folder,
    foldCase ? path.toLowerCase() : path,
  );
  return (
    rel === "" ||
    (!isAbsolute(rel) && rel !== ".." && !rel.startsWith(`..${sep}`))
  );
}

/**
 * The real path of `path` when something is there, null when nothing is.
 * A link that leads nowhere is refused: where it would lead is not known.
 */
function realOrNull(path) {
  try {
    return realpathSync.native(path);
  } catch {
    let link = false;
    try {
      link = lstatSync(path).isSymbolicLink();
    } catch {
      return null;
    }
    if (link) throw new Refusal("link");
    return null;
  }
}

/**
 * Where `input` leads on the disk: each segment in turn, every link
 * followed, and `..` taken from wherever the link went, as a POSIX system
 * reads it.
 */
export function physicalPath(input, cwd = process.cwd()) {
  const absolute = isAbsolute(input);
  const root = absolute ? parse(input).root : "";
  let current = absolute ? (realOrNull(root) ?? root) : resolve(cwd);
  current = realOrNull(current) ?? current;
  for (const segment of input.slice(root.length).split(SEPARATORS)) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      current = dirname(current);
      continue;
    }
    const next = join(current, segment);
    current = realOrNull(next) ?? next;
  }
  return current;
}

/**
 * Where `input` leads with `..` read from the words first, as Windows reads
 * it, then the deepest part that exists made real (its links followed).
 */
export function lexicalPath(input, cwd = process.cwd()) {
  let existing = resolve(cwd, input);
  const tail = [];
  for (;;) {
    const real = realOrNull(existing);
    if (real !== null) return join(real, ...tail);
    const up = dirname(existing);
    if (up === existing) return join(existing, ...tail);
    tail.unshift(basename(existing));
    existing = up;
  }
}

/** Whether `path` or a folder above it holds a `.git`: a checkout of some repo. */
function inCheckout(path) {
  let folder = path;
  for (;;) {
    if (existsSync(join(folder, ".git"))) return true;
    const up = dirname(folder);
    if (up === folder) return false;
    folder = up;
  }
}

/**
 * Why plain files may not be written to `input`, or null when they may:
 * inside this repo or any other git checkout, read either way a path can be
 * read (its words, and where its links lead), or through a link to nowhere.
 * @param {string} input
 * @param {{ repo?: string, cwd?: string }} [where]
 * @returns {"repo" | "checkout" | "link" | null}
 */
export function folderRefusal(input, { repo = REPO_ROOT, cwd } = {}) {
  let places;
  try {
    places = [physicalPath(input, cwd), lexicalPath(input, cwd)];
  } catch (error) {
    if (error instanceof Refusal) return "link";
    throw error;
  }
  const repos = [resolve(repo), realOrNull(repo) ?? resolve(repo)];
  if (places.some((place) => repos.some((root) => within(place, root)))) {
    return "repo";
  }
  if (places.some(inCheckout)) return "checkout";
  return null;
}

/** The dated name of a backup made at `date`, in the computer's own time. */
export function stampOf(date) {
  const two = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}-${two(date.getHours())}${two(date.getMinutes())}`;
}

/** Where a backup goes when no folder is named. */
export const defaultParent = () => join(homedir(), "conceptapp-backups");

// ---------------------------------------------------------------------------
// The project and its key

/**
 * The project an address names: a hosted one (`https://<ref>.supabase.co`)
 * by its ref, or the local stack on this computer as "local". Anything else,
 * or an address with a path, a query or a password in it, is null.
 * @param {unknown} input
 * @returns {{ origin: string, ref: string } | null}
 */
export function projectOf(input) {
  if (typeof input !== "string") return null;
  let url;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.username !== "" || url.password !== "") return null;
  if (url.search !== "" || url.hash !== "") return null;
  if (url.pathname !== "/" && url.pathname !== "") return null;
  if (["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
    return url.protocol === "http:" || url.protocol === "https:"
      ? { origin: url.origin, ref: "local" }
      : null;
  }
  if (url.protocol !== "https:" || url.port !== "") return null;
  const ref = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname)?.[1];
  return ref && REF.test(ref) ? { origin: url.origin, ref } : null;
}

/**
 * Which kind of key this is: a secret one (`sb_secret_…`, or the legacy
 * service_role JWT), a publishable one (which sees no file: no bucket has a
 * policy), or neither.
 * @param {unknown} key
 * @returns {"secret" | "publishable" | "other"}
 */
export function keyKind(key) {
  if (typeof key !== "string") return "other";
  const typed = key.trim();
  if (/^sb_secret_[A-Za-z0-9_-]{8,}$/.test(typed)) return "secret";
  if (typed.startsWith("sb_publishable_")) return "publishable";
  const parts = typed.split(".");
  if (parts.length === 3 && typed.startsWith("eyJ")) {
    try {
      const claims = JSON.parse(
        Buffer.from(parts[1] ?? "", "base64url").toString("utf8"),
      );
      return claims?.role === "service_role" ? "secret" : "publishable";
    } catch {
      return "other";
    }
  }
  return "other";
}

/** A path inside a bucket, one segment at a time, for a URL. */
const pathPart = (path) => path.split("/").map(encodeURIComponent).join("/");

/**
 * Storage's REST API for one project, with the key in the two headers
 * storage-js sends it in and never in an address. Every answer that isn't
 * 2xx throws a StorageError with its status alone.
 * @param {string} origin
 * @param {string} key
 * @param {typeof fetch} [fetchImpl]
 * @returns {StorageApi}
 */
export function storageClient(origin, key, fetchImpl = globalThis.fetch) {
  const root = `${origin}/storage/v1`;
  const auth = { apikey: key, authorization: `Bearer ${key}` };

  async function call(method, path, { json, body, headers = {} } = {}) {
    const response = await fetchImpl(`${root}${path}`, {
      method,
      headers: {
        ...auth,
        ...(json === undefined ? {} : { "content-type": "application/json" }),
        ...headers,
      },
      body: json === undefined ? body : JSON.stringify(json),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw new StorageError(response.status);
    }
    return response;
  }

  return {
    async listBuckets() {
      const answer = await (await call("GET", "/bucket")).json();
      return Array.isArray(answer) ? answer : [];
    },
    async list(bucket, prefix, { limit, offset }) {
      const response = await call(
        "POST",
        `/object/list/${encodeURIComponent(bucket)}`,
        {
          json: {
            prefix,
            limit,
            offset,
            sortBy: { column: "name", order: "asc" },
          },
        },
      );
      const answer = await response.json();
      if (!Array.isArray(answer)) throw new StorageError(0);
      return answer;
    },
    async download(bucket, path) {
      const response = await call(
        "GET",
        `/object/${encodeURIComponent(bucket)}/${pathPart(path)}`,
      );
      return new Uint8Array(await response.arrayBuffer());
    },
    async upload(bucket, path, bytes, { contentType, cacheControl, upsert }) {
      await call(
        "POST",
        `/object/${encodeURIComponent(bucket)}/${pathPart(path)}`,
        {
          body: bytes,
          headers: {
            "content-type": contentType,
            "cache-control": cacheControl,
            "x-upsert": String(upsert),
          },
        },
      );
    },
  };
}

/** Whether `path` is one a backup may hold and a restore may write. */
export function goodPath(path) {
  if (typeof path !== "string" || path.length === 0 || path.length > 1024) {
    return false;
  }
  // biome-ignore lint/suspicious/noControlCharactersInRegex: control characters are what it refuses.
  if (/[\u0000-\u001f\u007f]/.test(path)) return false;
  return path
    .split("/")
    .every((segment) => segment !== "" && segment !== "." && segment !== "..");
}

/**
 * Every file of a bucket: each folder listed page by page (`page` a call),
 * its folders listed in turn, in the order of their paths.
 * @param {StorageApi} client
 * @param {string} bucket
 * @param {number} [page]
 * @returns {Promise<Listed[]>}
 */
export async function listObjects(client, bucket, page = PAGE) {
  /** @type {Map<string, Listed>} */
  const found = new Map();
  const folders = [""];
  const seenFolders = new Set(folders);
  while (folders.length > 0) {
    const prefix = folders.shift() ?? "";
    for (let offset = 0; ; offset += page) {
      const entries = await client.list(bucket, prefix, {
        limit: page,
        offset,
      });
      let fresh = 0;
      for (const entry of entries) {
        const name = entry?.name;
        if (typeof name !== "string" || name === "" || name.includes("/")) {
          continue;
        }
        const path = prefix === "" ? name : `${prefix}/${name}`;
        // A folder has no id and no metadata.
        if (entry.id === null || entry.id === undefined) {
          if (!seenFolders.has(path)) {
            seenFolders.add(path);
            folders.push(path);
            fresh += 1;
          }
          continue;
        }
        if (found.has(path)) continue;
        const size = Number(entry.metadata?.size);
        const type = entry.metadata?.mimetype;
        const cache = entry.metadata?.cacheControl;
        found.set(path, {
          path,
          size: Number.isInteger(size) && size >= 0 ? size : 0,
          contentType:
            typeof type === "string" && type !== "" && type.length <= 255
              ? type
              : "application/octet-stream",
          cacheControl:
            typeof cache === "string" && CACHE_CONTROL.test(cache)
              ? cache
              : DEFAULT_CACHE_CONTROL,
        });
        fresh += 1;
      }
      if (entries.length < page) break;
      // A full page with nothing new: the listing doesn't move on.
      if (fresh === 0) throw new StorageError(0);
    }
  }
  return [...found.values()].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  );
}

// ---------------------------------------------------------------------------
// The encrypted file

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const powerOfTwo = (n) => Number.isInteger(n) && n > 1 && (n & (n - 1)) === 0;

/** scrypt's two keys from the passphrase: one for AES, one for the check. */
async function deriveKeys(passphrase, salt, { N, r, p }) {
  const bytes = await scrypt(passphrase.normalize("NFC"), salt, 64, {
    N,
    r,
    p,
    maxmem: 256 * N * r,
  });
  return { key: bytes.subarray(0, 32), checkKey: bytes.subarray(32) };
}

/** What the cipher authenticates beside the content: every header field but the tag and the check. */
function aadOf(kdf, salt, iv) {
  return Buffer.from(
    JSON.stringify([
      FORMAT,
      VERSION,
      "aes-256-gcm",
      "scrypt",
      kdf.N,
      kdf.r,
      kdf.p,
      salt.toString("base64"),
      iv.toString("base64"),
    ]),
    "utf8",
  );
}

/** A base64 field of the header, exactly `length` bytes, or null. */
function bytesOf(value, length) {
  if (typeof value !== "string") return null;
  const bytes = Buffer.from(value, "base64");
  return bytes.length === length && bytes.toString("base64") === value
    ? bytes
    : null;
}

/** The header at the start of a backup, checked field by field. */
function parseHeader(bytes) {
  let header;
  try {
    header = JSON.parse(bytes.toString("utf8").trim());
  } catch {
    throw new BackupError("format");
  }
  const kdf = header?.kdf;
  const salt = bytesOf(header?.salt, 16);
  const iv = bytesOf(header?.iv, 12);
  const tag = bytesOf(header?.tag, 16);
  const check = bytesOf(header?.check, 32);
  if (
    header?.format !== FORMAT ||
    header.version !== VERSION ||
    header.cipher !== "aes-256-gcm" ||
    kdf?.name !== "scrypt" ||
    !powerOfTwo(kdf.N) ||
    kdf.N < KDF_LIMITS.minN ||
    kdf.N > KDF_LIMITS.maxN ||
    kdf.r !== KDF_LIMITS.r ||
    !Number.isInteger(kdf.p) ||
    kdf.p < 1 ||
    kdf.p > KDF_LIMITS.maxP ||
    !salt ||
    !iv ||
    !tag ||
    !check
  ) {
    throw new BackupError("format");
  }
  return { kdf: { N: kdf.N, r: kdf.r, p: kdf.p }, salt, iv, tag, check };
}

/**
 * Writes `manifest` and its files into one new file at `file` (refused if
 * there is one): the header's place, then AES-256-GCM over the manifest's
 * length, the manifest and each file in its order, then the header with the
 * tag. `readObject` gives each file's bytes, as the manifest has them;
 * `onCreate` hears once the new file exists, so a failure deletes only a
 * file this call made.
 * @param {string} file
 * @param {Manifest} manifest
 * @param {(index: number, item: Item) => Promise<Uint8Array>} readObject
 * @param {string} passphrase
 * @param {{ kdf?: Kdf, onCreate?: () => void }} [options]
 * @returns {Promise<string>} the manifest's SHA-256, as openBackup gives it
 */
export async function writeBackup(
  file,
  manifest,
  readObject,
  passphrase,
  { kdf = KDF, onCreate } = {},
) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const { key, checkKey } = await deriveKeys(passphrase, salt, kdf);
  const aad = aadOf(kdf, salt, iv);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const handle = await open(file, "wx", 0o600);
  onCreate?.();
  try {
    await handle.write(Buffer.alloc(HEADER_BYTES, 0x20), 0, HEADER_BYTES, 0);
    let position = HEADER_BYTES;
    const put = async (bytes) => {
      if (bytes.length === 0) return;
      await handle.write(bytes, 0, bytes.length, position);
      position += bytes.length;
    };
    const listed = Buffer.from(JSON.stringify(manifest), "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32BE(listed.length);
    await put(cipher.update(length));
    await put(cipher.update(listed));
    for (const [index, item] of manifest.objects.entries()) {
      await put(cipher.update(await readObject(index, item)));
    }
    await put(cipher.final());
    const header = Buffer.from(
      JSON.stringify({
        format: FORMAT,
        version: VERSION,
        cipher: "aes-256-gcm",
        kdf: { name: "scrypt", N: kdf.N, r: kdf.r, p: kdf.p },
        salt: salt.toString("base64"),
        iv: iv.toString("base64"),
        tag: cipher.getAuthTag().toString("base64"),
        check: createHmac("sha256", checkKey).update(aad).digest("base64"),
      }),
      "utf8",
    );
    if (header.length >= HEADER_BYTES) throw new BackupError("format");
    const slot = Buffer.alloc(HEADER_BYTES, 0x20);
    header.copy(slot);
    slot[HEADER_BYTES - 1] = 0x0a;
    await handle.write(slot, 0, HEADER_BYTES, 0);
    await handle.sync();
    return sha256(listed);
  } finally {
    await handle.close();
  }
}

/** Reads exact lengths from a stream of chunks. */
function chunkReader(chunks) {
  /** @type {Buffer[]} */
  let held = [];
  let length = 0;
  let ended = false;
  async function fill(wanted) {
    while (length < wanted && !ended) {
      const next = await chunks.next();
      if (next.done) {
        ended = true;
        break;
      }
      held.push(next.value);
      length += next.value.length;
    }
  }
  return {
    /** @param {number} wanted */
    async read(wanted) {
      await fill(wanted);
      if (length < wanted) throw new BackupError("damaged");
      const all = held.length === 1 ? held[0] : Buffer.concat(held);
      const rest = all.subarray(wanted);
      held = rest.length > 0 ? [rest] : [];
      length = rest.length;
      return all.subarray(0, wanted);
    },
    /** Nothing more may come, and the stream's own end is reached. */
    async end() {
      await fill(1);
      if (length > 0) throw new BackupError("damaged");
    },
  };
}

/** Whether `manifest` is one this script writes, entry by entry. */
export function goodManifest(manifest) {
  if (
    manifest?.format !== MANIFEST_FORMAT ||
    manifest.version !== VERSION ||
    typeof manifest.createdAt !== "string" ||
    Number.isNaN(Date.parse(manifest.createdAt)) ||
    typeof manifest.source !== "string" ||
    (manifest.source !== "local" && !REF.test(manifest.source)) ||
    !Array.isArray(manifest.buckets) ||
    !Array.isArray(manifest.objects) ||
    !Array.isArray(manifest.missing)
  ) {
    return false;
  }
  const seen = new Set();
  for (const item of manifest.objects) {
    const where = `${item?.bucket}/${item?.path}`;
    if (
      !BUCKETS.includes(item?.bucket) ||
      !goodPath(item.path) ||
      seen.has(where) ||
      !Number.isInteger(item.size) ||
      item.size < 0 ||
      item.size > MAX_OBJECT_BYTES ||
      typeof item.contentType !== "string" ||
      item.contentType === "" ||
      item.contentType.length > 255 ||
      typeof item.cacheControl !== "string" ||
      !CACHE_CONTROL.test(item.cacheControl) ||
      typeof item.sha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(item.sha256)
    ) {
      return false;
    }
    seen.add(where);
  }
  return manifest.missing.every(
    (gone) => BUCKETS.includes(gone?.bucket) && typeof gone.path === "string",
  );
}

/**
 * Opens a backup with its passphrase and reads it to its end: the header,
 * the passphrase's check, the manifest, then each file against its size and
 * SHA-256, and last the cipher's tag. `onManifest` may refuse the manifest;
 * `onObject` gets each file only once its SHA-256 matched, and none after a
 * file that didn't. Throws a BackupError: "format" (not a backup, or its
 * header broken), "passphrase" (the wrong one, or the header changed),
 * "damaged" (changed or cut short after it was written) or "hash" (a file
 * that doesn't match its manifest, in a file that is otherwise whole).
 * @param {string} file
 * @param {string} passphrase
 * @param {{
 *   onManifest?: (manifest: Manifest, digest: string) => void | Promise<void>,
 *   onObject?: (item: Item, bytes: Buffer) => void | Promise<void>,
 * }} [hooks]
 * @returns {Promise<{ manifest: Manifest, digest: string }>}
 */
export async function openBackup(file, passphrase, hooks = {}) {
  const handle = await open(file, "r");
  /** @type {AsyncGenerator<Buffer> | null} */
  let plaintext = null;
  try {
    const head = Buffer.alloc(HEADER_BYTES);
    const { bytesRead } = await handle.read(head, 0, HEADER_BYTES, 0);
    if (bytesRead < HEADER_BYTES) throw new BackupError("format");
    const header = parseHeader(head);
    const { key, checkKey } = await deriveKeys(
      passphrase,
      header.salt,
      header.kdf,
    );
    const aad = aadOf(header.kdf, header.salt, header.iv);
    const check = createHmac("sha256", checkKey).update(aad).digest();
    if (!timingSafeEqual(check, header.check)) {
      throw new BackupError("passphrase");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, header.iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(header.tag);
    plaintext = (async function* () {
      for await (const chunk of handle.createReadStream({
        start: HEADER_BYTES,
        autoClose: false,
      })) {
        const out = decipher.update(chunk);
        if (out.length > 0) yield out;
      }
      let last;
      try {
        last = decipher.final();
      } catch {
        throw new BackupError("damaged");
      }
      if (last.length > 0) yield last;
    })();
    const reader = chunkReader(plaintext);
    const length = (await reader.read(4)).readUInt32BE(0);
    if (length === 0 || length > MAX_MANIFEST_BYTES) {
      throw new BackupError("damaged");
    }
    const listed = await reader.read(length);
    const digest = sha256(listed);
    let manifest;
    try {
      manifest = JSON.parse(listed.toString("utf8"));
    } catch {
      throw new BackupError("damaged");
    }
    if (!goodManifest(manifest)) throw new BackupError("damaged");
    await hooks.onManifest?.(manifest, digest);
    let matched = true;
    for (const item of manifest.objects) {
      const bytes = await reader.read(item.size);
      if (sha256(bytes) !== item.sha256) matched = false;
      if (matched) await hooks.onObject?.(item, bytes);
    }
    // The tag is checked at the stream's end: a file changed anywhere after
    // it was written fails here, even when every SHA-256 matched.
    await reader.end();
    if (!matched) throw new BackupError("hash");
    return { manifest, digest };
  } finally {
    await plaintext?.return(undefined).catch(() => {});
    await handle.close();
  }
}

// ---------------------------------------------------------------------------
// The backup

/** A file's download, tried three times; null when it never came. */
async function fetchObject(client, bucket, path, sleep) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await client.download(bucket, path);
    } catch (error) {
      const gone =
        error instanceof StorageError &&
        (error.status === 400 || error.status === 404);
      if (gone || attempt >= 3) return null;
      await sleep(1000 * attempt);
    }
  }
}

/** A file's name in the plain folder: its place in the manifest, never its path. */
const plainName = (index) => `${String(index + 1).padStart(7, "0")}.bin`;

/**
 * @typedef {{ bucket: string, files: number, bytes: number, missing: number }} Count
 */

/**
 * The whole backup, after the questions: the app's buckets checked, every
 * file downloaded into a new dated folder under `parent`, the manifest, the
 * encrypted file beside the folder, opened again and checked, and the plain
 * folder deleted, whatever happened. `work` says what to delete if the
 * process is stopped half way.
 * @param {{
 *   client: StorageApi, source: string, parent: string, passphrase: string,
 *   now: Date, out: Out, kdf?: Kdf, work?: Work,
 *   sleep?: (ms: number) => Promise<void>, repo?: string,
 * }} options
 * @returns {Promise<{ file: string, counts: Count[], files: number, missing: number }>}
 */
export async function backup({
  client,
  source,
  parent,
  passphrase,
  now,
  out,
  kdf = KDF,
  work = { plain: null, partial: null },
  sleep = (ms) => new Promise((done) => setTimeout(done, ms)),
  repo = REPO_ROOT,
}) {
  // Nothing is made before the folder is known to be outside any checkout,
  // and it is asked again once it exists, where its links now lead.
  const before = folderRefusal(parent, { repo });
  if (before !== null) throw new Refusal(before);
  const buckets = await client.listBuckets();
  const ids = buckets.map((bucket) => bucket?.id);
  if (BUCKETS.some((id) => !ids.includes(id))) throw new Refusal("buckets");
  const others = ids.filter(
    (id) => typeof id === "string" && !BUCKETS.includes(id),
  ).length;
  if (others > 0) out.log(`[i] ${othersLine(others)}`);

  await mkdir(parent, { recursive: true });
  const real = realpathSync.native(parent);
  const after = folderRefusal(real, { repo });
  if (after !== null) throw new Refusal(after);
  const stamp = stampOf(now);
  const plain = join(real, `files-${stamp}`);
  const file = join(real, `files-${stamp}.backup`);
  if (existsSync(plain) || existsSync(file)) throw new Refusal("exists");
  await mkdir(plain, { mode: 0o700 });
  work.plain = plain;
  try {
    await mkdir(join(plain, "objects"));
    /** @type {Item[]} */
    const objects = [];
    /** @type {Missing[]} */
    const missing = [];
    /** @type {Count[]} */
    const counts = [];
    for (const bucket of BUCKETS) {
      const count = { bucket, files: 0, bytes: 0, missing: 0 };
      for (const listed of await listObjects(client, bucket)) {
        const bytes = goodPath(listed.path)
          ? await fetchObject(client, bucket, listed.path, sleep)
          : null;
        if (bytes === null || bytes.length > MAX_OBJECT_BYTES) {
          missing.push({ bucket, path: listed.path });
          count.missing += 1;
          continue;
        }
        await writeFile(
          join(plain, "objects", plainName(objects.length)),
          bytes,
          {
            flag: "wx",
          },
        );
        objects.push({
          bucket,
          path: listed.path,
          size: bytes.length,
          contentType: listed.contentType,
          cacheControl: listed.cacheControl,
          sha256: sha256(bytes),
        });
        count.files += 1;
        count.bytes += bytes.length;
      }
      counts.push(count);
      out.log(countLine(count));
    }
    /** @type {Manifest} */
    const manifest = {
      format: MANIFEST_FORMAT,
      version: VERSION,
      createdAt: now.toISOString(),
      source,
      buckets: BUCKETS.map((id) => {
        const found = buckets.find((bucket) => bucket.id === id);
        return {
          id,
          public: found?.public === true,
          fileSizeLimit:
            typeof found?.file_size_limit === "number"
              ? found.file_size_limit
              : null,
          allowedMimeTypes: Array.isArray(found?.allowed_mime_types)
            ? found.allowed_mime_types
            : null,
        };
      }),
      objects,
      missing,
    };
    await writeFile(
      join(plain, "manifest.json"),
      JSON.stringify(manifest, null, 1),
      { flag: "wx" },
    );
    // Each file read back from the folder is the one downloaded, by its SHA-256.
    const written = await writeBackup(
      file,
      manifest,
      async (index, item) => {
        const bytes = await readFile(join(plain, "objects", plainName(index)));
        if (bytes.length !== item.size || sha256(bytes) !== item.sha256) {
          throw new BackupError("hash");
        }
        return bytes;
      },
      passphrase,
      {
        kdf,
        onCreate: () => {
          work.partial = file;
        },
      },
    );
    // Opened again from the disk, to its end: the passphrase, every file by
    // its SHA-256 and the tag, before the plain folder goes.
    const opened = await openBackup(file, passphrase);
    if (opened.digest !== written) throw new BackupError("damaged");
    work.partial = null;
    return { file, counts, files: objects.length, missing: missing.length };
  } catch (error) {
    if (work.partial !== null) {
      await rm(work.partial, { force: true });
      work.partial = null;
    }
    throw error;
  } finally {
    await rm(plain, { recursive: true, force: true });
    work.plain = null;
  }
}

/** Deletes what a stopped backup left: the plain folder and a half-written file. */
export function cleanUp(work) {
  if (work.plain !== null) rmSync(work.plain, { recursive: true, force: true });
  if (work.partial !== null) rmSync(work.partial, { force: true });
  work.plain = null;
  work.partial = null;
}

// ---------------------------------------------------------------------------
// Words, for Orel

/** "קובץ אחד", "2 קבצים". */
export const filesWord = (n) => (n === 1 ? "קובץ אחד" : `${n} קבצים`);

/** A size as people read it. */
export function sizeOf(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** A bucket's line: how many files and how much, and how many didn't come. */
export function countLine({ bucket, files, bytes, missing }) {
  const got = `${bucket}: ${filesWord(files)} (${sizeOf(bytes)})`;
  return missing === 0
    ? `[v] ${got}`
    : `[x] ${got}, ${missing === 1 ? "וקובץ אחד לא ירד" : `ו-${missing} לא ירדו`}`;
}

const othersLine = (n) =>
  `${n === 1 ? "יש בפרויקט עוד bucket אחד" : `יש בפרויקט עוד ${n} buckets`} שהאפליקציה לא יוצרת. הם לא בגיבוי.`;

/** Whether this runs in CI (GitHub Actions sets both): it never does. */
export const runsInCi = (env) =>
  (env.CI ?? "") !== "" || (env.GITHUB_ACTIONS ?? "") !== "";

export const CI_REFUSAL =
  "הפקודה הזו לא רצה ב-CI או ב-GitHub Actions: גיבוי ושחזור של קבצים אמיתיים רצים רק במחשב שלך (docs/production.md, ב8).";

export const NO_TERMINAL =
  "הפקודה שואלת שאלות, ולכן מריצים אותה בחלון של PowerShell, בלי להעביר לה קלט מקובץ.";

export const CANCELLED = "הופסק. שום גיבוי לא נשמר, והקבצים שירדו נמחקו.";

/** What it says when it stopped on something it didn't expect: never the error. */
export const STOPPED =
  "הפעולה נעצרה לפני שהסתיימה. התיקייה הגלויה נמחקה, ושום גיבוי לא נשמר. מריצים שוב, ואם זה חוזר, שואלים בסשן.";

/** Why a backup can't be opened, by BackupError's kind. */
export const OPEN_WORDS = {
  format: "זה לא קובץ גיבוי של הקבצים, או שההתחלה שלו נפגמה. לא משתמשים בו.",
  passphrase: "הסיסמה לא פותחת את הקובץ: היא לא נכונה, או שהתחלת הקובץ השתנתה.",
  damaged:
    "הקובץ השתנה או נקטע אחרי שנכתב, ולכן לא נפתח עד הסוף. לא משתמשים בו.",
  hash: "קובץ בתוך הגיבוי לא תואם ל-SHA-256 שלו ברשימה. לא משתמשים בגיבוי הזה.",
};

/** Why Storage said no, in a few words: never its body. */
export function storageWords(error) {
  if (error instanceof StorageError) {
    if (error.status === 401 || error.status === 403) {
      return "Storage לא קיבל את המפתח: הוא לא המפתח הסודי של הפרויקט הזה.";
    }
    return error.status === 0
      ? "Storage ענה בצורה לא צפויה."
      : `Storage ענה ${error.status}.`;
  }
  const code = error?.cause?.code ?? error?.code;
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return `Storage לא ענה תוך ${TIMEOUT_MS / 1000} שניות.`;
  }
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") {
    return "הכתובת של הפרויקט לא נמצאה.";
  }
  if (code === "ECONNREFUSED") return "החיבור לפרויקט נדחה.";
  return typeof code === "string" && /^[A-Z0-9_]+$/.test(code)
    ? `אין תשובה מהפרויקט (${code}).`
    : "אין תשובה מהפרויקט.";
}

// ---------------------------------------------------------------------------
// Questions in the terminal

/**
 * A line typed in the terminal, shown as it is typed.
 * @param {string} question
 * @returns {Promise<string>}
 */
export function askVisible(question) {
  if (!process.stdin.isTTY) return Promise.reject(new NotATerminal());
  const lines = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });
  return new Promise((done, fail) => {
    lines.on("SIGINT", () => {
      lines.close();
      fail(new Cancelled());
    });
    lines.question(question, (answer) => {
      lines.close();
      done(answer);
    });
  });
}

/**
 * A line typed in the terminal with nothing shown: no letter and no star.
 * Backspace takes one back; Ctrl+C stops. `io` is the terminal (a stand-in
 * in the tests).
 * @param {string} question
 * @param {{ input: any, output: { write: (text: string) => unknown } }} [io]
 * @returns {Promise<string>}
 */
export function askHidden(
  question,
  { input, output } = { input: process.stdin, output: process.stdout },
) {
  if (!input.isTTY) return Promise.reject(new NotATerminal());
  return new Promise((done, fail) => {
    let typed = "";
    const finish = (error) => {
      input.off("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      if (error) fail(error);
      else done(typed);
    };
    const onData = (chunk) => {
      for (const character of String(chunk)) {
        if (character === "\r" || character === "\n") return finish();
        if (character === "\u0003") return finish(new Cancelled());
        if (character === "\u007f" || character === "\b") {
          typed = [...typed].slice(0, -1).join("");
        } else if (character >= " ") {
          typed += character;
        }
      }
    };
    output.write(question);
    input.setRawMode(true);
    input.setEncoding("utf8");
    input.on("data", onData);
    input.resume();
  });
}

// ---------------------------------------------------------------------------
// The command

const USAGE = [
  "כך מריצים:",
  "node tooling/backup-files.mjs",
  "ואפשר לתת תיקייה אחרת לגיבוי, מחוץ לתיקייה של הפרויקט:",
  'node tooling/backup-files.mjs "D:\\גיבויים"',
].join("\n");

const FOLDER_WORDS = {
  repo: "התיקייה הזו בתוך התיקייה של הפרויקט. קבצים של אנשים לא נשמרים שם אף פעם: נותנים תיקייה מחוץ לה.",
  checkout:
    "התיקייה הזו בתוך תיקייה של git. קבצים של אנשים לא נשמרים שם אף פעם: נותנים תיקייה אחרת.",
  link: "בדרך לתיקייה הזו יש קיצור שלא מוביל לשום מקום. נותנים תיקייה אחרת.",
};

/**
 * The command itself: the exit code it ends with. 0 done, 1 failed or
 * partial (said in words), 2 refused before anything was downloaded.
 * @param {string[]} args
 * @param {{
 *   env?: Record<string, string | undefined>, out?: Out,
 *   askSecret?: (question: string) => Promise<string>,
 *   fetch?: typeof fetch, client?: (origin: string, key: string) => StorageApi,
 *   now?: () => Date, kdf?: Kdf, work?: Work,
 *   sleep?: (ms: number) => Promise<void>, repo?: string, parent?: string,
 * }} [deps]
 * @returns {Promise<number>}
 */
export async function main(args, deps = {}) {
  const {
    env = process.env,
    out = console,
    askSecret = askHidden,
    fetch: fetchImpl = globalThis.fetch,
    client: makeClient = (origin, key) => storageClient(origin, key, fetchImpl),
    now = () => new Date(),
    kdf = KDF,
    work = { plain: null, partial: null },
    sleep,
    repo = REPO_ROOT,
  } = deps;
  if (runsInCi(env)) {
    out.error(CI_REFUSAL);
    return 2;
  }
  if (args.length > 1 || args.some((arg) => arg.startsWith("-"))) {
    out.error(USAGE);
    return 2;
  }
  const parent = args[0] ?? deps.parent ?? defaultParent();
  const refused = folderRefusal(parent, { repo });
  if (refused !== null) {
    out.error(FOLDER_WORDS[refused]);
    return 2;
  }
  out.log(
    "גיבוי הקבצים של האפליקציה מ-Storage: כל הקבצים, מוצפנים לקובץ אחד. מה שמקלידים כאן לא מופיע על המסך.",
  );
  try {
    let address = env.NEXT_PUBLIC_SUPABASE_URL ?? "";
    if (address === "") {
      address = await askSecret(
        "הכתובת של הפרויקט (בלוח של Supabase, הכפתור Connect): ",
      );
    } else {
      out.log(
        "[i] הכתובת של הפרויקט: מהמשתנה NEXT_PUBLIC_SUPABASE_URL של הסשן.",
      );
    }
    const project = projectOf(address);
    if (!project) {
      out.error(
        "זו לא כתובת של פרויקט ב-Supabase (https://, ואחריו המזהה שלו ו-.supabase.co), ולא של הפרויקט המקומי.",
      );
      return 2;
    }
    let key = env.SUPABASE_SECRET_KEY ?? "";
    if (key === "") {
      key = await askSecret(
        "המפתח הסודי של הפרויקט (Project Settings, ואז API Keys; מתחיל ב-sb_secret_): ",
      );
    } else {
      out.log("[i] המפתח: מהמשתנה SUPABASE_SECRET_KEY של הסשן.");
    }
    const kind = keyKind(key);
    if (kind !== "secret") {
      out.error(
        kind === "publishable"
          ? "זה המפתח הציבורי, ואיתו לא רואים אף קובץ. צריך את המפתח הסודי."
          : "זה לא נראה כמו מפתח של Supabase. צריך את המפתח הסודי, שמתחיל ב-sb_secret_.",
      );
      return 2;
    }
    const passphrase = await askSecret(
      `סיסמה חדשה לגיבוי (לפחות ${MIN_PASSPHRASE} תווים; כדאי שמנהל הסיסמאות ייצור אותה): `,
    );
    if ([...passphrase.normalize("NFC")].length < MIN_PASSPHRASE) {
      out.error(
        `הסיסמה קצרה מ-${MIN_PASSPHRASE} תווים. לא נשמר כלום. מריצים שוב עם סיסמה ארוכה יותר.`,
      );
      return 2;
    }
    const again = await askSecret("שוב, אותה סיסמה: ");
    if (again.normalize("NFC") !== passphrase.normalize("NFC")) {
      out.error("שתי הסיסמאות לא זהות. לא נשמר כלום. מריצים שוב.");
      return 2;
    }
    const client = makeClient(project.origin, key.trim());
    let result;
    try {
      result = await backup({
        client,
        source: project.ref,
        parent,
        passphrase,
        now: now(),
        out,
        kdf,
        work,
        sleep,
        repo,
      });
    } catch (error) {
      if (error instanceof Refusal) {
        out.error(
          {
            ...FOLDER_WORDS,
            buckets:
              "בפרויקט הזה חסר אחד מה-buckets של האפליקציה: זה לא הפרויקט שלה, או שהמפתח לא סודי. לא ירד כלום.",
            exists: "כבר יש גיבוי מהדקה הזו בתיקייה. מחכים דקה ומריצים שוב.",
          }[error.kind] ?? STOPPED,
        );
        return 2;
      }
      if (error instanceof BackupError) {
        out.error(
          `${OPEN_WORDS[error.kind]} שום גיבוי לא נשמר, והתיקייה הגלויה נמחקה.`,
        );
        return 1;
      }
      out.error(
        `${storageWords(error)} שום גיבוי לא נשמר, והתיקייה הגלויה נמחקה.`,
      );
      return 1;
    }
    out.log(
      `[v] הקובץ המוצפן נפתח שוב ונבדק: ${filesWord(result.files)}, כל אחד לפי ה-SHA-256 שלו.`,
    );
    out.log("[v] התיקייה הגלויה נמחקה. נשאר רק הקובץ המוצפן.");
    out.log(`הגיבוי: ${result.file}`);
    out.log(
      'את הסיסמה שומרים במנהל הסיסמאות, בשם "סיסמת גיבוי הקבצים". בלעדיה אף אחד לא יפתח את הקובץ.',
    );
    if (result.missing > 0) {
      out.error(
        `[x] ${result.missing === 1 ? "קובץ אחד לא ירד" : `${result.missing} קבצים לא ירדו`}. כל השאר בגיבוי, ורשימה של מה שחסר שמורה בתוכו. מריצים שוב, ואם זה חוזר, שואלים בסשן.`,
      );
      return 1;
    }
    out.log("הכול תקין.");
    return 0;
  } catch (error) {
    if (error instanceof NotATerminal) {
      out.error(NO_TERMINAL);
      return 2;
    }
    if (error instanceof Cancelled) {
      out.error(CANCELLED);
      return 1;
    }
    out.error(STOPPED);
    return 1;
  }
}

if (basename(process.argv[1] ?? "") === "backup-files.mjs") {
  /** @type {Work} */
  const work = { plain: null, partial: null };
  process.once("SIGINT", () => {
    cleanUp(work);
    console.error(CANCELLED);
    process.exit(130);
  });
  main(process.argv.slice(2), { work }).then(
    (code) => {
      process.exitCode = code;
    },
    () => {
      cleanUp(work);
      console.error(STOPPED);
      process.exitCode = 1;
    },
  );
}
