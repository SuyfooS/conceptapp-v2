import "server-only";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { isStaff } from "@domain/modules";
import { type PunchProof, padShortCode } from "@domain/punch-code-format";
import {
  type CancelledEntry,
  type ClockFailure,
  cancelledEntry,
  clockFailureOf,
  ENTRY_PROOFS,
  type EntryProof,
  entryToConfirm,
  PUNCH_CODE_TTL_SECONDS,
  type TimeEntry,
  timeEntry,
} from "@domain/time-clock";
import type { Database } from "./database.types";
import { allPages } from "./pages";
import { punchKey } from "./punch-key";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * The time clock. Writes run with the secret key; the database checks every
 * rule for `actorId`, and callers make sure the actor is the signed-in person
 * and not viewing as someone else.
 */

/** A fresh punch code for the QR: 16 random bytes, base64url, 22 characters. */
export function newPunchCode(): string {
  return randomBytes(16).toString("base64url");
}

/** Fresh digits to type beside the QR: six, leading zeros kept. */
export function newShortCode(): string {
  return padShortCode(randomInt(0, 1_000_000));
}

/** What the database stores for a code: its SHA-256 in hex. */
export function hashPunchCode(code: string): string {
  return createHash("sha256").update(code, "utf8").digest("hex");
}

/**
 * What the database stores for the digits: an HMAC with the server's own key
 * (`@db/punch-key`), per business, so the same digits in two businesses differ
 * and a copy of the table can't be turned back into digits.
 */
export function hashShortCode(
  businessId: string,
  digits: string,
  key: Buffer = punchKey(),
): string {
  return createHmac("sha256", key)
    .update(`${businessId}:${digits}`, "utf8")
    .digest("hex");
}

export type ClockResult<T = undefined> =
  | { ok: true; value: T }
  | { ok: false; failure: ClockFailure };

type RpcError = { code?: string; message: string; hint?: string | null };

/** A refusal as the screen says it. Only the message is logged: it holds no hash. */
function refusal(error: RpcError): { ok: false; failure: ClockFailure } {
  const failure = clockFailureOf(error.code, error.message, error.hint);
  if (failure === "failed") console.error("time clock failed", error.message);
  return { ok: false, failure };
}

async function call<T>(
  run: () => PromiseLike<{
    data: T | null;
    error: RpcError | null;
  }>,
): Promise<ClockResult<T>> {
  const { data, error } = await run();
  if (!error) return { ok: true, value: data as T };
  return refusal(error);
}

export type IssuedPunchCode = {
  /** The QR's code. */
  code: string;
  /** The digits under it. */
  short: string;
  expiresAt: string;
  /** When the database made it, in its own time. */
  now: string;
};

/**
 * A fresh code shown on a manager's or owner's phone: the QR's code and its
 * digits, which the database keeps only as hashes, valid for
 * `PUNCH_CODE_TTL_SECONDS`. No time is sent: the database stamps the code with
 * its own now(), the clock check_punch compares with, so a server clock ahead
 * of Postgres never makes a fresh code "not yet valid". The same digits live
 * in the business already (23505) gets one retry with new values.
 */
export async function issuePunchCode(
  actorId: string,
  businessId: string,
): Promise<ClockResult<IssuedPunchCode>> {
  for (let attempt = 0; ; attempt += 1) {
    const code = newPunchCode();
    const short = newShortCode();
    const { data, error } = await createAdminClient().rpc("issue_punch_code", {
      actor: actorId,
      business: businessId,
      code_hash: hashPunchCode(code),
      short_hash: hashShortCode(businessId, short),
    });
    if (error?.code === "23505" && attempt === 0) continue;
    if (error) return refusal(error);
    const expires = Date.parse(data);
    if (Number.isNaN(expires)) {
      console.error("issuing a punch code failed", "no expiry came back");
      return { ok: false, failure: "failed" };
    }
    return {
      ok: true,
      value: {
        code,
        short,
        expiresAt: new Date(expires).toISOString(),
        now: new Date(expires - PUNCH_CODE_TTL_SECONDS * 1000).toISOString(),
      },
    };
  }
}

type PunchArgs = Database["public"]["Functions"]["clock_in"]["Args"];

const punchRpc = (direction: "in" | "out", args: PunchArgs) =>
  direction === "in"
    ? createAdminClient().rpc("clock_in", args)
    : createAdminClient().rpc("clock_out", args);

/** A punch that went through: the entry, and how the database recorded the time. */
export type Punched = {
  id: string;
  /** Null when it couldn't be read back; the punch stands all the same. */
  proof: EntryProof | null;
};

