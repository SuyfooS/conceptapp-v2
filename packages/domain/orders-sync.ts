import { z } from "zod";
import { isUuid } from "./activity";
import { type Menu, menuSchema } from "./order-taking";
import {
  type MyOrders,
  myOrdersSchema,
  type OrderDetail,
  type OrderFloor,
  type OrderPrep,
  orderDetailSchema,
  orderFloorSchema,
  orderPrepSchema,
  roundInput,
  type SentRound,
  sentRoundSchema,
} from "./orders";

/**
 * Waiter mode's way to the server (P4), as chat's (@domain/chat-sync): no
 * Realtime and no Supabase client in the browser, but two small routes. The
 * send, `POST /orders-send`, keyed by the phone so a retry is the same round;
 * and `GET /orders-sync`, which every screen of the mode asks while it is on
 * screen. What each is asked, what it answers (read on the client with the
 * schemas below: a boundary), and when to ask again.
 */

/** The routes (app/orders-send/route.ts, app/orders-sync/route.ts). */
export const ORDERS_SEND_PATH = "/orders-send";
export const ORDERS_SYNC_PATH = "/orders-sync";

/** Every screen of the mode asks this often while it is visible (default 10). */
export const ORDERS_SYNC_MS = 15_000;
/**
 * And this often (§7.1, P7) while a round of one's own waits to be ready,
 * or on the prep screen, until P8's stations.
 */
export const ORDERS_SYNC_FAST_MS = 5_000;
/** And never less often than this, whatever fails. */
const ORDERS_SYNC_MOST_MS = 60_000;
/** The prep screen's longest wait, whatever fails. */
const ORDERS_SYNC_PREP_MOST_MS = 30_000;

/**
 * How fast the mode asks: `"prep"` while a screen wants the kitchen's
 * tickets, `"waiting"` while a round of one's own waits to be ready, else
 * `"steady"`.
 */
export type OrdersSyncPace = "prep" | "waiting" | "steady";

/**
 * When to ask `/orders-sync` again, in milliseconds, or null: not until the
 * page is visible again (it asks at once then, when the phone is back
 * online, and after each of its own writes). Every 15 seconds, or 5 at the
 * faster paces; each failure in a row doubles the wait, up to a minute (half
 * a minute on the prep screen).
 */
export function nextOrdersSyncDelay(state: {
  visible: boolean;
  failures: number;
  pace?: OrdersSyncPace;
}): number | null {
  if (!state.visible) return null;
  const pace = state.pace ?? "steady";
  const failures = Number.isFinite(state.failures)
    ? Math.min(Math.max(Math.floor(state.failures), 0), 8)
    : 0;
  const base = pace === "steady" ? ORDERS_SYNC_MS : ORDERS_SYNC_FAST_MS;
  const most = pace === "prep" ? ORDERS_SYNC_PREP_MOST_MS : ORDERS_SYNC_MOST_MS;
  return Math.min(base * 2 ** failures, most);
}

/**
 * The mode's pace (§7.1): `"prep"` while a screen wants the kitchen's
 * tickets and the person prepares or runs orders; `"waiting"` while one of
 * their own rounds of an open order has a ticket at its department with
 * lines left (a held block, one ready or served, and one with nothing left
 * don't count); else `"steady"`.
 */
export function ordersSyncPace(input: {
  mine: Pick<MyOrders, "rounds"> | null;
  prep: boolean;
}): OrdersSyncPace {
  if (input.prep) return "prep";
  const waiting = input.mine?.rounds.some(
    (round) =>
      round.orderStatus === "open" &&
      round.tickets.some(
        (ticket) => ticket.status === "new" && ticket.lines > 0,
      ),
  );
  return waiting ? "waiting" : "steady";
}

/** What a screen asks: the business, what it knows, and which reads. */
export type OrdersSyncQuery = {
  business: string;
  /** The orders' version the screen holds, or null for none yet. */
  version: number | null;
  /** The menu's version it holds, to ask for the menu; null not to. */
  menu: number | null | "new";
  floor: boolean;
  mine: boolean;
  prep: boolean;
  /** An order to read whole when the orders moved. */
  order: string | null;
};

const VERSION = /^\d{1,19}$/;

