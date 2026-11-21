import "server-only";
import { type LockFailure, MAX_STATIONS } from "@domain/clock-station";
import {
  type OrderStationRefusal,
  type StationMenu,
  type StationPrep,
  type StationTill,
  type StationWriteFailure,
  stationMenuSchema,
  stationPrepSchema,
  stationTillSchema,
} from "@domain/order-stations";
import { shortNames } from "@domain/people";
import type { Wording } from "@domain/wording";
import type { z } from "zod";
import {
  countRunningStations,
  hashStationToken,
  lockRefusal,
  pairThenApprove,
  type StationResult,
} from "./clock-stations";
import { memberNames, nameIn } from "./member-names";
import { isMissingColumn } from "./missing";
import type { DatabaseRefusal } from "./order-failures";
import {
  orderStationFailureOf,
  orderStationItemFailureOf,
  orderStationRefusalOf,
} from "./order-station-failures";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";
import { getWordingForTeam } from "./wording";

/*
 * The kitchen's screens and the till (waiter mode P8a,
 * 20261124000100_order_taking_stations.sql): stations of the clock's one
 * registry that show orders. Locking runs with the secret key for `actorId`,
 * whom callers check is the signed-in person, not viewing, who runs orders.
 * A station has nobody signed in, so its reads and writes go by its secret
 * (its cookie's, hashed here and never logged) with the secret key; the
 * database decides each as it decides a person's. Every answer is parsed
 * before it reaches a screen, strictly, so no price, label or person
 * reaches one it isn't for. The list of screens reads under the person's
 * own session (RLS: those who run orders).
 */

/** What locks a device as an order station: its name, what it shows and a kitchen's department. */
export type OrderStationLock = {
  name: string;
  shows: "prep" | "till";
  /** A kitchen's screen's department; null for every one, and for a till. */
  department: string | null;
};

/**
 * Whoever runs orders makes the device they are on the business's kitchen's
 * screen or its till, and gets its secret, for the device's cookie: as the
 * clock's lock (@db/clock-stations' `lockStation`), the server pairs and
 * approves at once (`public.lock_order_station`). Ten running of every kind
 * refuse it before any pairing starts.
 */
export async function lockOrderStation(
  actorId: string,
  businessId: string,
  lock: OrderStationLock,
): Promise<StationResult<{ token: string; stationId: string }, LockFailure>> {
  const running = await countRunningStations(businessId);
  if (!running.ok) return lockRefusal(running.error);
  if (running.count >= MAX_STATIONS) {
    return { ok: false, failure: "tooManyStations" };
  }
  return pairThenApprove(businessId, async (pairing) => {
    const { data, error } = await createAdminClient().rpc(
      "lock_order_station",
      {
        actor: actorId,
        business: businessId,
        station_name: lock.name,
        station_shows: lock.shows,
        ...(lock.department ? { station_department: lock.department } : {}),
        pairing,
      },
    );
    return { data, error };
  });
}

/** A station's read: its answer, "same" when nothing moved, or why it shows none. */
export type StationRead<T> =
  | { ok: true; value: T | "same" }
  | { ok: false; failure: OrderStationRefusal };

/** A station's write: done, or why not. */
export type StationWritten =
  | { ok: true }
  | { ok: false; failure: StationWriteFailure };

/** Only the error's message is logged, never a hash. */
function readRefused<T>(error: DatabaseRefusal, what: string): StationRead<T> {
  const failure = orderStationRefusalOf(error);
  if (failure) return { ok: false, failure };
  console.error(`reading ${what} failed`, error.message);
  return { ok: false, failure: "failed" };
}

function answerOf<T>(
  schema: z.ZodType<T>,
  data: unknown,
  what: string,
): StationRead<T> {
  if (data === null) return { ok: true, value: "same" };
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error(`reading ${what} failed`, parsed.error.message);
    return { ok: false, failure: "failed" };
  }
  return { ok: true, value: parsed.data };
}

const knownOf = (known?: number | null) =>
  known === undefined || known === null ? {} : { known_version: known };

