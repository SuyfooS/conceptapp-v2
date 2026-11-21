import { z } from "zod";
import { MAX_UNIT_AGOROT } from "./order-taking";
import {
  ORDER_CANCEL_REASONS,
  ORDER_STATUSES,
  type OrderCancelReason,
  type OrderStatus,
  type PrepTicket,
  prepTicketSchema,
  type TillLine,
} from "./orders";
import { nextOrdersSyncDelay } from "./orders-sync";

/*
 * The kitchen's screens and the till (waiter mode P8a; the design's §4.1,
 * §4.4 to §4.10): a tablet locked from the prep screen, holding nobody's
 * account, on the clock station's one registry
 * (20261124000100_order_taking_stations.sql). It asks
 * `GET /station/tickets` at the prep screen's pace and writes through
 * `POST /station/write`, by its cookie's secret: what each is asked, what it
 * answers (strict, so a price, a label or a person that reached a station
 * fails to parse: a boundary), and the rules its screen times by. Pure.
 */

/** The routes (app/(station)/station/tickets, app/(station)/station/write). */
export const STATION_TICKETS_PATH = "/station/tickets";
export const STATION_WRITE_PATH = "/station/write";

/** The kinds of station that show orders. */
export const ORDER_STATION_KINDS = ["prep", "till"] as const;
export type OrderStationKind = (typeof ORDER_STATION_KINDS)[number];

const uuid = z.uuid();
const instant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Expected a time");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date");
const version = z.int().min(0);
const count = z.int().min(0);

// Asking

/** What the station knows already: its orders' version and its menu's, or null for none yet. */
export type StationKnown = { version: number | null; menu: number | null };

const knownNumber = z
  .string()
  .regex(/^\d{1,16}$/)
  .transform(Number)
  .pipe(z.int().min(0));

/**
 * The poll's query: `v` the orders' version the station has, `m` its menu's,
 * each absent before its first read. Null for anything else.
 */
export function readStationQuery(params: URLSearchParams): StationKnown | null {
  const keys = [...params.keys()];
  if (keys.some((key) => key !== "v" && key !== "m")) return null;
  if (params.getAll("v").length > 1 || params.getAll("m").length > 1) {
    return null;
  }
  const read = (key: "v" | "m") => {
    const raw = params.get(key);
    if (raw === null) return { ok: true as const, value: null };
    const parsed = knownNumber.safeParse(raw);
    return parsed.success
      ? { ok: true as const, value: parsed.data }
      : { ok: false as const };
  };
  const v = read("v");
  const m = read("m");
  if (!v.ok || !m.ok) return null;
  return { version: v.value, menu: m.value };
}

/** The poll's address for what the station knows. */
export function stationQueryHref(known: StationKnown): string {
  const params = new URLSearchParams();
  if (known.version !== null) params.set("v", String(known.version));
  if (known.menu !== null) params.set("m", String(known.menu));
  const query = params.toString();
  return query ? `${STATION_TICKETS_PATH}?${query}` : STATION_TICKETS_PATH;
}

// Reading

/** A department as a station names it, removed ones too. */
export type StationDepartment = { id: string; name: string; archived: boolean };

const stationDepartment = z.strictObject({
  id: uuid,
  name: z.string(),
  archived: z.boolean(),
}) satisfies z.ZodType<StationDepartment>;

/** A prep screen's tickets (`public.station_order_prep`): no price at all. */
export type StationPrep = {
  version: number;
  now: string;
  lateAfterMinutes: number;
  /** The screen's department; null for every department. */
  department: string | null;
  /** Its department was removed since it was locked. */
  departmentGone: boolean;
  departments: StationDepartment[];
  tickets: PrepTicket[];
};

export const stationPrepSchema = z.strictObject({
  version,
  now: instant,
  lateAfterMinutes: z.int().min(1).max(240),
  department: uuid.nullable(),
  departmentGone: z.boolean(),
  departments: z.array(stationDepartment),
  tickets: z.array(prepTicketSchema),
}) satisfies z.ZodType<StationPrep>;

/** An item a prep screen marks sold out: no price. */
export type StationMenuItem = {
  id: string;
  name: string;
  category: { id: string; name: string };
  available: boolean;
};

/** What a prep screen marks sold out (`public.station_order_menu`). */
export type StationMenu = { version: number; items: StationMenuItem[] };

