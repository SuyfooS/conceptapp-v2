import { createHash } from "node:crypto";

/**
 * The test business's fixed ids, fake names and numbers that can never be
 * anyone's, and the one way every choice is made (docs/measure.md). Nothing
 * here is random: the same SEED_VERSION and the same anchor make the same
 * business, row for row.
 */

/** Bumped when the seed's choices change, so two runs compare only like with like. */
export const SEED_VERSION = "1";

/** Every id the seed writes starts with it; nothing else in the repo uses it. */
export const PREFIX = "5ca1e300";

/** The business's clock: every date and time of the seed is read on it. */
export const ZONE = "Asia/Jerusalem";

/** `.invalid` can never deliver (RFC 2606), so no login can be mailed. */
export const EMAIL_DOMAIN = "scale.conceptapp.invalid";

/**
 * A number from 0 to 1 for one choice: md5 of the version, the kind of
 * choice, who it is about and the day, its first 8 hex digits over 2³². SQL
 * reads it the same way (`choiceSql`), and the database test checks a vector
 * of them against this.
 */
export function choice(kind: string, subject: string, day = ""): number {
  const hex = createHash("md5")
    .update(`${SEED_VERSION}:${kind}:${subject}:${day}`)
    .digest("hex");
  return Number.parseInt(hex.slice(0, 8), 16) / 2 ** 32;
}

/**
 * The same choice in SQL, for an expression of the subject and one of the
 * day (both text): `('x' || 8 hex digits)::bit(32)::bigint` is unsigned.
 */
export function choiceSql(kind: string, subject: string, day: string): string {
  return `(('x' || substr(md5(current_setting('scale.version') || ':${kind}:' || ${subject} || ':' || ${day}), 1, 8))::bit(32)::bigint / 4294967296.0)`;
}

/** A person of the seed: staff 1..N, people who left 10001.., 900001 and 900002, the neighbour's 800001... */
export function personId(n: number): string {
  return `${PREFIX}-0000-4000-a000-${String(n).padStart(12, "0")}`;
}

/** Kinds of row the seed gives an id of its own, each in its own block of ids. */
export const ROW_KINDS = {
  week: 1,
  shift: 2,
  entry: 3,
  break: 4,
  swap: 5,
  submission: 6,
  range: 7,
  department: 8,
  conversation: 9,
  message: 10,
  draft: 11,
  document: 12,
  upload: 13,
  wage: 14,
  period: 15,
  invite: 16,
} as const;

export type RowKind = keyof typeof ROW_KINDS;

/** `5ca1e300-<kind>-4…-8…-…`: a valid version-4 shape, its counter in the rest. */
export function rowId(kind: RowKind, n: number): string {
  const hex = n.toString(16).padStart(18, "0");
  const block = ROW_KINDS[kind].toString(16).padStart(4, "0");
  return `${PREFIX}-${block}-4${hex.slice(0, 3)}-8${hex.slice(3, 6)}-${hex.slice(6)}`;
}

/** Ids handed out in order, one counter per kind. */
export class Ids {
  private readonly next = new Map<RowKind, number>();

  take(kind: RowKind): string {
    const n = (this.next.get(kind) ?? 0) + 1;
    this.next.set(kind, n);
    return rowId(kind, n);
  }
}

/** 32 hex digits of md5, for file keys and invite hashes. */
export function hexOf(text: string): string {
  return createHash("md5").update(`${SEED_VERSION}:${text}`).digest("hex");
}

/**
 * A display number from the North American range reserved for fiction
 * (NXX-555-0100 to 0199, in every area code), so it can never ring anyone:
 * area codes 201 to 210 for members, people who left and the accountant,
 * 211 and 212 for the seeded invites. `+1 2NN 555 01xx`, as E.164.
 */
