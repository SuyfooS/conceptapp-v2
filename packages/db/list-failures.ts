import { isMissingFunction } from "./missing";

/*
 * Why a lists write was refused, from what the database said
 * (supabase/migrations/20261109000600_lists.sql and those after it), for the
 * screens' words. Kept apart from @db/lists, which is server only, so it is
 * tested on its own.
 */

/** Why a write was refused. */
export type ListFailure =
  /** Not theirs to do (42501), or nothing of theirs (P0002). */
  | "noAccess"
  /** A shape the database won't keep (22023). */
  | "invalid"
  /** Required items are left (23514). */
  | "left"
  /** Changed since it was read (40001). */
  | "changed"
  /** Closed: finished, cancelled, missed, or a removed template (55000). */
  | "finished"
  /** The migration isn't on this project yet. */
  | "notYet"
  | "failed";

/**
 * Why an item's save was refused, a fix's reasons too (L6b-1,
 * 20261116000300_lists_fix.sql): a required item of a finished list is
 * changed, never emptied (23514, hint 'required'), and a list opened again
 * while it was being fixed is filled, not fixed (55000 from a fix).
 */
export type ItemFailure = ListFailure | "keepRequired" | "reopened";

/** What the database says when it refuses, as supabase-js passes it on. */
export type DatabaseRefusal = {
  code?: string;
  message: string;
  hint?: string | null;
};

/**
 * The failure a refusal means. A missing function is "notYet", so a write
 * that ships before its migration says the lists aren't ready yet. `what`
 * names the write in the server's log when nothing else fits.
 */
export function listFailureOf(
  error: DatabaseRefusal,
  what = "a lists write",
): ListFailure {
  if (isMissingFunction(error)) return "notYet";
  switch (error.code) {
    case "42501":
    case "P0002":
      return "noAccess";
    case "22023":
      return "invalid";
    case "23514":
      return "left";
    case "40001":
      return "changed";
    case "55000":
      return "finished";
    default:
      console.error(`${what} failed`, error.message);
      return "failed";
  }
}

/**
 * The same for an item's save or photo. `fixing` is a fix of a finished list
 * (`public.fix_list_item`, `fix_list_item_photo`): there, 55000 says the list
 * was opened again meanwhile ("reopened"). 23514 with hint 'required' is a
 * required item a fix would empty ("keepRequired"); a fix before its
 * migration is "notYet", like any missing function.
 */
export function itemFailureOf(
  error: DatabaseRefusal,
  fixing: boolean,
  what = "a lists write",
): ItemFailure {
  if (error.code === "23514" && error.hint === "required") {
    return "keepRequired";
  }
  const failure = listFailureOf(error, what);
  return fixing && failure === "finished" ? "reopened" : failure;
}
