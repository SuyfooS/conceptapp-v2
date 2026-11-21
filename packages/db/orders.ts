import "server-only";
import { isUuid } from "@domain/activity";
import {
  type CompReason,
  type Favourites,
  favouritesSchema,
  type LineCancelReason,
  type MyOrders,
  myOrdersSchema,
  ORDER_CAPS,
  type OrderCancelReason,
  type OrderDetail,
  type OrderFloor,
  type OrderMode,
  type OrderPrep,
  type OrderTill,
  orderDetailSchema,
  orderFloorSchema,
  orderModeSchema,
  orderPrepSchema,
  orderTillSchema,
  type RoundInput,
  roundInput,
  type SentRound,
  sentRoundSchema,
} from "@domain/orders";
import { shortNames } from "@domain/people";
import { z } from "zod";
import type { Json } from "./database.types";
import { memberNames, nameIn } from "./member-names";
import { isMissingFunction } from "./missing";
import {
  type DatabaseRefusal,
  type OrderFailure,
  orderFailureOf,
  refusedItems,
  takenOrder,
} from "./order-failures";
import { createAdminClient } from "./supabase/admin";
import { createClient } from "./supabase/server";

/*
 * Taking orders: the orders
 * (supabase/migrations/20261120000300_order_taking_orders.sql). The reads run
 * as the signed-in person (those who take orders now, a view as a role on the
 * staff, and those who run orders; the kitchen's for those on a department's
 * staff). Writes run with the secret key for `actorId`; the database checks
 * who may do what, and callers check the actor is the signed-in person and
 * not viewing as someone else. Every input is parsed here with the rules the
 * database checks, and every answer is parsed before it reaches a screen.
 * The mode's screens (P4) read them, and so does its sync (/orders-sync);
 * the send goes through /orders-send.
 */

/** Why a write was refused, for the screens' words (@db/order-failures). */
export type { OrderFailure } from "./order-failures";

/**
 * A write's answer. A refused send names the items it was refused for
 * (sold out, removed, going nowhere), and a place taken names its order.
 */
export type OrderWrite<T> =
  | { ok: true; value: T }
  | { ok: false; failure: OrderFailure; items: string[]; order: string | null };

/** A read refused to a taker off a shift. */
export type OffShift = { off: "clock" | "staleShift" };

/** What a read gives besides its answer. */
export type OrderRead<T> = T | "same" | "closed" | OffShift | "notYet";

type Refused = Extract<OrderWrite<never>, { ok: false }>;

const refused = (failure: OrderFailure): Refused => ({
  ok: false,
  failure,
  items: [],
  order: null,
});

const refusal = (error: DatabaseRefusal, what: string): Refused => ({
  ok: false,
  failure: orderFailureOf(error, what),
  items: refusedItems(error),
  order: takenOrder(error),
});

const done = { ok: true, value: null } as const;

/** `at_time` for a write, when the caller says when it happened. */
const atTime = (at?: Date) => (at ? { at_time: at.toISOString() } : {});

/** A read's refusal: unknown or not theirs, off a shift, or not here yet. */
function readRefusal(
  error: DatabaseRefusal,
): "closed" | OffShift | "notYet" | null {
  if (isMissingFunction(error)) return "notYet";
  if (error.code === "P0002") return "closed";
  if (error.code === "42501" && error.hint === "clock") return { off: "clock" };
  if (error.code === "42501" && error.hint === "stale_shift") {
    return { off: "staleShift" };
  }
  return null;
}

/** A read's answer, parsed: "same" when nothing changed since `knownVersion`. */
function answerOf<T>(
  schema: z.ZodType<T>,
  data: unknown,
  what: string,
): T | "same" {
  if (data === null) return "same";
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    console.error(`reading ${what} failed`, parsed.error.message);
    throw new Error(`${what} came back in a shape the app doesn't read`);
  }
  return parsed.data;
}

const knownVersionOf = (knownVersion?: number) =>
  knownVersion === undefined ? {} : { known_version: knownVersion };

