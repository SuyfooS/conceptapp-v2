import { FILES_GUARD_BYTES } from "./chat-files";

/**
 * How full the project is, for the console's storage card (chat plan §6.6):
 * the free plan's 500 MB database and 1 GB of Storage are shared by every
 * business, so the card shows what each holds against the plan, every
 * business's chat space against its cap, and the caps added up, with a
 * warning before anything is refused. Sizes only: never a file, a
 * conversation or a person.
 */

const MB = 1024 * 1024;

/** The free plan's database. */
export const DATABASE_PLAN_BYTES = 500 * MB;
/** Past this the database is worth telling Orel about (§6.6). */
export const DATABASE_TELL_BYTES = 350 * MB;
/** Past this Storage is worth telling Orel about (§6.6), before the 900 MB guard. */
export const STORAGE_TELL_BYTES = 700 * MB;

/** A size as the card writes it: a number and its unit. */
export type StorageAmount = { unit: "kb" | "mb" | "gb"; value: number };

/**
 * Bytes in the unit a person reads them in: KB under a megabyte (at least 1
 * for anything there), MB under a gigabyte (one decimal under 10), else GB
 * with two decimals. Never negative.
 */
export function storageAmount(bytes: number): StorageAmount {
  const size = Number.isFinite(bytes) ? Math.max(0, bytes) : 0;
  if (size < MB) {
    return {
      unit: "kb",
      value: size === 0 ? 0 : Math.max(1, Math.round(size / 1024)),
    };
  }
  if (size < 1024 * MB) {
    const mb = size / MB;
    return {
      unit: "mb",
      value: mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb),
    };
  }
  return { unit: "gb", value: Math.round((size / (1024 * MB)) * 100) / 100 };
}

/** How much of `whole` `part` is, in whole percent from 0 to 100. */
export function storageShare(part: number, whole: number): number {
  if (!(whole > 0) || !(part > 0)) return 0;
  return Math.min(100, Math.round((part / whole) * 100));
}

/** What the card warns about, if anything. */
export type StorageAlerts = {
  /** Storage is past the guard: new chat files are refused now. */
  filesRefused: boolean;
  /** Storage is past 700 MB: time to tell Orel. */
  storageHigh: boolean;
  /**
   * The businesses' caps add up past the guard: if they all filled up, new
   * files would be refused before any reached its cap.
   */
  capsOver: boolean;
  /** The database is past 350 MB: time to tell Orel. */
  databaseHigh: boolean;
};

export function storageAlerts(use: {
  databaseBytes: number;
  storageBytes: number;
  guardBytes: number;
  chatCapsBytes: number;
  documentCapsBytes: number;
}): StorageAlerts {
  const guard = use.guardBytes > 0 ? use.guardBytes : FILES_GUARD_BYTES;
  return {
    filesRefused: use.storageBytes >= guard,
    storageHigh: use.storageBytes > STORAGE_TELL_BYTES,
    capsOver: use.chatCapsBytes + use.documentCapsBytes > guard,
    databaseHigh: use.databaseBytes > DATABASE_TELL_BYTES,
  };
}