/** `GET /orders-sync?b=&v=&m=&f=1&y=1&p=1&o=`, as the route reads it back. */
export function ordersSyncHref(query: OrdersSyncQuery): string {
  const params = new URLSearchParams({ b: query.business });
  if (query.version !== null) params.set("v", String(query.version));
  if (query.menu !== null) {
    params.set("m", query.menu === "new" ? "" : String(query.menu));
  }
  if (query.floor) params.set("f", "1");
  if (query.mine) params.set("y", "1");
  if (query.prep) params.set("p", "1");
  if (query.order) params.set("o", query.order);
  return `${ORDERS_SYNC_PATH}?${params}`;
}

/**
 * The question in a sync's address, or null for one that isn't one: a
 * business by its id, versions as whole numbers (an empty `m` asks for the
 * menu whole), the flags as 1, an order by its id, and at least one read.
 */
export function readOrdersSyncQuery(
  params: URLSearchParams,
): OrdersSyncQuery | null {
  const business = params.get("b");
  if (!business || !isUuid(business)) return null;
  const number = (value: string | null) =>
    value !== null && VERSION.test(value) && Number.isSafeInteger(Number(value))
      ? Number(value)
      : undefined;
  const v = params.get("v");
  const version = v === null ? null : number(v);
  if (version === undefined) return null;
  const m = params.get("m");
  const menu: OrdersSyncQuery["menu"] | undefined =
    m === null ? null : m === "" ? "new" : number(m);
  if (menu === undefined) return null;
  const flag = (name: string) => {
    const value = params.get(name);
    return value === null ? false : value === "1" ? true : undefined;
  };
  const floor = flag("f");
  const mine = flag("y");
  const prep = flag("p");
  if (floor === undefined || mine === undefined || prep === undefined) {
    return null;
  }
  const o = params.get("o");
  if (o !== null && !isUuid(o)) return null;
  const query = {
    business: business.toLowerCase(),
    version,
    menu,
    floor,
    mine,
    prep,
    order: o ? o.toLowerCase() : null,
  };
  if (!floor && !mine && !prep && menu === null && !o) return null;
  return query;
}

/** What a screen of the mode asks the sync for while it is on. */
export type OrdersSyncWant = {
  floor: boolean;
  prep: boolean;
  order: string | null;
};

/**
 * The mode's next question (P4), from who asks, what the screens on want
 * and what the mode holds. The floor and one order only for a taker on a
 * shift; one's own rounds for any taker who isn't viewing, off a shift too:
 * that light read is how a phone left on the off-shift card hears the shift
 * began at the clock station or on another phone (409 while it hasn't, an
 * answer once it has), so it asks for them whole, with no version. The
 * kitchen's tickets for a screen that wants them, from someone who prepares
 * or runs orders. The version is the oldest of the reads it holds of what it
 * asks, the order it wants among them, by the version it was read whole at
 * (it is read again only when something moved: an order held from before a
 * screen was left, and changed while it was, is read again), so nothing
 * newer is skipped; none when it holds nothing of one, or when an order it
 * wants isn't held yet or was read at a version it doesn't know (the first
 * send at a free place opens one; the server drew a takeaway's page with
 * it): with no version, everything has moved. The menu always, by its own
 * version.
 */
export function nextOrdersSyncQuery(input: {
  business: string;
  takes: boolean;
  viewing: boolean;
  /** Prepares for a department, or runs orders. */
  prepares: boolean;
  /** A taker off a shift, or with a shift left open: their screens wait. */
  off: boolean;
  wants: readonly OrdersSyncWant[];
  held: {
    floor: { version: number } | null;
    mine: { version: number } | null;
    prep: { version: number } | null;
    menu: { version: number } | null;
    /**
     * The version each order held whole was read at, by id: null when that
     * isn't known, none for one never read.
     */
    orders: Readonly<Record<string, number | null>>;
  };
}): OrdersSyncQuery {
  const { held, off } = input;
  const floor = !off && input.takes && input.wants.some((w) => w.floor);
  const mine = input.takes && !input.viewing;
  const prep = input.prepares && input.wants.some((w) => w.prep);
  const order = off ? null : (input.wants.find((w) => w.order)?.order ?? null);
  const asking = [
    ...(floor ? [held.floor] : []),
    ...(mine ? [held.mine] : []),
    ...(prep ? [held.prep] : []),
  ];
  const orderAt = order === null ? undefined : held.orders[order];
  const unread = order !== null && typeof orderAt !== "number";
  const version =
    off || unread || asking.length === 0 || asking.some((r) => r === null)
      ? null
      : Math.min(
          ...asking.map((r) => r?.version ?? 0),
          ...(typeof orderAt === "number" ? [orderAt] : []),
        );
  return {
    business: input.business,
    version,
    menu: held.menu ? held.menu.version : "new",
    floor,
    mine,
    prep,
    order,
  };
}

