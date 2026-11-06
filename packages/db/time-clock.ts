import "server-only";
import { createHash, randomBytes } from "node:crypto";
import {
  type ClockFailure,
  clockFailureOf,
  type TimeEntry,
  timeEntry,
} from "@domain/time-clock";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * The time clock. Writes run with the secret key; the database checks every
 * rule for `actorId`, and callers make sure the actor is the signed-in person
 * and not viewing as someone else.
 */

/** A fresh punch code: 24 random bytes, base64url (fits a small QR). */
export function newPunchCode(): string {
  return randomBytes(24).toString("base64url");
}

/** What the database stores for a code: its SHA-256 in hex. */
export function hashPunchCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

export type ClockResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; failure: ClockFailure };

async function call<T>(
  run: () => PromiseLike<{
    data: T | null;
    error: { code?: string; message: string } | null;
  }>,
): Promise<ClockResult<T>> {
  const { data, error } = await run();
  if (!error) return { ok: true, value: data as T };
  const failure = clockFailureOf(error.code, error.message);
  if (failure === "failed") console.error("time clock failed", error.message);
  return { ok: false, failure };
}

/**
 * A manager or owner's device shows a fresh code for the business (as a
 * QR). Returns the code to show, which the database keeps only as a hash,
 * valid for `PUNCH_CODE_TTL_SECONDS`.
 */
export async function issuePunchCode(
  actorId: string,
  businessId: string,
): Promise<ClockResult<{ code: string; expiresAt: string }>> {
  const code = newPunchCode();
  const result = await call(() =>
    createAdminClient().rpc("issue_punch_code", {
      actor: actorId,
      business: businessId,
      code_hash: hashPunchCode(code),
    }),
  );
  return result.ok
    ? { ok: true, value: { code, expiresAt: result.value } }
    : result;
}

/** `actorId` clocks in, with the code they scanned. Returns the entry's id. */
export const clockIn = (
  actorId: string,
  businessId: string,
  code: string | null,
) =>
  call(() =>
    createAdminClient().rpc("clock_in", {
      actor: actorId,
      business: businessId,
      code_hash: code === null ? undefined : hashPunchCode(code),
    }),
  );

/** `actorId` clocks out of their open entry. Returns its id. */
export const clockOut = (
  actorId: string,
  businessId: string,
  code: string | null,
) =>
  call(() =>
    createAdminClient().rpc("clock_out", {
      actor: actorId,
      business: businessId,
      code_hash: code === null ? undefined : hashPunchCode(code),
    }),
  );

/** `actorId` goes on a break during their open entry. Returns its id. */
export const startBreak = (actorId: string, businessId: string) =>
  call(() =>
    createAdminClient().rpc("start_break", {
      actor: actorId,
      business: businessId,
    }),
  );

/** `actorId` comes back from their open break. Returns its id. */
export const endBreak = (actorId: string, businessId: string) =>
  call(() =>
    createAdminClient().rpc("end_break", {
      actor: actorId,
      business: businessId,
    }),
  );

/** `actorId` takes back leaving, right after they left. */
export const undoClockOut = (actorId: string, entryId: string) =>
  call(() =>
    createAdminClient().rpc("undo_clock_out", {
      actor: actorId,
      entry: entryId,
    }),
  );

/** An owner or manager chooses whether breaks come off the hours. */
export const setClockSettings = (
  actorId: string,
  businessId: string,
  unpaidBreaks: boolean,
) =>
  call(() =>
    createAdminClient().rpc("set_clock_settings", {
      actor: actorId,
      business: businessId,
      unpaid_breaks: unpaidBreaks,
    }),
  );

/** A manager adds an entry someone forgot to punch. Returns its id. */
export const addTimeEntry = (
  actorId: string,
  businessId: string,
  personId: string,
  times: { clockIn: string; clockOut: string; note?: string },
) =>
  call(() =>
    createAdminClient().rpc("add_time_entry", {
      actor: actorId,
      business: businessId,
      person: personId,
      new_clock_in: times.clockIn,
      new_clock_out: times.clockOut,
      note: times.note,
    }),
  );

/** A manager changes an entry's times (a null end leaves it open). */
export const correctTimeEntry = (
  actorId: string,
  entryId: string,
  times: { clockIn: string; clockOut: string | null; note?: string },
) =>
  call(() =>
    createAdminClient().rpc("correct_time_entry", {
      actor: actorId,
      entry: entryId,
      new_clock_in: times.clockIn,
      // Left out (SQL null) keeps the entry open.
      new_clock_out: times.clockOut ?? undefined,
      note: times.note,
    }),
  );

/**
 * A business's entries that start in [from, to) with their breaks, as the
 * signed-in person may read them (RLS: their own; managers, owners and
 * `clock.edit` the business's), oldest first. Open entries that started earlier
 * are included, so "at work now" sees a night shift from yesterday. With
 * `userId`, that person's only.
 */
export async function getTimeEntries(
  businessId: string,
  from: Date,
  to: Date,
  userId?: string,
): Promise<TimeEntry[]> {
  const supabase = await createClient();
  const query = supabase
    .from("time_entries")
    .select(
      "id, user_id, clock_in, clock_out, source, time_breaks (id, started_at, ended_at, unpaid)",
    )
    .eq("business_id", businessId)
    .lt("clock_in", to.toISOString())
    .or(`clock_in.gte.${from.toISOString()},clock_out.is.null`)
    .order("clock_in");
  const { data, error } = await (userId ? query.eq("user_id", userId) : query);
  if (error) throw error;
  return data.map((row) =>
    timeEntry.parse({
      id: row.id,
      userId: row.user_id,
      clockIn: row.clock_in,
      clockOut: row.clock_out,
      source: row.source,
      breaks: row.time_breaks.map((pause) => ({
        id: pause.id,
        startedAt: pause.started_at,
        endedAt: pause.ended_at,
        unpaid: pause.unpaid,
      })),
    }),
  );
}