// Reading

/**
 * The floor of the business for the signed-in person (`public.order_floor`):
 * the open orders, today's closed ones, and today's fixes for those who run
 * orders. "same" when `knownVersion` is still the orders', "closed" for
 * anyone it isn't for or while the module is off, `{ off }` for a taker off
 * a shift.
 */
export async function getOrderFloor(
  businessId: string,
  knownVersion?: number,
): Promise<OrderRead<OrderFloor>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_floor", {
    business: businessId,
    ...knownVersionOf(knownVersion),
  });
  if (error) {
    const read = readRefusal(error);
    if (read) return read;
    throw error;
  }
  return answerOf(orderFloorSchema, data, "the floor");
}

/** An order whole (`public.order_detail`): its rounds, tickets and lines, unit prices and no sum. */
export async function getOrderDetail(
  orderId: string,
): Promise<OrderRead<OrderDetail>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_detail", {
    order_ref: orderId,
  });
  if (error) {
    const read = readRefusal(error);
    if (read) return read;
    throw error;
  }
  return answerOf(orderDetailSchema, data, "an order");
}

/** What to ring up for an order (`public.order_till`), by item and by round. No total. */
export async function getOrderTill(
  orderId: string,
): Promise<OrderRead<OrderTill>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_till", {
    order_ref: orderId,
  });
  if (error) {
    const read = readRefusal(error);
    if (read) return read;
    throw error;
  }
  return answerOf(orderTillSchema, data, "the till");
}

/** The signed-in person's own rounds of today (`public.order_mine`). */
export async function getMyOrders(
  businessId: string,
  knownVersion?: number,
): Promise<OrderRead<MyOrders>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_mine", {
    business: businessId,
    ...knownVersionOf(knownVersion),
  });
  if (error) {
    const read = readRefusal(error);
    if (read) return read;
    throw error;
  }
  return answerOf(myOrdersSchema, data, "one's own rounds");
}

/**
 * What the kitchen prepares (`public.order_prep`), with no price at all. It
 * marks the new tickets of the reader's own departments as seen.
 */
export async function getOrderPrep(
  businessId: string,
  knownVersion?: number,
): Promise<OrderRead<OrderPrep>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_prep", {
    business: businessId,
    ...knownVersionOf(knownVersion),
  });
  if (error) {
    const read = readRefusal(error);
    if (read) return read;
    throw error;
  }
  return answerOf(orderPrepSchema, data, "the kitchen's tickets");
}

/** The items most ordered in the last 14 days (`public.order_favourites`). */
export async function getOrderFavourites(
  businessId: string,
): Promise<Exclude<OrderRead<Favourites>, "same">> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_favourites", {
    business: businessId,
  });
  if (error) {
    const read = readRefusal(error);
    if (read) return read;
    throw error;
  }
  const favourites = answerOf(favouritesSchema, data, "the favourites");
  return favourites === "same" ? { items: [] } : favourites;
}

/**
 * Where the signed-in person stands in the mode (`public.order_mode`, P4),
 * for the frame, Home and the clock: null while the module is off and for
 * anyone it isn't for, never an error of its own; "notYet" before the
 * migration reaches the project, which the app reads as no mode.
 */
export async function getOrderMode(
  businessId: string,
): Promise<OrderMode | null | "notYet"> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("order_mode", {
    business: businessId,
  });
  if (error) {
    if (isMissingFunction(error)) return "notYet";
    throw error;
  }
  if (data === null) return null;
  const parsed = orderModeSchema.safeParse(data);
  if (!parsed.success) {
    console.error("reading the mode failed", parsed.error.message);
    throw new Error("The mode came back in a shape the app doesn't read");
  }
  return parsed.data;
}

/**
 * The people the orders' screens name (who opened, who sent), by id, as the
 * signed-in person reads them under RLS: everyone in a business reads its
 * team, those who left included, whose names old orders still carry. Each
 * by the business's name for them, short (`shortNames`: first names, full
 * where two share one). Nothing about any order. The departments' names
 * come from @db/departments, with who is in each.
 */