export function fictionalNumber(index: number, block: "people" | "invites") {
  const area = (block === "people" ? 201 : 211) + Math.floor(index / 100);
  const last = block === "people" ? 210 : 212;
  if (index < 0 || area > last) {
    throw new Error(`No fictional number left for ${block} #${index}`);
  }
  return `+1${area}55501${String(index % 100).padStart(2, "0")}`;
}

/** Every display and invite number the seed may write. */
export const FICTIONAL_NUMBER = /^\+12(0[1-9]|1[0-2])55501\d\d$/;

/**
 * The only Israeli numbers of the plan, for the import of 300 alone:
 * 050-000-6100 to 6399, used nowhere else in the repo (tooling/measure-guards.test.ts).
 */
export function importNumber(index: number): string {
  if (index < 0 || index > 299) throw new Error(`No import number #${index}`);
  return `+97250000${6100 + index}`;
}

export const IMPORT_NUMBER = /^\+97250000(6[1-3]\d\d)$/;

export function emailOf(n: number): string {
  return `p${String(n).padStart(6, "0")}@${EMAIL_DOMAIN}`;
}

/** First names, each with how the app addresses them. Generic, of every kind. */
export const FIRST_NAMES: readonly (readonly [string, "f" | "m"])[] = [
  ["נועה", "f"],
  ["יוסי", "m"],
  ["מאיה", "f"],
  ["דוד", "m"],
  ["שירה", "f"],
  ["אורי", "m"],
  ["תמר", "f"],
  ["עמית", "m"],
  ["רוני", "f"],
  ["איתי", "m"],
  ["הילה", "f"],
  ["משה", "m"],
  ["ליאת", "f"],
  ["אחמד", "m"],
  ["יעל", "f"],
  ["סרגיי", "m"],
  ["מירב", "f"],
  ["נועם", "m"],
  ["סמאח", "f"],
  ["אליהו", "m"],
  ["אנה", "f"],
  ["גיא", "m"],
  ["רחל", "f"],
  ["עומר", "m"],
  ["דנה", "f"],
  ["יוסף", "m"],
  ["חן", "f"],
  ["ראובן", "m"],
  ["לינוי", "f"],
  ["עידו", "m"],
];

/**
 * Second names for every 25th person's long double name, to test wrapping:
 * of the same form as the first, so a double name never mixes the two.
 */
export const SECOND_NAMES: Record<"f" | "m", readonly string[]> = {
  f: ["שושנה", "מרים", "רבקה"],
  m: ["אליעזר", "גבריאל", "בנימין"],
};

/**
 * `<first> בדיקה <NNN>`, or every 25th `<first>-<second> בדיקה-ארוכה <NNN>`:
 * 017 is "נועם בדיקה 017", 025 "יוסף-אליעזר בדיקה-ארוכה 025".
 */
export function nameOf(n: number): { name: string; addressForm: "f" | "m" } {
  const [first, form] = FIRST_NAMES[n % FIRST_NAMES.length] ?? ["נועה", "f"];
  const number = String(n).padStart(3, "0");
  if (n % 25 === 0) {
    const seconds = SECOND_NAMES[form];
    const second = seconds[Math.floor(n / 50) % seconds.length] ?? "שושנה";
    return {
      name: `${first}-${second} בדיקה-ארוכה ${number}`,
      addressForm: form,
    };
  }
  return { name: `${first} בדיקה ${number}`, addressForm: form };
}

/** The name the business uses instead, for a third of its people (every third number): `<first> ב׳ <NNN>`, as "סמאח ב׳ 018". */
export function businessNameOf(n: number): string {
  const [first] = FIRST_NAMES[n % FIRST_NAMES.length] ?? ["נועה"];
  return `${first} ב׳ ${String(n).padStart(3, "0")}`;
}

/** What every fake name looks like, so a test can tell them from a real one. */
export const FAKE_NAME = /^[֐-׿]+(-[֐-׿]+)? בדיקה(-ארוכה)? \d{3,6}$/;