export const stationMenuSchema = z.strictObject({
  version,
  items: z.array(
    z.strictObject({
      id: uuid,
      name: z.string(),
      category: z.strictObject({ id: uuid, name: z.string() }),
      available: z.boolean(),
    }),
  ),
}) satisfies z.ZodType<StationMenu>;

const tillLine = z.strictObject({
  name: z.string(),
  choices: z.array(z.string()),
  unitAgorot: z.int().min(0).max(MAX_UNIT_AGOROT),
  quantity: z.int().min(1),
  comped: z.boolean(),
}) satisfies z.ZodType<TillLine>;

/** An order as the till reads it: no label, no person, no total. */
export type StationTillOrder = {
  id: string;
  status: OrderStatus;
  place: { id: string; name: string } | null;
  takeaway: number | null;
  openedAt: string;
  reopenedAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelReason: OrderCancelReason | null;
  /** This till closed it. */
  closedHere: boolean;
  /** Held blocks with a live line, which refuse a close. */
  held: number;
  /** Tickets ready to serve. */
  ready: number;
  /** The departments of what isn't served yet. */
  unserved: string[];
  byItem: TillLine[];
  byRound: { id: string; sentAt: string; lines: TillLine[] }[];
};

/** The till's orders (`public.station_order_till`). */
export type StationTill = {
  version: number;
  now: string;
  day: string;
  departments: StationDepartment[];
  /** Every open order, oldest first. */
  orders: StationTillOrder[];
  /** Today's closed and cancelled ones, newest first. */
  closed: StationTillOrder[];
};

const tillOrder = z.strictObject({
  id: uuid,
  status: z.enum(ORDER_STATUSES),
  place: z.strictObject({ id: uuid, name: z.string() }).nullable(),
  takeaway: z.int().min(1).nullable(),
  openedAt: instant,
  reopenedAt: instant.nullable(),
  closedAt: instant.nullable(),
  cancelledAt: instant.nullable(),
  cancelReason: z.enum(ORDER_CANCEL_REASONS).nullable(),
  closedHere: z.boolean(),
  held: count,
  ready: count,
  unserved: z.array(uuid),
  byItem: z.array(tillLine),
  byRound: z.array(
    z.strictObject({ id: uuid, sentAt: instant, lines: z.array(tillLine) }),
  ),
}) satisfies z.ZodType<StationTillOrder>;

export const stationTillSchema = z.strictObject({
  version,
  now: instant,
  day,
  departments: z.array(stationDepartment),
  orders: z.array(tillOrder),
  closed: z.array(tillOrder),
}) satisfies z.ZodType<StationTill>;

/**
 * Why a station shows no orders. `notStation`: this device holds no
 * station's secret; `stopped`: someone stopped it; `signedIn`: someone is
 * signed in on the device; `notOrders`: it is a station of another kind (the
 * clock's, or the till's asking for the kitchen's); `off`: taking orders is
 * off in the business.
 */
export const ORDER_STATION_REFUSALS = [
  "notStation",
  "stopped",
  "signedIn",
  "notOrders",
  "off",
  "failed",
] as const;
export type OrderStationRefusal = (typeof ORDER_STATION_REFUSALS)[number];

/** People by id (lower case), by the names the business calls them: the senders on the tickets shown. */
const names = z.record(uuid, z.string());

/**
 * What the poll answers (a 204 when nothing moved). A prep screen gets its
 * tickets with the names of their senders, and its menu, each null when it
 * didn't move; the till its orders.
 */
export type StationAnswer =
  | {
      ok: true;
      shows: "prep";
      prep: StationPrep | null;
      names: Record<string, string>;
      menu: StationMenu | null;
    }
  | { ok: true; shows: "till"; till: StationTill | null }
  | { ok: false; failure: OrderStationRefusal };

export const stationAnswerSchema = z.union([
  z.strictObject({
    ok: z.literal(true),
    shows: z.literal("prep"),
    prep: stationPrepSchema.nullable(),
    names,
    menu: stationMenuSchema.nullable(),
  }),
  z.strictObject({
    ok: z.literal(true),
    shows: z.literal("till"),
    till: stationTillSchema.nullable(),
  }),
  z.strictObject({
    ok: z.literal(false),
    failure: z.enum(ORDER_STATION_REFUSALS),
  }),
]) satisfies z.ZodType<StationAnswer>;