/**
 * The version a sync answers with: the smallest of the orders' reads it
 * made, so a write that landed between two of them is read again next time,
 * never missed. Null when it made none.
 */
export function syncedVersion(
  versions: readonly (number | null | undefined)[],
): number | null {
  const known = versions.filter((v): v is number => typeof v === "number");
  return known.length === 0 ? null : Math.min(...known);
}

/**
 * The server's time a read says (its `now`), in milliseconds, when it is
 * later than the latest the mode heard; else null, and the mode's clock
 * stays. A screen drawn again with the data it had (going back, a screen
 * shown again) says an older time, which would set the clock back by as
 * long as the screen was left.
 */
export function laterServerTime(
  latest: number | null,
  serverNow: string | null | undefined,
): number | null {
  if (!serverNow) return null;
  const at = Date.parse(serverNow);
  if (Number.isNaN(at)) return null;
  return latest === null || at > latest ? at : null;
}

/** A sync's answer: what moved since the screen's versions, each read whole. */
export type OrdersSyncAnswer = {
  version: number | null;
  floor?: OrderFloor;
  mine?: MyOrders;
  prep?: OrderPrep;
  /** The order whole, or null when it is no longer one to read. */
  order?: OrderDetail | null;
  menu?: Menu;
};

export const ordersSyncAnswer = z.object({
  version: z.int().min(0).nullable(),
  floor: orderFloorSchema.optional(),
  mine: myOrdersSchema.optional(),
  prep: orderPrepSchema.optional(),
  order: orderDetailSchema.nullable().optional(),
  menu: menuSchema.optional(),
}) satisfies z.ZodType<OrdersSyncAnswer>;

/** The answer to a sync refused to a taker off a shift (409). */
export const offShiftAnswer = z.object({
  off: z.enum(["clock", "staleShift"]),
});

// Sending

/**
 * The send's body: the round, the business it is for and the person who
 * wrote it. The business is the round's own, never the cookie's: a send
 * retried after the person switched business still goes where it was
 * written. The person (P7) is checked against the session's, so a round
 * kept on a shared phone is never sent as whoever is signed in now. Strict:
 * nothing else rides along.
 */
export const sendBody = roundInput.extend({
  business: z.uuid(),
  user: z.uuid(),
});

export type SendBody = z.infer<typeof sendBody>;

/** The most a send's body may be, which keepalive also allows. */
export const SEND_BODY_MAX = 64 * 1024;

/** How long a send waits before each retry, with the same key and body. */
export const SEND_RETRY_MS = [1000, 2000, 5000, 10_000, 30_000] as const;

/** The wait before retry `attempt` (from 0): 30 seconds once the list ends. */
export function sendRetryDelay(attempt: number): number {
  const at = Math.max(0, Math.floor(attempt));
  return SEND_RETRY_MS[at] ?? 30_000;
}

/**
 * Whether a send is tried again: only when nothing came back (null, the
 * network) or the server failed on its way (500, 502, 503, 504). Any other
 * answer is the answer.
 */
export function retriesSend(status: number | null): boolean {
  return status === null || [500, 502, 503, 504].includes(status);
}

/** The send's answer: the round, or why not, with the items and the order it names. */
export type SendAnswer =
  | { ok: true; round: SentRound }
  | {
      ok: false;
      failure: string;
      items: string[];
      order: string | null;
    };

export const sendAnswer = z.union([
  z.object({ ok: z.literal(true), round: sentRoundSchema }),
  z.object({
    ok: z.literal(false),
    failure: z.string().max(40),
    items: z.array(z.uuid()).default([]),
    order: z.uuid().nullable().default(null),
  }),
]) satisfies z.ZodType<SendAnswer>;