const isEntryProof = (value: unknown): value is EntryProof =>
  (ENTRY_PROOFS as readonly unknown[]).includes(value);

/**
 * How the database recorded the time just punched. It can differ from the
 * proof sent: with codes switched off since the page loaded, a press "without
 * a code" is recorded as 'off', and nobody needs to approve it.
 */
async function recordedProof(
  direction: "in" | "out",
  entryId: string,
): Promise<EntryProof | null> {
  const { data, error } = await createAdminClient()
    .from("time_entries")
    .select("in_proof, out_proof")
    .eq("id", entryId)
    .maybeSingle();
  if (error) console.error("reading a punch's proof failed", error.message);
  const proof = direction === "in" ? data?.in_proof : data?.out_proof;
  return isEntryProof(proof) ? proof : null;
}

/**
 * `actorId` clocks in or out of their open entry with a proof, and gets the
 * entry's id with the proof the database recorded. Typed digits are counted
 * first, in their own call (note_punch_attempt), so guesses sent at once all
 * meet the limit; someone blocked gets `codeLocked` without trying.
 */
export async function punch(
  direction: "in" | "out",
  actorId: string,
  businessId: string,
  proof: PunchProof,
): Promise<ClockResult<Punched>> {
  const punched = await punchOnce(direction, actorId, businessId, proof);
  if (!punched.ok) return punched;
  return {
    ok: true,
    value: {
      id: punched.value,
      proof: await recordedProof(direction, punched.value),
    },
  };
}

async function punchOnce(
  direction: "in" | "out",
  actorId: string,
  businessId: string,
  proof: PunchProof,
): Promise<ClockResult<string>> {
  const args = { actor: actorId, business: businessId };
  switch (proof.kind) {
    case "plain":
      return call(() => punchRpc(direction, args));
    case "none":
      return call(() => punchRpc(direction, { ...args, without_code: true }));
    case "scan":
      return call(() =>
        punchRpc(direction, { ...args, code_hash: hashPunchCode(proof.code) }),
      );
    case "typed": {
      const short = hashShortCode(businessId, proof.digits);
      const counted = await call(() =>
        createAdminClient().rpc("note_punch_attempt", {
          ...args,
          short_hash: short,
        }),
      );
      if (!counted.ok) return counted;
      if (counted.value === true) return { ok: false, failure: "codeLocked" };
      return call(() => punchRpc(direction, { ...args, short_hash: short }));
    }
  }
}

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

/**
 * A manager adds an entry someone forgot to punch, with why (`note`, which the
 * database requires and logs). Returns its id.
 */