// Writing

/** The largest body a write takes, in bytes. */
export const STATION_WRITE_MAX = 1024;

/** A station's write: a ticket ready or back, an item sold out or back, a close, a reopen, a close's undo. */
export const stationWriteBody = z.discriminatedUnion("do", [
  z.strictObject({ do: z.literal("ready"), ticket: uuid, ready: z.boolean() }),
  z.strictObject({
    do: z.literal("available"),
    item: uuid,
    available: z.boolean(),
  }),
  z.strictObject({ do: z.literal("close"), order: uuid }),
  z.strictObject({ do: z.literal("reopen"), order: uuid }),
  z.strictObject({ do: z.literal("undoClose"), order: uuid }),
]);
export type StationWrite = z.infer<typeof stationWriteBody>;

/** Which kind of station a write is for: the kitchen's marks, the till's closes. */
export function writeKind(body: StationWrite): OrderStationKind {
  return body.do === "ready" || body.do === "available" ? "prep" : "till";
}

/**
 * Why a write was refused: the station's refusals, and those of the orders'
 * writes that can come to a station (@db/order-failures' `OrderFailure`,
 * named again here to keep the domain out of @db). A sold-out mark has two
 * of its own, in an item's words: `itemGone`, the item was removed (or is
 * none of the business's), and `notHere`, it no longer goes to the screen's
 * department.
 */
export const STATION_WRITE_FAILURES = [
  ...ORDER_STATION_REFUSALS,
  "gone",
  "noAccess",
  "invalid",
  "taken",
  "closed",
  "held",
  "window",
  "served",
  "day",
  "notClosed",
  "notYet",
  "itemGone",
  "notHere",
] as const;
export type StationWriteFailure = (typeof STATION_WRITE_FAILURES)[number];

/** Whether a failure is one a station's write answers with. */
export function isStationWriteFailure(
  failure: string,
): failure is StationWriteFailure {
  return (STATION_WRITE_FAILURES as readonly string[]).includes(failure);
}

export type StationWriteAnswer =
  | { ok: true }
  | { ok: false; failure: StationWriteFailure };

export const stationWriteAnswer = z.union([
  z.strictObject({ ok: z.literal(true) }),
  z.strictObject({
    ok: z.literal(false),
    failure: z.enum(STATION_WRITE_FAILURES),
  }),
]) satisfies z.ZodType<StationWriteAnswer>;

// What the kitchen's screen tells

/** A ticket still to make: a line of it is live. */
const liveTicket = (ticket: PrepTicket) =>
  ticket.lines.some((line) => line.state === "live");

/** A ticket still new on the screen with every line of it taken back or cancelled: struck whole. */
export function stationGone(ticket: PrepTicket): boolean {
  return ticket.status === "new" && !liveTicket(ticket);
}

/**
 * What a screen still has to make of the tickets it shows, in their order:
 * the new ones with a line still live. One struck whole stays on the screen
 * until it is taken off, but is neither counted open nor the oldest waiting.
 */
export function stillToMake<T extends PrepTicket>(tickets: readonly T[]): T[] {
  return tickets.filter(
    (ticket) => ticket.status === "new" && liveTicket(ticket),
  );
}

/**
 * Of the tickets taken off a screen by hand ("הסרה מהמסך"), those that stay
 * off: still in the read and struck whole. One with a line live again (a
 * cancelled line restored) is shown again, and no longer kept as taken off.
 */
export function stillDismissed(
  dismissed: readonly string[],
  tickets: readonly PrepTicket[],
): string[] {
  const struck = new Set(
    tickets.filter(stationGone).map((ticket) => ticket.id),
  );
  return dismissed.filter((id) => struck.has(id));
}

/** What changed between two reads, for the sound and the screen reader. */
export type StationNews = {
  /**
   * New tickets, held blocks called, and tickets with a line to make again
   * (a cancelled line restored, on a ticket struck whole or not): one chime.
   */
  arrived: string[];
  /** Lines live before and taken back or cancelled now, on a ticket still shown: the double chime. */
  struck: { ticket: string; line: string }[];
};

/**
 * What a read brought (§4.4): the tickets that arrived (new now, and absent
 * or held before, or with a line live now that wasn't before) with a line to
 * make, and the lines struck since on a ticket still shown. The first read
 * after the screen opens (`before` null) tells nothing: what is there
 * already was there.
 */