/**
 * A kitchen's screen's tickets (`public.station_order_prep`), of its
 * department or every one, with no price: "same" when the orders' version is
 * still `known`. It marks the new ones it shows as seen.
 */
export async function stationOrderPrep(
  token: string,
  known?: number | null,
): Promise<StationRead<StationPrep>> {
  const { data, error } = await createAdminClient().rpc("station_order_prep", {
    station_hash: hashStationToken(token),
    ...knownOf(known),
  });
  if (error) return readRefused(error, "a kitchen's screen");
  return answerOf(stationPrepSchema, data, "a kitchen's screen");
}

/** What a kitchen's screen marks sold out (`public.station_order_menu`), no price. */
export async function stationOrderMenu(
  token: string,
  known?: number | null,
): Promise<StationRead<StationMenu>> {
  const { data, error } = await createAdminClient().rpc("station_order_menu", {
    station_hash: hashStationToken(token),
    ...knownOf(known),
  });
  if (error) return readRefused(error, "a kitchen's screen's menu");
  return answerOf(stationMenuSchema, data, "a kitchen's screen's menu");
}

/** The till's orders (`public.station_order_till`): no label, no person, no total. */
export async function stationOrderTill(
  token: string,
  known?: number | null,
): Promise<StationRead<StationTill>> {
  const { data, error } = await createAdminClient().rpc("station_order_till", {
    station_hash: hashStationToken(token),
    ...knownOf(known),
  });
  if (error) return readRefused(error, "the till");
  return answerOf(stationTillSchema, data, "the till");
}

const written = (
  error: DatabaseRefusal | null,
  what: string,
): StationWritten =>
  error
    ? { ok: false, failure: orderStationFailureOf(error, what) }
    : { ok: true };

/** A kitchen's screen marks a ticket ready, or back (`public.station_set_ticket_ready`). */
export async function stationSetTicketReady(
  token: string,
  ticketId: string,
  ready: boolean,
): Promise<StationWritten> {
  const { error } = await createAdminClient().rpc("station_set_ticket_ready", {
    station_hash: hashStationToken(token),
    ticket: ticketId,
    ready,
  });
  return written(error, "a station's ready");
}

/**
 * A kitchen's screen marks an item sold out, or back
 * (`public.station_set_item_available`), refused in an item's words
 * (`orderStationItemFailureOf`).
 */
export async function stationSetItemAvailable(
  token: string,
  itemId: string,
  available: boolean,
): Promise<StationWritten> {
  const { error } = await createAdminClient().rpc(
    "station_set_item_available",
    {
      station_hash: hashStationToken(token),
      item: itemId,
      is_available: available,
    },
  );
  return error
    ? {
        ok: false,
        failure: orderStationItemFailureOf(error, "a station's sold out"),
      }
    : { ok: true };
}

/** The till closes an order (`public.station_close_order`). */
export async function stationCloseOrder(
  token: string,
  orderId: string,
): Promise<StationWritten> {
  const { error } = await createAdminClient().rpc("station_close_order", {
    station_hash: hashStationToken(token),
    order_ref: orderId,
  });
  return written(error, "a station's close");
}

/** The till opens an order again (`public.station_reopen_order`). */
export async function stationReopenOrder(
  token: string,
  orderId: string,
): Promise<StationWritten> {
  const { error } = await createAdminClient().rpc("station_reopen_order", {
    station_hash: hashStationToken(token),
    order_ref: orderId,
  });
  return written(error, "a station's reopen");
}

/** The till takes its own close back (`public.station_undo_close_order`). */
export async function stationUndoCloseOrder(
  token: string,
  orderId: string,
): Promise<StationWritten> {
  const { error } = await createAdminClient().rpc("station_undo_close_order", {
    station_hash: hashStationToken(token),
    order_ref: orderId,
  });
  return written(error, "a station's undo of a close");
}

