"use server";

import {
  fireOrderTickets,
  type OrderWrite,
  serveOrderTicket,
  setOrderLabel,
  setOrderTicketReady,
  takeBackOrderLine,
} from "@db/orders";
import { z } from "zod";
import { type OrdersAccess, ordersAccess } from "./orders-access";
import type { OrdersActionResult } from "./orders-types";

/*
 * The mode's writes besides the send, as the signed-in person (waiter mode
 * P4): "הוגש" and its undo, "מוכן" and "החזרה להכנה", "החזרה מהשליחה" and
 * "להוציא", and a takeaway's label. Each is bound on its screen to the
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