export function stationNews(
  before: readonly PrepTicket[] | null,
  after: readonly PrepTicket[],
): StationNews {
  if (before === null) return { arrived: [], struck: [] };
  const was = new Map(before.map((ticket) => [ticket.id, ticket]));
  const arrived: string[] = [];
  const struck: { ticket: string; line: string }[] = [];
  for (const ticket of after) {
    const earlier = was.get(ticket.id);
    const live = new Set(
      (earlier?.lines ?? [])
        .filter((line) => line.state === "live")
        .map((line) => line.id),
    );
    if (
      ticket.status === "new" &&
      liveTicket(ticket) &&
      (!earlier ||
        earlier.status === "held" ||
        // A cancelled line restored: there is something to make again.
        ticket.lines.some(
          (line) => line.state === "live" && !live.has(line.id),
        ))
    ) {
      arrived.push(ticket.id);
    }
    if (!earlier) continue;
    for (const line of ticket.lines) {
      if (live.has(line.id) && line.state !== "live") {
        struck.push({ ticket: ticket.id, line: line.id });
      }
    }
  }
  return { arrived, struck };
}

/** Since when a ticket waits: sent, or called for a held block. */
export const stationSince = (ticket: PrepTicket) =>
  ticket.firedAt ?? ticket.sentAt;

/**
 * The tickets waiting past `lateAfterMinutes` now that none reminded of yet
 * (§4.4: one reminder each, while the screen is open): still new, with a
 * line to make.
 */
export function lateNews(
  tickets: readonly PrepTicket[],
  now: number,
  lateAfterMinutes: number,
  reminded: ReadonlySet<string>,
): string[] {
  return tickets
    .filter(
      (ticket) =>
        ticket.status === "new" &&
        liveTicket(ticket) &&
        !reminded.has(ticket.id) &&
        now - Date.parse(stationSince(ticket)) >= lateAfterMinutes * 60_000,
    )
    .map((ticket) => ticket.id);
}

/**
 * Of the tickets a read brought (`arrived`, `stationNews`), those waiting
 * past `lateAfterMinutes` already (sent while the screen had no connection,
 * or given back by a close taken back): the arrival's chime is their one
 * sound and its words their one announcement, so they count as reminded.
 */
export function arrivedLate(
  tickets: readonly PrepTicket[],
  arrived: readonly string[],
  now: number,
  lateAfterMinutes: number,
): string[] {
  const came = new Set(arrived);
  return lateNews(
    tickets.filter((ticket) => came.has(ticket.id)),
    now,
    lateAfterMinutes,
    new Set(),
  );
}

/** How long a ticket that arrived keeps its accent edge. */
export const STATION_FRESH_MS = 30_000;

/** The tickets that arrived in the last `STATION_FRESH_MS`, by when each arrived. */
export function freshTickets(
  arrivedAt: ReadonlyMap<string, number>,
  now: number,
): Set<string> {
  return new Set(
    [...arrivedAt]
      .filter(([, at]) => now - at < STATION_FRESH_MS)
      .map(([id]) => id),
  );
}

/** A station's connection: down while offline, or after two failed asks in a row (§4.6). */
export function stationConnection(
  failures: number,
  online: boolean,
): "ok" | "down" {
  return !online || failures >= 2 ? "down" : "ok";
}

/**
 * When a station asks again, in milliseconds, or null while its page is
 * hidden: the prep screen's pace, every 5 seconds, each failure in a row
 * doubling it up to half a minute.
 */
export function nextStationPoll(
  failures: number,
  visible: boolean,
): number | null {
  return nextOrdersSyncDelay({ visible, failures, pace: "prep" });
}

/**
 * The name a new screen is offered (default 13): `base` ("מטבח", "הכנה",
 * "קופה"), or `numbered(n)` ("מטבח 2") for the first number from 2 that no
 * running station is called.
 */
export function orderStationName(
  base: string,
  running: readonly string[],
  numbered: (n: number) => string,
): string {
  const taken = new Set(running.map((name) => name.trim()));
  if (!taken.has(base.trim())) return base;
  let n = 2;
  while (taken.has(numbered(n).trim())) n += 1;
  return numbered(n);
}
