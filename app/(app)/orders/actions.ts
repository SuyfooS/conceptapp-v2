"use server";

import {
  cancelOrder,
  cancelOrderLine,
  closeOrder,
  compOrderLine,
  fireOrderTickets,
  moveOrder,
  type OrderWrite,
  reopenOrder,
  serveOrderTicket,
  setOrderLabel,
  setOrderTicketReady,
  takeBackOrderLine,
} from "@db/orders";
import {
  COMP_REASONS,
  LINE_CANCEL_REASONS,
  ORDER_CANCEL_REASONS,
} from "@domain/orders";
import { z } from "zod";
import { type OrdersAccess, ordersAccess } from "./orders-access";
import type { OrdersActionResult } from "./orders-types";

/*
 * The mode's writes besides the send, as the signed-in person (waiter mode
 * P4): "הוגש" and its undo, "מוכן" and "החזרה להכנה", "החזרה מהשליחה" and
 * "להוציא", and a takeaway's label; and P5's fixes: a line cancelled with
 * a reason or put back, on the house or not, a whole order cancelled, moved,
 * closed and opened again. Each is bound on its screen to the
 * business it was drawn for, and refused in another (the business the app
 * opens is one cookie for the whole browser); never while viewing as
 * someone. Every argument is parsed here, and the database decides who may
 * do what again. None draws the screen again: the mode's sync asks at once
 * after each. Server actions rather than routes, as the menu's: none sets a
 * cookie, so one forwarded from another screen (a take-back held for its
 * "ביטול" and sent on leaving) still lands.
 */

const id = z.uuid();
const flag = z.boolean();
const label = z.string().max(40).nullable();

/**
 * A fix and its undo: on, with one of the reasons; off, with none (the
 * database keeps the reason of the fix it takes back).
 */
const fixOf = <R extends readonly [string, ...string[]]>(reasons: R) =>
  z.union([
    z.strictObject({ on: z.literal(true), reason: z.enum(reasons) }),
    z.strictObject({ on: z.literal(false), reason: z.null() }),
  ]);
const lineCancel = fixOf(LINE_CANCEL_REASONS);
const lineComp = fixOf(COMP_REASONS);
const orderCancel = z.enum(ORDER_CANCEL_REASONS);

type Refusal = Extract<OrdersActionResult, { ok: false }>;

/** The person, when the write is theirs to try. */
async function writer(business: unknown): Promise<OrdersAccess | Refusal> {
  const access = await ordersAccess();
  if (!access) return { ok: false, failure: "noAccess" };
  if (business !== access.businessId) {
    return { ok: false, failure: "businessChanged" };
  }
  if (access.viewing) return { ok: false, failure: "viewOnly" };
  return access;
}

const refusedBefore = (access: OrdersAccess | Refusal): access is Refusal =>
  "ok" in access;

/** The database's answer, as the screens read it. */
function answered<T>(result: OrderWrite<T>): OrdersActionResult<T> {
  return result.ok
    ? { ok: true, value: result.value }
    : { ok: false, failure: result.failure };
}

/** "הוגש", or its undo: a ticket served, or back to where it was. */
export async function serveAction(
  business: string,
  ticket: unknown,
  served: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(ticket);
  const on = flag.safeParse(served);
  if (!which.success || !on.success) return { ok: false, failure: "invalid" };
  return answered(await serveOrderTicket(access.userId, which.data, on.data));
}

/** "מוכן", or "החזרה להכנה" within five minutes. */
export async function setReadyAction(
  business: string,
  ticket: unknown,
  ready: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(ticket);
  const on = flag.safeParse(ready);
  if (!which.success || !on.success) return { ok: false, failure: "invalid" };
  return answered(
    await setOrderTicketReady(access.userId, which.data, on.data),
  );
}

/** "החזרה מהשליחה": the sender takes a line back within the window. */
export async function takeBackAction(
  business: string,
  line: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(line);
  if (!which.success) return { ok: false, failure: "invalid" };
  return answered(await takeBackOrderLine(access.userId, which.data));
}

/** "להוציא": calls an order's held blocks; how many it called. */
export async function fireAction(
  business: string,
  order: unknown,
): Promise<OrdersActionResult<number>> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(order);
  if (!which.success) return { ok: false, failure: "invalid" };
  return answered(await fireOrderTickets(access.userId, which.data));
}

/** A takeaway's label after its first send, or none. */
export async function setLabelAction(
  business: string,
  order: unknown,
  text: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(order);
  const words = label.safeParse(text);
  if (!which.success || !words.success) {
    return { ok: false, failure: "invalid" };
  }
  return answered(
    await setOrderLabel(access.userId, which.data, words.data || null),
  );
}

/** A line cancelled with a reason, or put back (`cancelled` false, no reason) while the order is open. */
export async function cancelLineAction(
  business: string,
  line: unknown,
  reason: unknown,
  cancelled: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(line);
  const fix = lineCancel.safeParse({ on: cancelled, reason });
  if (!which.success || !fix.success) return { ok: false, failure: "invalid" };
  return answered(
    await cancelOrderLine(
      access.userId,
      which.data,
      fix.data.reason,
      fix.data.on,
    ),
  );
}

/** A line on the house with a reason, or not any more (`comped` false, no reason). */
export async function compLineAction(
  business: string,
  line: unknown,
  reason: unknown,
  comped: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(line);
  const fix = lineComp.safeParse({ on: comped, reason });
  if (!which.success || !fix.success) return { ok: false, failure: "invalid" };
  return answered(
    await compOrderLine(
      access.userId,
      which.data,
      fix.data.reason,
      fix.data.on,
    ),
  );
}

/** "ביטול ההזמנה": a whole open order, for good, with a reason. */
export async function cancelOrderAction(
  business: string,
  order: unknown,
  reason: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(order);
  const why = orderCancel.safeParse(reason);
  if (!which.success || !why.success) return { ok: false, failure: "invalid" };
  return answered(await cancelOrder(access.userId, which.data, why.data));
}

/** An open order moved to another place, or back to where it was. */
export async function moveOrderAction(
  business: string,
  order: unknown,
  place: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(order);
  const where = id.safeParse(place);
  if (!which.success || !where.success) {
    return { ok: false, failure: "invalid" };
  }
  return answered(await moveOrder(access.userId, which.data, where.data));
}

/** "סגירת ההזמנה": what wasn't served is served, and the place is free. */
export async function closeOrderAction(
  business: string,
  order: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(order);
  if (!which.success) return { ok: false, failure: "invalid" };
  return answered(await closeOrder(access.userId, which.data));
}

/** "פתיחה מחדש": a closed order of today open again, and a close's undo. */
export async function reopenOrderAction(
  business: string,
  order: unknown,
): Promise<OrdersActionResult> {
  const access = await writer(business);
  if (refusedBefore(access)) return access;
  const which = id.safeParse(order);
  if (!which.success) return { ok: false, failure: "invalid" };
  return answered(await reopenOrder(access.userId, which.data));
}
