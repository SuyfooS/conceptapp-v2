import { isMissingFunction } from "./missing";

/*
 * Why a write to the orders was refused, from what the database said
 * (supabase/migrations/20261120000300_order_taking_orders.sql, its errors
 * table in the header; the close's "ביטול" in 20261122000100, with the
 * same codes and hints), for the screens' words. Kept apart from @db/orders,
 * which is server only, so it is tested on its own.
 */

/** Why a write was refused. */
export type OrderFailure =
  /** An order, a line, a ticket or a place the business doesn't have, or not theirs (P0002). */
  | "gone"
  /** Taking orders is off for the business (42501, hint 'off'). */
  | "off"
  /** Not theirs to do (42501). */
  | "noAccess"
  /** Off a shift (42501, hint 'clock'). */
  | "clock"
  /** A shift left open more than 16 hours (42501, hint 'stale_shift'). */
  | "staleShift"
  /** Only the sender takes a line back (42501, hint 'sender'). */
  | "sender"
  /** The sender is on the staff of the department: cancel it with a reason (42501, hint 'own_department'). */
  | "ownDepartment"
  /** A line already ready: those who run orders cancel it (42501, hint 'ready'). */
  | "managersOnly"
  /** A shape the database won't keep (22023). */
  | "invalid"
  /** Items sold out, removed or not the business's (22023, hint 'unavailable'). */
  | "unavailable"
  /** Items that go to no live department (22023, hint 'route'). */
  | "route"
  /** Choices that don't fit the item (22023, hint 'choices'). */
  | "choices"
  /** A unit price over the most (22023, hint 'price'). */
  | "price"
  /** An allergy with no note (22023, hint 'allergy'). */
  | "allergy"
  /** A place that was removed (22023, hint 'place'). */
  | "place"
  /** The place has an open order (23505, hint 'taken'). */
  | "taken"
  /** The round's key is another sender's or business's (23505, hint 'key'). */
  | "key"
  /** The round was sent with other lines (23505, hint 'body'). */
  | "body"
  /** The order is no longer open (55000, hint 'closed'). */
  | "closed"
  /** The order moved to another place (55000, hint 'moved'). */
  | "moved"
  /** A held block waits to be called (55000, hint 'held'). */
  | "held"
  /**
   * The time for it passed (55000, hint 'window'); for the close's "ביטול",
   * also another's close.
   */
  | "window"
  /** Someone already marked it ready (55000, hint 'prepared'). */
  | "prepared"
  /** The line was taken back (55000, hint 'taken_back'). */
  | "takenBack"
  /** The line was cancelled (55000, hint 'cancelled'). */
  | "cancelled"
  /** The line is on the house (55000, hint 'comped'). */
  | "comped"
  /** The ticket was served (55000, hint 'served'). */
  | "served"
  /** Its business day is over (55000, hint 'day'). */
  | "day"
  /** Not for a takeaway, or only for one (55000, hint 'takeaway'). */
  | "takeaway"
  /** A cancelled order stays cancelled (55000, hint 'not_closed'). */
  | "notClosed"
  /** Past a cap: lines in a round, a demo's rounds in an hour (54000). */
  | "tooMany"
  /** The migration isn't on this project yet. */
  | "notYet"
  | "failed";

/** What the database says when it refuses, as supabase-js passes it on. */
export type DatabaseRefusal = {
  code?: string;
  message: string;
  hint?: string | null;
  details?: string | null;
};

const BY_HINT: Record<string, Record<string, OrderFailure>> = {
  "42501": {
    off: "off",
    clock: "clock",
    stale_shift: "staleShift",
    sender: "sender",
    own_department: "ownDepartment",
    ready: "managersOnly",
  },
  "22023": {
    unavailable: "unavailable",
    route: "route",
    choices: "choices",
    price: "price",
    allergy: "allergy",
    place: "place",
  },
  "23505": { taken: "taken", key: "key", body: "body" },
  "55000": {
    closed: "closed",
    moved: "moved",
    held: "held",
    window: "window",
    prepared: "prepared",
    taken_back: "takenBack",
    cancelled: "cancelled",
    comped: "comped",
    served: "served",
    day: "day",
    takeaway: "takeaway",
    not_closed: "notClosed",
  },
};

/** What a code means when its hint says nothing more. */
const BY_CODE: Record<string, OrderFailure> = {
  P0002: "gone",
  "42501": "noAccess",
  "22023": "invalid",
  // A round's key taken by a send at the same moment, in another business.
  "23505": "key",
  "54000": "tooMany",
  "55000": "closed",
};

/**
 * The failure a refusal means, by its code and its hint. A missing function
 * is "notYet", so a write that ships before its migration says orders aren't
 * ready yet. `what` names the write in the server's log when nothing else
 * fits, never what was written.
 */
export function orderFailureOf(
  error: DatabaseRefusal,
  what = "an order write",
): OrderFailure {
  if (isMissingFunction(error)) return "notYet";
  const code = error.code ?? "";
  const byHint = error.hint ? BY_HINT[code]?.[error.hint] : undefined;
  if (byHint) return byHint;
  const byCode = BY_CODE[code];
  if (byCode) return byCode;
  console.error(`${what} failed`, error.message);
  return "failed";
}

/** The ids a refusal names in its detail, a JSON list of them. */
function idsIn(details: string | null | undefined): string[] {
  if (!details) return [];
  try {
    const parsed: unknown = JSON.parse(details);
    return Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}

/**
 * The items a send was refused for (22023, hint 'unavailable' or 'route'),
 * all of them, so the draft can say which; none for any other refusal.
 */
export function refusedItems(error: DatabaseRefusal): string[] {
  return error.code === "22023" &&
    (error.hint === "unavailable" || error.hint === "route")
    ? idsIn(error.details)
    : [];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The open order that holds a place (23505, hint 'taken'), or null. */
export function takenOrder(error: DatabaseRefusal): string | null {
  if (error.code !== "23505" || error.hint !== "taken") return null;
  const id = error.details?.trim() ?? "";
  return UUID.test(id) ? id : null;
}