export async function getOrderPeople(
  businessId: string,
): Promise<Map<string, string>> {
  const supabase = await createClient();
  const [members, names] = await Promise.all([
    supabase
      .from("memberships")
      .select("user_id, profiles (full_name)")
      .eq("business_id", businessId),
    memberNames(supabase, businessId),
  ]);
  if (members.error) throw members.error;
  const people = (members.data ?? []).map((row) => ({
    id: row.user_id.toLowerCase(),
    name: nameIn(names, row.user_id, row.profiles?.full_name) ?? "",
  }));
  const short = shortNames(people.map((person) => person.name));
  return new Map(
    people.flatMap((person, at): [string, string][] =>
      person.name ? [[person.id, short[at] ?? person.name]] : [],
    ),
  );
}

// Writing

/**
 * Sends a round (`public.send_order_round`), keyed by `input.key`: the same
 * key and lines again give the same answer, so a phone may retry.
 */
export async function sendOrderRound(
  actorId: string,
  businessId: string,
  input: RoundInput,
  at?: Date,
): Promise<OrderWrite<SentRound>> {
  const parsed = roundInput.safeParse(input);
  if (!parsed.success) return refused("invalid");
  const { data, error } = await createAdminClient().rpc("send_order_round", {
    actor: actorId,
    business: businessId,
    round_key: parsed.data.key,
    target: parsed.data.target as Json,
    lines: parsed.data.lines as Json,
    ...atTime(at),
  });
  if (error) return refusal(error, "sending a round");
  const sent = sentRoundSchema.safeParse(data);
  return sent.success ? { ok: true, value: sent.data } : refused("failed");
}

/** The sender takes a line back (`public.take_back_order_line`). */
export async function takeBackOrderLine(
  actorId: string,
  lineId: string,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("take_back_order_line", {
    actor: actorId,
    line: lineId,
    ...atTime(at),
  });
  return error ? refusal(error, "taking a line back") : done;
}

/**
 * Cancels a line with a reason, or undoes its cancel (`cancelled` false,
 * `reason` null) while the order is open (`public.cancel_order_line`).
 */
export async function cancelOrderLine(
  actorId: string,
  lineId: string,
  reason: LineCancelReason | null,
  cancelled: boolean,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("cancel_order_line", {
    actor: actorId,
    line: lineId,
    ...(reason === null ? {} : { reason }),
    cancelled,
    ...atTime(at),
  });
  return error ? refusal(error, "cancelling a line") : done;
}

/** Gives a line on the house, or takes that back (`public.comp_order_line`). */
export async function compOrderLine(
  actorId: string,
  lineId: string,
  reason: CompReason | null,
  comped: boolean,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("comp_order_line", {
    actor: actorId,
    line: lineId,
    ...(reason === null ? {} : { reason }),
    comped,
    ...atTime(at),
  });
  return error ? refusal(error, "giving a line on the house") : done;
}

/** Cancels a whole open order, for good (`public.cancel_order`). */
export async function cancelOrder(
  actorId: string,
  orderId: string,
  reason: OrderCancelReason,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("cancel_order", {
    actor: actorId,
    order_ref: orderId,
    reason,
    ...atTime(at),
  });
  return error ? refusal(error, "cancelling an order") : done;
}

const firedSchema = z.int().min(0);

/** Calls an order's held blocks (`public.fire_order_tickets`): how many it called. */
export async function fireOrderTickets(
  actorId: string,
  orderId: string,
  at?: Date,
): Promise<OrderWrite<number>> {
  const { data, error } = await createAdminClient().rpc("fire_order_tickets", {
    actor: actorId,
    order_ref: orderId,
    ...atTime(at),
  });
  if (error) return refusal(error, "calling the held blocks");
  const fired = firedSchema.safeParse(data);
  return fired.success ? { ok: true, value: fired.data } : refused("failed");
}

