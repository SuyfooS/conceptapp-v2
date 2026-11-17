import "server-only";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  type LockFailure,
  lockFailureOf,
  MAX_STATIONS,
  type StationRefusal,
  type StationStopFailure,
  stationCodeFailureOf,
  stationStopFailureOf,
} from "@domain/clock-station";
import { PUNCH_CODE_TTL_SECONDS } from "@domain/time-clock";
import { z } from "zod";
import { punchKey } from "./punch-key";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import {
  hashPunchCode,
  hashShortCode,
  type IssuedPunchCode,
  newPunchCode,
  newShortCode,
} from "./time-clock";

/*
 * Clock stations (20261108000200_qr_clock.sql; #78 phase 5). A station is
 * known by its secret, which only the device holds (its cookie) and the
 * database keeps as a hash. Writes and reads by secret run with the secret
 * key: a station has nobody signed in. The database checks who stops one
 * again (`actorId`); callers make sure the actor is the signed-in person and
 * not viewing as someone else.
 */

export type StationResult<T, F extends string> =
  | { ok: true; value: T }
  | { ok: false; failure: F };

/** A station's secret: 32 random bytes, base64url, 43 characters. */
export function newStationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database stores for a station's secret: its SHA-256 in hex. */
export function hashStationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** The hash of 32 random bytes nobody keeps. */
const unkeptHash = () =>
  createHash("sha256").update(randomBytes(32)).digest("hex");

/** How many of a business's locks can be pairing at once (`lockPairingHash`). */
export const LOCK_PAIRING_SLOTS = 3;

/**
 * The pairings a business's locks go through: a few hashes of its own (`slot`
 * 0 to 2), each an HMAC with the server's key, so nobody else can make them.
 * The table of devices pairing is shared by every business and refuses
 * everyone once it holds a thousand (start_station_pairing); a pairing the
 * database then refuses to approve stays in it for its five minutes, and
 * nothing here can delete it. On its own few hashes, a business's locks leave
 * at most three such rows however often they are repeated, so no business
 * fills the table for the others. A lock whose slot is taken (23505: another
 * lock pairing now, or one left over) takes the next; with all three taken it
 * is refused as `busy`, until the leftovers' five minutes are up.
 */
export function lockPairingHash(
  businessId: string,
  slot: number,
  key: Buffer = punchKey(),
): string {
  return createHmac("sha256", key)
    .update(`station-lock:${businessId}:${slot}`, "utf8")
    .digest("hex");
}

/**
 * Whoever edits the clock makes the device they are on a station of their
 * business, named `name`, and gets its secret, for the device's cookie. The
 * database's pairing is for a device that asks on its own and is approved
 * from a phone: here the same server asks and approves at once, so its QR
 * and digits are never shown (the digits' hash is of bytes nobody keeps; the
 * pairing is one of the business's own, `lockPairingHash`). Ten running
 * refuse it before any pairing starts (`tooManyStations`), as the caller's
 * checks refuse what the database would (who edits the clock, where codes may
 * show on a station, the name, control characters included), so a refused
 * lock almost never leaves a pairing behind: only when something changes
 * between those checks and the approval (ten running reached meanwhile, the
 * person's role, where codes show), which the database then refuses
 * (`tooManyStations`, `noAccess`, `managerOnly`).
 */
export async function lockStation(
  actorId: string,
  businessId: string,
  name: string,
): Promise<StationResult<{ token: string; stationId: string }, LockFailure>> {
  const admin = createAdminClient();
  const running = await admin
    .from("clock_stations")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .is("stopped_at", null);
  if (running.error) return lockRefusal(running.error);
  if ((running.count ?? 0) >= MAX_STATIONS) {
    return { ok: false, failure: "tooManyStations" };
  }

  const token = newStationToken();
  for (let slot = 0; ; slot += 1) {
    const pairing = lockPairingHash(businessId, slot);
    const started = await admin.rpc("start_station_pairing", {
      pairing_hash: pairing,
      short_hash: unkeptHash(),
      token_hash: hashStationToken(token),
    });
    if (started.error?.code === "23505") {
      if (slot < LOCK_PAIRING_SLOTS - 1) continue;
      return { ok: false, failure: "busy" };
    }
    if (started.error) return lockRefusal(started.error);
    const { data, error } = await admin.rpc("approve_station_pairing", {
      actor: actorId,
      business: businessId,
      name,
      pairing_hash: pairing,
    });
    if (error) return lockRefusal(error);
    return { ok: true, value: { token, stationId: data } };
  }
}

