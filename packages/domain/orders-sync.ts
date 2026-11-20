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
/** And never less often than this, whatever fails. */
const ORDERS_SYNC_MOST_MS = 60_000;

/**
 * When to ask `/orders-sync` again, in milliseconds, or null: not until the
 * page is visible again (it asks at once then, when the phone is back
 * online, and after each of its own writes). Each failure in a row doubles
 * the wait, up to a minute.
 */
export function nextOrdersSyncDelay(state: {
  visible: boolean;
  failures: number;
}): number | null {
  if (!state.visible) return null;
  const failures = Number.isFinite(state.failures)
    ? Math.min(Math.max(Math.floor(state.failures), 0), 8)
    : 0;
  return Math.min(ORDERS_SYNC_MS * 2 ** failures, ORDERS_SYNC_MOST_MS);
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
 * The send's body: the round, and the business it is for. The business is
 * the round's own, never the cookie's: a send retried after the person
 * switched business still goes where it was written.
 */
export const sendBody = roundInput.extend({ business: z.uuid() });

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