/** Moves an open order to another place (`public.move_order`). */
export async function moveOrder(
  actorId: string,
  orderId: string,
  placeId: string,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("move_order", {
    actor: actorId,
    order_ref: orderId,
    place: placeId,
    ...atTime(at),
  });
  return error ? refusal(error, "moving an order") : done;
}

/** Closes an open order, serving what wasn't (`public.close_order`). */
export async function closeOrder(
  actorId: string,
  orderId: string,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("close_order", {
    actor: actorId,
    order_ref: orderId,
    ...atTime(at),
  });
  return error ? refusal(error, "closing an order") : done;
}

/** Opens a closed order again, the same business day (`public.reopen_order`). */
export async function reopenOrder(
  actorId: string,
  orderId: string,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("reopen_order", {
    actor: actorId,
    order_ref: orderId,
    ...atTime(at),
  });
  return error ? refusal(error, "opening an order again") : done;
}

/**
 * The close's "ביטול" (`public.undo_close_order`): by whoever closed it,
 * within 2 minutes ("window" after, or for another's close), the order open
 * again and the tickets the close served back where they were.
 */
export async function undoCloseOrder(
  actorId: string,
  orderId: string,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("undo_close_order", {
    actor: actorId,
    order_ref: orderId,
    ...atTime(at),
  });
  return error ? refusal(error, "taking a close back") : done;
}

/** Marks a ticket served, or not (`public.serve_order_ticket`). */
export async function serveOrderTicket(
  actorId: string,
  ticketId: string,
  served: boolean,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("serve_order_ticket", {
    actor: actorId,
    ticket: ticketId,
    served,
    ...atTime(at),
  });
  return error ? refusal(error, "serving a ticket") : done;
}

/** Marks a ticket ready, or back to new (`public.set_order_ticket_ready`). */
export async function setOrderTicketReady(
  actorId: string,
  ticketId: string,
  ready: boolean,
  at?: Date,
): Promise<OrderWrite<null>> {
  const { error } = await createAdminClient().rpc("set_order_ticket_ready", {
    actor: actorId,
    ticket: ticketId,
    ready,
    ...atTime(at),
  });
  return error ? refusal(error, "marking a ticket ready") : done;
}

/** The most tickets one call reads the lines of, as the database caps it. */
export const READ_READY_MOST = 200;

/**
 * Ready tickets shown to their sender (waiter mode P8b): /orders-sync gave
 * the signed-in person their own rounds with these in them, so their ready
 * lines are read and no push follows (`public.read_order_ready`, with the
 * secret key for `actorId`; callers never call it while viewing as someone).
 * How many lines it marked: none for no ticket, and before the migration
 * reaches the project.
 */
export async function readOrderReady(
  actorId: string,
  businessId: string,
  tickets: readonly string[],
): Promise<number> {
  const ids = [...new Set(tickets.filter((ticket) => isUuid(ticket)))].slice(
    0,
    READ_READY_MOST,
  );
  if (ids.length === 0) return 0;
  const { data, error } = await createAdminClient().rpc("read_order_ready", {
    actor: actorId,
    business: businessId,
    tickets: ids,
  });
  if (error) {
    if (isMissingFunction(error)) return 0;
    throw error;
  }
  return typeof data === "number" ? data : 0;
}

const labelSchema = z
  .string()
  .trim()
  .max(ORDER_CAPS.label)
  .refine((text) => !/[\p{Cc}\u2028\u2029]/u.test(text));

/** Names an open takeaway, or clears its name (`public.set_order_label`). */
export async function setOrderLabel(
  actorId: string,
  orderId: string,
  label: string | null,
  at?: Date,
): Promise<OrderWrite<null>> {
  const parsed = labelSchema.nullable().safeParse(label);
  if (!parsed.success) return refused("invalid");
  const { error } = await createAdminClient().rpc("set_order_label", {
    actor: actorId,
    order_ref: orderId,
    ...(parsed.data ? { label: parsed.data } : {}),
    ...atTime(at),
  });
  return error ? refusal(error, "naming a takeaway") : done;
}