/**
 * The names a kitchen's screen shows for the people of `ids` (the senders on
 * its tickets), by the business's names for them, short (`shortNames` over
 * the whole team, so two who share a first name keep their full ones): with
 * the secret key, since a station has nobody signed in. Only the asked ids
 * come back, in lower case. Nothing for none.
 */
export async function getStationPeople(
  businessId: string,
  ids: readonly string[],
): Promise<Record<string, string>> {
  const asked = new Set(ids.map((id) => id.toLowerCase()));
  if (asked.size === 0) return {};
  const admin = createAdminClient();
  const [members, names] = await Promise.all([
    admin
      .from("memberships")
      .select("user_id, profiles (full_name)")
      .eq("business_id", businessId),
    memberNames(admin, businessId),
  ]);
  if (members.error) throw members.error;
  const people = (members.data ?? []).map((row) => ({
    id: row.user_id.toLowerCase(),
    name: nameIn(names, row.user_id, row.profiles?.full_name) ?? "",
  }));
  const short = shortNames(people.map((person) => person.name));
  return Object.fromEntries(
    people.flatMap((person, at): [string, string][] =>
      person.name && asked.has(person.id)
        ? [[person.id, short[at] ?? person.name]]
        : [],
    ),
  );
}

/**
 * A station's business's own sentences and its template's, as Home's are
 * read (`wordingFrom`), with the secret key: a station has nobody signed in
 * to read them under RLS. The app's own words when they can't be read.
 */
export async function getStationWording(
  businessId: string,
): Promise<{ template: Wording; business: Wording }> {
  try {
    const stored = await getWordingForTeam(businessId);
    const sentences = (rows: { key: string; sentence: string }[]) =>
      Object.fromEntries(rows.map((row) => [row.key, row.sentence]));
    return {
      template: sentences(stored.template),
      business: sentences(stored.business),
    };
  } catch (error) {
    console.error(
      "reading a station's wording failed",
      (error as Error).message,
    );
    return { template: {}, business: {} };
  }
}

/**
 * A kitchen's screen's department, by its name, for the gate drawn before
 * anything is read: with the secret key, as the station has nobody signed
 * in. Removed ones too: the screen says so once it reads. Null for none.
 */
export async function getStationDepartment(
  businessId: string,
  departmentId: string,
): Promise<{ id: string; name: string } | null> {
  const { data, error } = await createAdminClient()
    .from("departments")
    .select("id, name")
    .eq("business_id", businessId)
    .eq("id", departmentId)
    .maybeSingle();
  if (error) {
    console.error("reading a station's department failed", error.message);
    return null;
  }
  return data ? { id: data.id, name: data.name } : null;
}

/** A kitchen's screen or a till running, as the list of screens shows it. */
export type RunningOrderStation = {
  id: string;
  name: string;
  shows: "prep" | "till";
  /** A kitchen's screen's department; null for every one. */
  departmentId: string | null;
  createdAt: string;
  lastSeenAt: string | null;
  lastAction: string | null;
  lastActionAt: string | null;
};

/**
 * A business's running kitchen's screens and tills, oldest first, as the
 * signed-in person may read them (RLS: whoever runs orders, with taking
 * orders on). None before the migration reaches a project.
 */
export async function getRunningOrderStations(
  businessId: string,
): Promise<RunningOrderStation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clock_stations")
    .select(
      "id, name, shows, department_id, created_at, last_seen_at, last_action, last_action_at",
    )
    .eq("business_id", businessId)
    .in("shows", ["prep", "till"])
    .is("stopped_at", null)
    .order("created_at");
  if (error && isMissingColumn(error)) return [];
  if (error) throw error;
  return (data ?? []).flatMap((row): RunningOrderStation[] =>
    row.shows === "prep" || row.shows === "till"
      ? [
          {
            id: row.id,
            name: row.name,
            shows: row.shows,
            departmentId: row.department_id,
            createdAt: row.created_at,
            lastSeenAt: row.last_seen_at,
            lastAction: row.last_action,
            lastActionAt: row.last_action_at,
          },
        ]
      : [],
  );
}