export const addTimeEntry = (
  actorId: string,
  businessId: string,
  personId: string,
  times: { clockIn: string; clockOut: string; note: string },
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

/**
 * A manager changes an entry's times (a null end leaves it open), with why
 * (`note`, which the database requires, keeps on the entry and logs).
 */
export const correctTimeEntry = (
  actorId: string,
  entryId: string,
  times: { clockIn: string; clockOut: string | null; note: string },
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
 * Whoever edits the clock cancels a shift entered by mistake, with why
 * (`note`, which the database requires, keeps on the entry and logs as
 * `clock.cancel`): it stays, marked with who, when and why, and counts
 * nowhere. One still open is ended by it, so the person can clock in again.
 * Their own shift only an owner cancels.
 */
export const cancelTimeEntry = (
  actorId: string,
  entryId: string,
  note: string,
) =>
  call(() =>
    createAdminClient().rpc("cancel_time_entry", {
      actor: actorId,
      entry: entryId,
      note,
    }),
  );

/**
 * Whoever edits the clock brings a cancelled shift back as it was, with no
 * reason (logged as `clock.restore`); one the cancel ended opens again. A live
 * shift of the same person over those hours refuses it (`times`).
 */
export const restoreTimeEntry = (actorId: string, entryId: string) =>
  call(() =>
    createAdminClient().rpc("restore_time_entry", {
      actor: actorId,
      entry: entryId,
    }),
  );

/**
 * Whoever edits the clock adds a break the shift is missing, with why (`note`,
 * which the database requires, keeps on the shift and logs as
 * `clock.break_edit`): paid or not by the business's setting now. Its times
 * must be inside the shift and over (`breakOutside`, `breakTimes`), clear of
 * its other breaks (`breakOverlap`). Their own shift only an owner edits.
 * Returns the new break's id.
 */
export const addTimeBreak = (
  actorId: string,
  entryId: string,
  times: { start: string; end: string; note: string },
) =>
  call(() =>
    createAdminClient().rpc("add_time_break", {
      actor: actorId,
      entry: entryId,
      new_start: times.start,
      new_end: times.end,
      note: times.note,
    }),
  );

/**
 * Whoever edits the clock changes the times of a break that ended, with why,
 * as `addTimeBreak`; it stays paid or not as it was. A break still running is
 * refused (`breakOpen`), and one removed meanwhile (`breakGone`).
 */
export const changeTimeBreak = (
  actorId: string,
  breakId: string,
  times: { start: string; end: string; note: string },
) =>
  call(() =>
    createAdminClient().rpc("change_time_break", {
      actor: actorId,
      time_break: breakId,
      new_start: times.start,
      new_end: times.end,
      note: times.note,
    }),
  );

/**
 * Whoever edits the clock removes a break that ended, with why: it is marked
 * removed and keeps its times, and counts nowhere. Refused as
 * `changeTimeBreak`.
 */
export const removeTimeBreak = (
  actorId: string,
  breakId: string,
  note: string,
) =>
  call(() =>
    createAdminClient().rpc("remove_time_break", {
      actor: actorId,
      time_break: breakId,
      note,
    }),
  );

/**
 * Whoever removed a break takes it back, within ten minutes and with no
 * reason (`tooLate` after, or for anyone else; `notRemoved` when it is back
 * already), while it still fits its shift beside the live breaks.
 */
export const restoreTimeBreak = (actorId: string, breakId: string) =>
  call(() =>
    createAdminClient().rpc("restore_time_break", {
      actor: actorId,
      time_break: breakId,
    }),
  );

/**
 * A manager confirms an entry made without a code, or an owner one someone
 * set for themselves: what waits on it, up to now. Logged as `clock.confirm`.
 */
export const confirmTimeEntry = (actorId: string, entryId: string) =>
  call(() =>
    createAdminClient().rpc("confirm_time_entry", {
      actor: actorId,
      entry: entryId,
    }),
  );

export type ClockPerson = {
  userId: string;
  name: string | null;
  active: boolean;
  /** On the staff now: an accountant isn't, and punches no new hours. */
  staff: boolean;
};

/**
 * Everyone who is or was in the business, for the hours of the month: someone
 * who has left still has hours to pay, and so does someone who worked here and
 * came back as an accountant. Each caller decides who to list by `staff`.
 */
export async function getClockPeople(
  businessId: string,
): Promise<ClockPerson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, active, profiles (full_name)")
    .eq("business_id", businessId);
  if (error) throw error;
  return data.map((row) => ({
    userId: row.user_id,
    name: row.profiles?.full_name?.trim() || null,
    active: row.active,
    staff: isStaff(row.role),
  }));
}

const ENTRY_COLUMNS =
  "id, user_id, clock_in, clock_out, source, in_proof, out_proof, confirmed_at, note, edited_by, edited_at, created_at, restored_at, time_breaks (id, started_at, ended_at, unpaid, removed_at)";

/** The same, with who cancelled it, when and why (cancelled shifts only). */
const CANCELLED_COLUMNS =
  "id, user_id, clock_in, clock_out, source, in_proof, out_proof, confirmed_at, note, edited_by, edited_at, created_at, restored_at, time_breaks (id, started_at, ended_at, unpaid, removed_at), cancelled_at, cancelled_by, cancel_reason, cancelled_open";

type EntryRow = {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  source: string;
  in_proof: string | null;
  out_proof: string | null;
  confirmed_at: string | null;
  note: string | null;
  edited_by: string | null;
  edited_at: string | null;
  created_at: string;
  restored_at: string | null;
  time_breaks: {
    id: string;
    started_at: string;
    ended_at: string | null;
    unpaid: boolean;
    removed_at: string | null;
  }[];
};

/**
 * A row as an entry. A removed break (`removed_at`, 20261117000300_break_edits.sql)
 * is kept in the database as the record of what was removed and counts
 * nowhere, so it is left out here, before any sum or list sees it.
 */
export function entryOf(row: EntryRow): TimeEntry {
  return timeEntry.parse({
    id: row.id,
    userId: row.user_id,
    clockIn: row.clock_in,
    clockOut: row.clock_out,
    source: row.source,
    inProof: row.in_proof,
    outProof: row.out_proof,
    confirmedAt: row.confirmed_at,
    note: row.note,
    editedBy: row.edited_by,
    editedAt: row.edited_at,
    createdAt: row.created_at,
    restoredAt: row.restored_at,
    breaks: row.time_breaks
      .filter((pause) => pause.removed_at === null)
      .map((pause) => ({
        id: pause.id,
        startedAt: pause.started_at,
        endedAt: pause.ended_at,
        unpaid: pause.unpaid,
      })),
  });
}

/**
 * A business's entries that start in [from, to) with their breaks, as the
 * signed-in person may read them (RLS: their own; managers, owners and
 * `clock.edit` the business's), oldest first. Open entries that started earlier
 * are included, so "at work now" sees a night shift from yesterday. With
 * `userId`, that person's only. Read page by page (`allPages`): payroll reads
 * a whole business over four months, past PostgREST's 1000 rows.
 *
 * Live shifts only: a cancelled one (`cancelled_at`,
 * 20261117000200_cancelled_shifts.sql) counts nowhere, so every sum, the
 * hours engine, pay, the file and who is at work are right without asking.
 * The few screens that show cancelled shifts read them apart
 * (`getCancelledEntries`). A cancelled shift always has an end, so the open
 * ones read here are all live.
 */
export async function getTimeEntries(
  businessId: string,
  from: Date,
  to: Date,
  userId?: string,
): Promise<TimeEntry[]> {
  const supabase = await createClient();
  const rows = await allPages((first, last) => {
    let query = supabase
      .from("time_entries")
      .select(ENTRY_COLUMNS)
      .eq("business_id", businessId)
      .is("cancelled_at", null)
      .lt("clock_in", to.toISOString())
      .or(`clock_in.gte.${from.toISOString()},clock_out.is.null`);
    if (userId) query = query.eq("user_id", userId);
    // `id` breaks ties, so no row falls between two pages.
    return query.order("clock_in").order("id").range(first, last);
  });
  return rows.map(entryOf);
}

/**
 * One of a business's shifts with its live breaks, as the signed-in person
 * may read it (RLS, as `getTimeEntries`), cancelled or not; null when there is
 * none they may read. What a break's typed times are read against.
 */
export async function getTimeEntry(
  businessId: string,
  entryId: string,
): Promise<TimeEntry | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .select(ENTRY_COLUMNS)
    .eq("business_id", businessId)
    .eq("id", entryId)
    .maybeSingle();
  if (error) throw error;
  return data ? entryOf(data) : null;
}

