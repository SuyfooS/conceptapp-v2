import { FILES_GUARD_BYTES } from "./chat-files";
import { DOCUMENT_PHOTO_MAX_BYTES } from "./documents";

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

/*
 * A business's own spaces (bigger teams, the first fixes): its documents'
 * (`documentSpaceMb`) and its chat files' (`fileSpaceMb`), said before they
 * fill, to the console, to the business's owner and managers, and to whoever
 * sends documents. No new space and nothing that costs: only words.
 */

/** Past this share of its space, a business is told it is filling up. */
export const SPACE_NEAR_PERCENT = 80;

/**
 * How full a business's space for documents is: "full" once less than a
 * photo of a page is left (the smallest document most senders send), "near"
 * from SPACE_NEAR_PERCENT, else "ok". A space of none says nothing.
 */
export type DocumentSpaceState = "ok" | "near" | "full";

export function documentSpaceState(
  usedBytes: number,
  spaceBytes: number,
): DocumentSpaceState {
  if (!(spaceBytes > 0)) return "ok";
  const used = Number.isFinite(usedBytes) ? Math.max(0, usedBytes) : 0;
  if (spaceBytes - used < DOCUMENT_PHOTO_MAX_BYTES) return "full";
  return used * 100 >= spaceBytes * SPACE_NEAR_PERCENT ? "near" : "ok";
}

/**
 * How full its space for chat files is. They are never refused for it (the
 * oldest go first), so it is "near" from SPACE_NEAR_PERCENT, never "full".
 */
export function chatSpaceState(
  usedBytes: number,
  spaceBytes: number,
): "ok" | "near" {
  if (!(spaceBytes > 0) || !(usedBytes > 0)) return "ok";
  return usedBytes * 100 >= spaceBytes * SPACE_NEAR_PERCENT ? "near" : "ok";
}

/** Megabytes as the business's screens write them: one decimal under 10, whole above, never negative. */
export function megabytes(bytes: number): number {
  const mb = Number.isFinite(bytes) ? Math.max(0, bytes) / MB : 0;
  return mb < 10 ? Math.round(mb * 10) / 10 : Math.round(mb);
}

/** A business near or past its own space, for the console's warnings. */
export type BusinessSpaceAlert = {
  id: string;
  name: string;
  kind: "documents" | "chat";
  state: "near" | "full";
  usedBytes: number;
  capBytes: number;
};

/**
 * The businesses near or past their own spaces, for the console: full ones
 * first, then documents before chat (only documents are ever refused), then
 * the fuller first, then by name. Only those that take files; documents only
 * where their bytes are known (`null` before the migration).
 */
export function businessSpaceAlerts(
  businesses: readonly {
    id: string;
    name: string;
    filesOpen: boolean;
    chatBytes: number;
    chatCapBytes: number;
    documentBytes: number | null;
    documentCapBytes: number;
  }[],
): BusinessSpaceAlert[] {
  const alerts: (BusinessSpaceAlert & { share: number })[] = [];
  for (const business of businesses) {
    if (!business.filesOpen) continue;
    const { id, name } = business;
    if (business.documentBytes !== null) {
      const state = documentSpaceState(
        business.documentBytes,
        business.documentCapBytes,
      );
      if (state !== "ok") {
        alerts.push({
          id,
          name,
          kind: "documents",
          state,
          usedBytes: business.documentBytes,
          capBytes: business.documentCapBytes,
          share: business.documentBytes / business.documentCapBytes,
        });
      }
    }
    if (chatSpaceState(business.chatBytes, business.chatCapBytes) === "near") {
      alerts.push({
        id,
        name,
        kind: "chat",
        state: "near",
        usedBytes: business.chatBytes,
        capBytes: business.chatCapBytes,
        share: business.chatBytes / business.chatCapBytes,
      });
    }
  }
  const rank = (alert: BusinessSpaceAlert) =>
    (alert.state === "full" ? 0 : 2) + (alert.kind === "documents" ? 0 : 1);
  return alerts
    .sort(
      (a, b) =>
        rank(a) - rank(b) || b.share - a.share || a.name.localeCompare(b.name),
    )
    .map(({ share: _share, ...alert }) => alert);
}

/** How full a business's spaces are, for its own people (public.file_space). */
export type FileSpace = {
  /** Chat is on and the business takes files (not a demo that takes none). */
  filesOpen: boolean;
  documentBytes: number;
  documentSpaceBytes: number;
  chatBytes: number;
  chatSpaceBytes: number;
};
