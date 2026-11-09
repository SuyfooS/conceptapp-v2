import "server-only";
import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";
import { type PunchProof, padShortCode } from "@domain/punch-code-format";
import {
  type ClockFailure,
  clockFailureOf,
  ENTRY_PROOFS,
  type EntryProof,
  entryToConfirm,
  PUNCH_CODE_TTL_SECONDS,
  type TimeEntry,
  timeEntry,
} from "@domain/time-clock";
import type { Database } from "./database.types";
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

type RpcError = { code?: string; message: string };

/** A refusal as the screen says it. Only the message is logged: it holds no hash. */
function refusal(error: RpcError): { ok: false; failure: ClockFailure } {
  const failure = clockFailureOf(error.code, error.message);
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
};

/**
 * Everyone who is or was in the business, for the hours of the month: someone
 * who has left still has hours to pay.
 */
export async function getClockPeople(
  businessId: string,
): Promise<ClockPerson[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, active, profiles (full_name)")
    .eq("business_id", businessId);
  if (error) throw error;
  return data.map((row) => ({
    userId: row.user_id,
    name: row.profiles?.full_name?.trim() || null,
    active: row.active,
  }));
}

const ENTRY_COLUMNS =
  "id, user_id, clock_in, clock_out, source, in_proof, out_proof, confirmed_at, note, edited_by, edited_at, created_at, time_breaks (id, started_at, ended_at, unpaid)";

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
  time_breaks: {
    id: string;
    started_at: string;
    ended_at: string | null;
    unpaid: boolean;
  }[];
};

function entryOf(row: EntryRow): TimeEntry {
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
    breaks: row.time_breaks.map((pause) => ({
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
    .select(ENTRY_COLUMNS)
    .eq("business_id", businessId)
    .lt("clock_in", to.toISOString())
    .or(`clock_in.gte.${from.toISOString()},clock_out.is.null`)
    .order("clock_in");
  const { data, error } = await (userId ? query.eq("user_id", userId) : query);
  if (error) throw error;
  return data.map(entryOf);
}

/**
 * Entries with a time still to confirm that started since `since`, as the
 * signed-in person may read them (RLS: the business's for managers), oldest
 * first. Reads through time_entries_to_confirm_idx.
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
    .gte("clock_in", since.toISOString())
    .or("in_proof.in.(none,self),out_proof.in.(none,self)")
    .order("clock_in");
  if (error) throw error;
  return data.map(entryOf).filter((entry) => entryToConfirm(entry) !== null);
}