/**
 * Entries with a time still to confirm that started since `since`, as the
 * signed-in person may read them (RLS: the business's for managers), oldest
 * first. Reads through time_entries_to_confirm_idx. Live shifts only: a
 * cancelled one waits for nobody (its clock.confirm line settles with it).
 */
export async function getEntriesToConfirm(
  businessId: string,
  since: Date,
): Promise<TimeEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("time_entries")
    .select(ENTRY_COLUMNS)
    .eq("business_id", businessId)
    .is("cancelled_at", null)
    .gte("clock_in", since.toISOString())
    .or("in_proof.in.(none,self),out_proof.in.(none,self)")
    .order("clock_in");
  if (error) throw error;
  return data.map(entryOf).filter((entry) => entryToConfirm(entry) !== null);
}

type CancelledRow = EntryRow & {
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  cancelled_open: boolean;
};

/**
 * A business's cancelled shifts that start in [from, to), as the signed-in
 * person may read them (RLS, as `getTimeEntries`: their own; whoever edits
 * the clock or holds pay, the business's), oldest first, each with who
 * cancelled it, when and why. With `userId`, that person's only. For the few
 * screens that show them as cancelled; they count nowhere. A cancelled shift
 * always has an end (the cancel ends one still open, `wasOpen`).
 */
export async function getCancelledEntries(
  businessId: string,
  from: Date,
  to: Date,
  userId?: string,
): Promise<CancelledEntry[]> {
  const supabase = await createClient();
  const rows = await allPages<CancelledRow>((first, last) => {
    let query = supabase
      .from("time_entries")
      .select(CANCELLED_COLUMNS)
      .eq("business_id", businessId)
      .not("cancelled_at", "is", null)
      .gte("clock_in", from.toISOString())
      .lt("clock_in", to.toISOString());
    if (userId) query = query.eq("user_id", userId);
    return query.order("clock_in").order("id").range(first, last);
  });
  return rows.flatMap((row) =>
    row.cancelled_at === null || row.cancel_reason === null
      ? []
      : [
          cancelledEntry.parse({
            entry: entryOf(row),
            cancelledAt: row.cancelled_at,
            cancelledBy: row.cancelled_by,
            reason: row.cancel_reason,
            wasOpen: row.cancelled_open,
          }),
        ],
  );
}
