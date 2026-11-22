import "server-only";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { type EmployeeDataKeys, parseEmployeeDataKeys } from "./env";

/*
 * The hiring file's envelope encryption (profile H4; issue #82 §2.3), in
 * server code and never in Postgres, so the database, its logs and its
 * backups only ever hold ciphertext for the sealed columns. One random data
 * key (DEK) per business and person, kept in `private.person_keys` wrapped by
 * a key-encryption key (KEK) from `EMPLOYEE_DATA_KEKS`; the KEK never leaves
 * this process. AES-256-GCM throughout:
 *
 *   sealed value   0x01 ‖ IV (12) ‖ tag (16) ‖ ciphertext, with the AAD
 *                  `ca|v1|<table>|<column>|<business>|<user>`, so a value
 *                  pasted into another row, column or person doesn't open
 *   wrapped DEK    the same with the KEK, AAD `ca|dek|<business>|<user>`:
 *                  61 bytes
 *   demo value     0x00 ‖ UTF-8: the demo businesses' made-up values, which
 *                  only a demo business may hold (the database's trigger) and
 *                  `open` reads only when the read says it's a demo's
 *
 * Nothing here logs a value or reads a form; the one log line is a key
 * setting's name when it is set wrong.
 */

const VERSION = 1;
const DEMO = 0;
const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const HEAD_BYTES = 1 + IV_BYTES + TAG_BYTES;

export type KeyRing = EmployeeDataKeys;

/** The columns a sealed value lives in. */
export type SealedColumn =
  | "id_enc"
  | "id_name_enc"
  | "address_enc"
  | "email_enc"
  | "work_language_enc"
  | "bank_account_enc"
  | "bank_holder_enc"
  | "contact_enc";

/** Where a sealed value belongs: its table and column, and whose it is. */
export type SealedPlace = {
  table: "employee_details" | "member_emergency_contacts";
  column: SealedColumn;
  business: string;
  user: string;
};

/** A sealed value, or a wrapped key, that doesn't open: never says what it held. */
export class EmployeeDataUnreadable extends Error {
  constructor() {
    super("A sealed value of the hiring file could not be opened");
    this.name = "EmployeeDataUnreadable";
  }
}

const valueAad = (place: SealedPlace) =>
  Buffer.from(
    `ca|v1|${place.table}|${place.column}|${place.business.toLowerCase()}|${place.user.toLowerCase()}`,
    "utf8",
  );

const keyAad = (business: string, user: string) =>
  Buffer.from(`ca|dek|${business.toLowerCase()}|${user.toLowerCase()}`, "utf8");

function sealWith(key: Buffer, plain: Buffer, aad: Buffer): Buffer {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", key, iv, {
    authTagLength: TAG_BYTES,
  });
  cipher.setAAD(aad);
  const body = Buffer.concat([cipher.update(plain), cipher.final()]);
  return Buffer.concat([Buffer.from([VERSION]), iv, cipher.getAuthTag(), body]);
}

function openWith(key: Buffer, sealed: Buffer, aad: Buffer): Buffer {
  if (sealed.length <= HEAD_BYTES || sealed[0] !== VERSION) {
    throw new EmployeeDataUnreadable();
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      key,
      sealed.subarray(1, 1 + IV_BYTES),
      { authTagLength: TAG_BYTES },
    );
    decipher.setAAD(aad);
    decipher.setAuthTag(sealed.subarray(1 + IV_BYTES, HEAD_BYTES));
    return Buffer.concat([
      decipher.update(sealed.subarray(HEAD_BYTES)),
      decipher.final(),
    ]);
  } catch {
    throw new EmployeeDataUnreadable();
  }
}

/** A new person's data key: 32 random bytes. */
export function newDataKey(): Buffer {
  return randomBytes(KEY_BYTES);
}

/** A data key wrapped with the ring's active key, for `private.person_keys`. */
export function wrapDataKey(
  ring: KeyRing,
  dek: Buffer,
  business: string,
  user: string,
): { kekId: number; wrapped: Buffer } {
  const kek = ring.keys.get(ring.active);
  if (!kek || dek.length !== KEY_BYTES) throw new EmployeeDataUnreadable();
  return {
    kekId: ring.active,
    wrapped: sealWith(kek, dek, keyAad(business, user)),
  };
}

/** The data key a `person_keys` row holds, with whichever of the ring's keys wrapped it. */
export function unwrapDataKey(
  ring: KeyRing,
  kekId: number,
  wrapped: Buffer,
  business: string,
  user: string,
): Buffer {
  const kek = ring.keys.get(kekId);
  if (!kek) throw new EmployeeDataUnreadable();
  const dek = openWith(kek, wrapped, keyAad(business, user));
  if (dek.length !== KEY_BYTES) throw new EmployeeDataUnreadable();
  return dek;
}

/** A value sealed for its place, with a fresh IV every time. */
export function seal(dek: Buffer, text: string, place: SealedPlace): Buffer {
  if (dek.length !== KEY_BYTES) throw new EmployeeDataUnreadable();
  return sealWith(dek, Buffer.from(text, "utf8"), valueAad(place));
}

/**
 * A sealed value's text: sealed (0x01) with the person's data key, or a demo
 * business's made-up text (0x00) only when the read said it is a demo's.
 * Anything else, or a value moved from another place, throws.
 */
export function open(
  dek: Buffer | null,
  bytes: Buffer,
  place: SealedPlace,
  options: { demo: boolean },
): string {
  if (bytes[0] === DEMO && options.demo) {
    return bytes.subarray(1).toString("utf8");
  }
  if (bytes[0] !== VERSION || dek === null) throw new EmployeeDataUnreadable();
  return openWith(dek, bytes, valueAad(place)).toString("utf8");
}

/** Bytes as the database takes them in a patch (`private.sealed_of`). */
export function toBase64(bytes: Buffer): string {
  return bytes.toString("base64");
}

/** Bytes as the database hands them over (`private.sealed_text`). */
export function fromBase64(text: string): Buffer {
  return Buffer.from(text, "base64");
}

let cached: { from: string; ring: KeyRing | null } | null = null;

/**
 * This process's keys, or null: none set (the file is closed here), or one
 * set wrong, which is logged once by its name and never its value. Read again
 * only when the settings change.
 */
export function employeeKeyRing(): KeyRing | null {
  const source = {
    EMPLOYEE_DATA_KEKS: process.env.EMPLOYEE_DATA_KEKS,
    EMPLOYEE_DATA_KEK_ACTIVE: process.env.EMPLOYEE_DATA_KEK_ACTIVE,
  };
  const from = createHash("sha256")
    .update(
      `${source.EMPLOYEE_DATA_KEKS ?? ""}\n${source.EMPLOYEE_DATA_KEK_ACTIVE ?? ""}`,
    )
    .digest("hex");
  if (cached?.from === from) return cached.ring;
  let ring: KeyRing | null;
  try {
    ring = parseEmployeeDataKeys(source);
  } catch (error) {
    console.error(`The hiring file stays closed: ${(error as Error).message}`);
    ring = null;
  }
  cached = { from, ring };
  return ring;
}