type RpcError = { code?: string; message: string };

/** Only the message is logged: it holds no hash. */
function lockRefusal(error: RpcError): { ok: false; failure: LockFailure } {
  const failure = lockFailureOf(error.code, error.message);
  if (failure === "failed")
    console.error("locking a station failed", error.message);
  return { ok: false, failure };
}

const stationRow = z.object({
  station: z.string(),
  name: z.string(),
  business: z.string(),
  businessName: z.string(),
  accent: z.string(),
  timeZone: z.string(),
  stopped: z.boolean(),
});

/** A station as its secret finds it, for its page. */
export type StationOfToken = {
  id: string;
  name: string;
  businessId: string;
  businessName: string;
  accent: string;
  timeZone: string;
  stopped: boolean;
};

/**
 * The station whose secret this is, stopped or not, or null for a secret that
 * is no station's (never one, or its business is gone).
 */
export async function stationByToken(
  token: string,
): Promise<StationOfToken | null> {
  const { data, error } = await createAdminClient().rpc("station_by_token", {
    token_hash: hashStationToken(token),
  });
  if (error) throw new Error(`reading a station failed: ${error.message}`);
  if (data === null) return null;
  const row = stationRow.parse(data);
  return {
    id: row.station,
    name: row.name,
    businessId: row.business,
    businessName: row.businessName,
    accent: row.accent,
    timeZone: row.timeZone,
    stopped: row.stopped,
  };
}

const issued = z.object({ expires: z.string() });

/**
 * A fresh code for the station whose secret this is, in `businessId` (its
 * business, which the digits' hash is made with, as a worker's typed digits
 * are), valid for `PUNCH_CODE_TTL_SECONDS`: the QR's code and its digits,
 * which the database keeps only as hashes. Stamped with the database's own
 * now(), as a manager's code is; the same digits live in the business already
 * (23505) get one retry with new values. The database marks the station seen.
 */
export async function issueStationCode(
  token: string,
  businessId: string,
): Promise<StationResult<IssuedPunchCode, StationRefusal>> {
  for (let attempt = 0; ; attempt += 1) {
    const code = newPunchCode();
    const short = newShortCode();
    const { data, error } = await createAdminClient().rpc(
      "issue_station_code",
      {
        token_hash: hashStationToken(token),
        code_hash: hashPunchCode(code),
        short_hash: hashShortCode(businessId, short),
      },
    );
    if (error?.code === "23505" && attempt === 0) continue;
    if (error) {
      const failure = stationCodeFailureOf(error.code, error.message);
      if (failure === "failed") {
        console.error("issuing a station's code failed", error.message);
      }
      return { ok: false, failure };
    }
    const expires = Date.parse(issued.safeParse(data).data?.expires ?? "");
    if (Number.isNaN(expires)) {
      console.error("issuing a station's code failed", "no expiry came back");
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

/**
 * Whoever edits the clock stops a station at once (its live codes go with it,
 * logged as `clock.station.stop`), or starts one stopped in the last two
 * minutes again (`clock.station.restart`, the toast's undo; `tooLate` after).
 * Either is nothing when the station is that way already.
 */
export async function setStationStopped(
  actorId: string,
  stationId: string,
  stopped: boolean,
): Promise<StationResult<undefined, StationStopFailure>> {
  const { error } = await createAdminClient().rpc("set_clock_station_stopped", {
    actor: actorId,
    station: stationId,
    stopped,
  });
  if (!error) return { ok: true, value: undefined };
  const failure = stationStopFailureOf(error.code);
  if (failure === "failed")
    console.error("stopping a station failed", error.message);
  return { ok: false, failure };
}

export type RunningStation = {
  id: string;
  name: string;
  createdAt: string;
  /** When it last fetched a code; null before its first. */
  lastSeenAt: string | null;
};

/**
 * A business's running stations, oldest first, as the signed-in person may
 * read them (RLS: whoever edits the clock, with the clock on; nobody else
 * reads any). Never their secrets: those columns aren't granted.
 */
export async function getRunningStations(
  businessId: string,
): Promise<RunningStation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clock_stations")
    .select("id, name, created_at, last_seen_at")
    .eq("business_id", businessId)
    .is("stopped_at", null)
    .order("created_at");
  if (error) throw error;
  return data.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    lastSeenAt: row.last_seen_at,
  }));
}
