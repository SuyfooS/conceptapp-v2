import type { MenuImportRow } from "@domain/menu-import";
import type { DraftLine } from "@domain/order-screens";
import type {
  StationWrite,
  StationWriteAnswer,
  StationWriteFailure,
} from "@domain/order-stations";
import type { CategoryInput } from "@domain/order-taking";
import {
  type CompReason,
  closeUndoState,
  type LineCancelReason,
  type OrderCancelReason,
} from "@domain/orders";
import type { PendingSend } from "../../(app)/orders/orders-types";
import { newId as id } from "./ids";
import {
  chosenOptions,
  type DepartmentKey,
  departmentOf,
  hasHeld,
  itemById,
  lineLive,
  type MenuItem,
  type Order,
  type Round,
  type SentLine,
  type Ticket,
  unitPrice,
} from "./model";
import { importedRows, savedCategories } from "./real-menu";
import type { DemoData } from "./scenario";

// What the demo's screens change, each as data in and data out, so a
// screen keeps what it needs for its undo before it asks. The send's split
// and the close's settling follow the design's §3.2 and §6.3, roughly, for
// the look only: P3 does them in one database function. The drafts are the
// domain's since P4 (@domain/order-screens), kept by their draft's key. P5's
// fixes refuse here what the database refuses, by changing nothing.

/** A round on its way by its key, and the draft it left (P7). */
export function pendingByKey(
  data: DemoData,
  key: string,
): { draft: string; round: PendingSend } | null {
  for (const [draft, round] of Object.entries(data.pending)) {
    if (round.key === key) return { draft, round };
  }
  return null;
}

/** The round off its way: sent now ("שליחה"), or off the phone ("הסרה מהטלפון"). */
export function withoutPending(data: DemoData, key: string): DemoData {
  const found = pendingByKey(data, key);
  if (!found) return data;
  const { [found.draft]: _, ...pending } = data.pending;
  return { ...data, pending };
}

/** The removal's "ביטול": the round back where it waited, asking as it was. */
export function withPending(
  data: DemoData,
  draft: string,
  round: PendingSend,
): DemoData {
  return { ...data, pending: { ...data.pending, [draft]: round } };
}

export function setLabel(
  data: DemoData,
  placeId: string,
  label: string,
): DemoData {
  return {
    ...data,
    takeaways: data.takeaways.map((place) =>
      place.id === placeId ? { ...place, label: label || null } : place,
    ),
  };
}

/** A draft line as the send copies it: its name, choices and unit price. */
function sentLine(item: MenuItem, line: DraftLine): SentLine {
  const choices = line.choices.map((choice) => choice.option);
  return {
    id: id(),
    itemId: item.id,
    name: item.name,
    choices: chosenOptions(item, choices).map((option) => option.name),
    unit: unitPrice(item, choices),
    qty: line.quantity,
    // One note a line: an allergy says what in it (P4).
    note: line.allergy ? null : line.note,
    allergy: line.allergy ? line.note : null,
    takenBack: false,
    cancelled: null,
    comped: null,
  };
}

/** Where a twin's round goes: an open order, a place's first, or a new takeaway. */
export type TwinWhere = {
  orderId: string | null;
  placeId: string | null;
  label?: string | null;
};

/**
 * Sends a draft as one round, as the database splits it: one ticket per
 * department, and one more per department for the lines held for later,
 * those last. The first send opens the order, and a takeaway's gives it the
 * next number of the day.
 */
export function sendRound(
  data: DemoData,
  where: TwinWhere,
  lines: readonly DraftLine[],
  by: string,
  now: number,
): { data: DemoData; order: Order; round: Round } {
  const tickets = new Map<string, Ticket>();
  for (const line of lines) {
    const item = itemById(data.menu, line.item);
    if (!item) continue;
    const department: DepartmentKey = departmentOf(data.menu, item);
    const key = `${department}:${line.held}`;
    const ticket = tickets.get(key) ?? {
      id: id(),
      department,
      held: line.held,
      state: "new" as const,
      lines: [],
      seen: false,
      firedAt: null,
      readyAt: null,
      readyBy: null,
    };
    ticket.lines.push(sentLine(item, line));
    tickets.set(key, ticket);
  }
  const round: Round = {
    id: id(),
    at: now,
    by,
    tickets: [...tickets.values()].sort(
      (x, y) => Number(x.held) - Number(y.held),
    ),
  };
  const open = data.orders.find(
    (order) =>
      order.id === where.orderId ||
      (where.placeId !== null && order.placeId === where.placeId),
  );
  if (open) {
    const order = { ...open, rounds: [...open.rounds, round] };
    return {
      data: {
        ...data,
        orders: data.orders.map((o) => (o === open ? order : o)),
      },
      order,
      round,
    };
  }
  let takeaways = data.takeaways;
  let nextTakeaway = data.nextTakeaway;
  let placeId = where.placeId;
  if (placeId === null) {
    placeId = `takeaway-${id()}`;
    takeaways = [
      ...takeaways,
      {
        id: placeId,
        kind: "takeaway",
        name: String(nextTakeaway),
        label: where.label?.trim() || null,
      },
    ];
    nextTakeaway += 1;
  }
  const order: Order = {
    id: id(),
    placeId,
    openedBy: by,
    openedAt: now,
    rounds: [round],
    closedAt: null,
    closedBy: null,
  };
  return {
    data: { ...data, orders: [...data.orders, order], takeaways, nextTakeaway },
    order,
    round,
  };
}

function mapTickets(
  data: DemoData,
  change: (ticket: Ticket) => Ticket,
): DemoData {
  const each = (order: Order): Order => ({
    ...order,
    rounds: order.rounds.map((round) => ({
      ...round,
      tickets: round.tickets.map(change),
    })),
  });
  return {
    ...data,
    orders: data.orders.map(each),
    closed: data.closed.map(each),
  };
}

export function changeTicket(
  data: DemoData,
  ticketId: string,
  change: Partial<Ticket>,
): DemoData {
  return mapTickets(data, (ticket) =>
    ticket.id === ticketId ? { ...ticket, ...change } : ticket,
  );
}

/** A screen has drawn these tickets: "על המסך". */
export function markSeen(data: DemoData, ticketIds: string[]): DemoData {
  if (ticketIds.length === 0) return data;
  return mapTickets(data, (ticket) =>
    ticketIds.includes(ticket.id) && !ticket.seen
      ? { ...ticket, seen: true }
      : ticket,
  );
}

/** "החזרה מהשליחה", and its undo. */
export function setTakenBack(
  data: DemoData,
  lineId: string,
  takenBack: boolean,
): DemoData {
  return mapTickets(data, (ticket) =>
    ticket.lines.some((line) => line.id === lineId)
      ? {
          ...ticket,
          lines: ticket.lines.map((line) =>
            line.id === lineId ? { ...line, takenBack } : line,
          ),
        }
      : ticket,
  );
}

/** A line of an open order changed, as a fix makes it. */
function changeLine(
  data: DemoData,
  lineId: string,
  change: (line: SentLine) => SentLine,
): DemoData {
  return {
    ...data,
    orders: data.orders.map((order) => ({
      ...order,
      rounds: order.rounds.map((round) => ({
        ...round,
        tickets: round.tickets.map((ticket) =>
          ticket.lines.some((line) => line.id === lineId)
            ? {
                ...ticket,
                lines: ticket.lines.map((line) =>
                  line.id === lineId ? change(line) : line,
                ),
              }
            : ticket,
        ),
      })),
    })),
  };
}

/** A line cancelled with its reason (P5): not taken back, not on the house. */
export function cancelLine(
  data: DemoData,
  lineId: string,
  reason: LineCancelReason,
  by: string,
  now: number,
): DemoData {
  return changeLine(data, lineId, (line) =>
    line.takenBack || line.comped || line.cancelled
      ? line
      : { ...line, cancelled: { reason, at: now, by } },
  );
}

/** A cancelled line back on its order, while the order is open. */
export const restoreLine = (data: DemoData, lineId: string): DemoData =>
  changeLine(data, lineId, (line) => ({ ...line, cancelled: null }));

/** A line on the house with its reason (P5): one still sent, not on it already. */
export function compLine(
  data: DemoData,
  lineId: string,
  reason: CompReason,
  by: string,
  now: number,
): DemoData {
  return changeLine(data, lineId, (line) =>
    line.takenBack || line.cancelled || line.comped
      ? line
      : { ...line, comped: { reason, at: now, by } },
  );
}

/** A line off the house again, while the order is open. */
export const uncompLine = (data: DemoData, lineId: string): DemoData =>
  changeLine(data, lineId, (line) => ({ ...line, comped: null }));

/**
 * A whole open order cancelled, for good (P5): every line still live (not
 * taken back, cancelled or on the house) cancelled with the same reason, and
 * the order among today's closed, as cancelled.
 */
export function cancelOrder(
  data: DemoData,
  orderId: string,
  reason: OrderCancelReason,
  by: string,
  now: number,
): DemoData {
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) return data;
  const cancelled: Order = {
    ...order,
    closedAt: now,
    closedBy: by,
    cancelled: { reason, at: now, by },
    rounds: order.rounds.map((round) => ({
      ...round,
      tickets: round.tickets.map((ticket) => ({
        ...ticket,
        lines: ticket.lines.map((line) =>
          lineLive(line) && !line.comped
            ? { ...line, cancelled: { reason, at: now, by } }
            : line,
        ),
      })),
    })),
  };
  return {
    ...data,
    orders: data.orders.filter((o) => o !== order),
    closed: [cancelled, ...data.closed],
  };
}

/**
 * An open table's order moved to another table with no open order (P5); a
 * takeaway stays where it is, and a taken table refuses it.
 */
export function moveOrder(
  data: DemoData,
  orderId: string,
  placeId: string,
  by: string,
  now: number,
): DemoData {
  const order = data.orders.find((o) => o.id === orderId);
  const table = (id: string) => data.tables.some((p) => p.id === id);
  if (
    !order ||
    order.placeId === placeId ||
    !table(order.placeId) ||
    !table(placeId) ||
    data.orders.some((o) => o.placeId === placeId)
  ) {
    return data;
  }
  return {
    ...data,
    orders: data.orders.map((o) =>
      o === order
        ? {
            ...o,
            placeId,
            moved: { from: order.placeId, at: now, by },
          }
        : o,
    ),
  };
}

/**
 * Closes an open order for the till, a table's or a takeaway's: whatever is
 * new or ready counts as served, and the order keeps what each of those
 * was, for the close's "ביטול". The screen refuses first while a held block
 * waits (`hasHeld`).
 */
export function closeOrder(
  data: DemoData,
  orderId: string,
  by: string,
  now: number,
): DemoData {
  const order = data.orders.find((o) => o.id === orderId);
  if (!order) return data;
  const closed: Order = {
    ...order,
    closedAt: now,
    closedBy: by,
    closeServed: Object.fromEntries(
      order.rounds
        .flatMap((round) => round.tickets)
        .filter((ticket) => ticket.state !== "served")
        .map((ticket) => [ticket.id, ticket.state]),
    ),
    rounds: order.rounds.map((round) => ({
      ...round,
      tickets: round.tickets.map((ticket) => ({
        ...ticket,
        state: "served" as const,
      })),
    })),
  };
  return {
    ...data,
    orders: data.orders.filter((o) => o !== order),
    closed: [closed, ...data.closed],
  };
}

/**
 * "פתיחה מחדש": back on the floor, while the place is free; never a
 * cancelled one. Who opened it again, and when, stays on it.
 */
export function reopenOrder(
  data: DemoData,
  orderId: string,
  by: string,
  now: number,
): DemoData {
  const order = data.closed.find((o) => o.id === orderId);
  if (
    !order ||
    order.cancelled ||
    data.orders.some((o) => o.placeId === order.placeId)
  ) {
    return data;
  }
  return {
    ...data,
    orders: [
      ...data.orders,
      {
        ...order,
        closedAt: null,
        closedBy: null,
        closeServed: null,
        reopened: { at: now, by },
      },
    ],
    closed: data.closed.filter((o) => o !== order),
  };
}

/**
 * The close's "ביטול", as `undo_close_order`: by whoever closed it within
 * `ORDER_RULES.closeUndoMinutes` (`closeUndoState`), while the place is
 * free, it opens again as a reopen does, and each ticket the close served
 * goes back to what it was; one served before the close stays served.
 * Anything else changes nothing.
 */
export function undoCloseOrder(
  data: DemoData,
  orderId: string,
  by: string,
  now: number,
): DemoData {
  const order = data.closed.find((o) => o.id === orderId);
  if (
    !order ||
    order.cancelled ||
    order.closedAt === null ||
    closeUndoState({
      closedAt: new Date(order.closedAt),
      closedBy: order.closedBy,
      actor: by,
      now: new Date(now),
    }) !== "ok" ||
    data.orders.some((o) => o.placeId === order.placeId)
  ) {
    return data;
  }
  const was = order.closeServed ?? {};
  return {
    ...data,
    orders: [
      ...data.orders,
      {
        ...order,
        closedAt: null,
        closedBy: null,
        closeServed: null,
        reopened: { at: now, by },
        rounds: order.rounds.map((round) => ({
          ...round,
          tickets: round.tickets.map((ticket) => {
            const state = was[ticket.id];
            return state ? { ...ticket, state } : ticket;
          }),
        })),
      },
    ],
    closed: data.closed.filter((o) => o !== order),
  };
}

export function setSoldOut(
  data: DemoData,
  itemId: string,
  soldOut: boolean,
): DemoData {
  const rest = data.soldOut.filter((idOf) => idOf !== itemId);
  return { ...data, soldOut: soldOut ? [...rest, itemId] : rest };
}

/** A new item or a changed one; items are never deleted (old lines point at them). */
export function saveItem(data: DemoData, item: MenuItem): DemoData {
  const known = data.menu.items.some((i) => i.id === item.id);
  return {
    ...data,
    menu: {
      ...data.menu,
      items: known
        ? data.menu.items.map((i) => (i.id === item.id ? item : i))
        : [...data.menu.items, item],
    },
  };
}

/**
 * A checked paste, added in one go as the real import writes it: new
 * categories after the business's own, an existing one taking its items.
 */
export function importMenu(
  data: DemoData,
  rows: readonly MenuImportRow[],
): { data: DemoData; categories: number; items: number } {
  const done = importedRows(data.menu, rows, id);
  return {
    data: { ...data, menu: done.menu },
    categories: done.categories,
    items: done.items,
  };
}

/**
 * The categories saved whole from the real categories screen: renamed,
 * moved, added or removed, their items following them.
 */
export function saveCategories(
  data: DemoData,
  list: readonly CategoryInput[],
): { data: DemoData; ids: string[] } {
  const saved = savedCategories(data.menu, list, id);
  return { data: { ...data, menu: saved.menu }, ids: saved.ids };
}

/**
 * A station's write on the twin (waiter mode P8a), as the database decides
 * it for a station: a kitchen's screen marks a ticket of its department
 * ready, or back within 5 minutes, and an item sold out or back; the till
 * closes an order (refused while a held block waits), takes its own close
 * back within 2 minutes, and opens a closed one again while its place is
 * free. Each kept as the station's ("station"), never a person's. What it
 * refuses changes nothing.
 */
export function stationWrite(
  data: DemoData,
  body: StationWrite,
  at: { department: string | null; now: number },
): { data: DemoData; answer: StationWriteAnswer } {
  const refused = (failure: StationWriteFailure) => ({
    data,
    answer: { ok: false as const, failure },
  });
  const done = (next: DemoData) => ({
    data: next,
    answer: { ok: true as const },
  });
  switch (body.do) {
    case "ready": {
      const order = data.orders.find((o) =>
        o.rounds.some((r) => r.tickets.some((t) => t.id === body.ticket)),
      );
      const ticket = order?.rounds
        .flatMap((r) => r.tickets)
        .find((t) => t.id === body.ticket);
      if (
        !ticket ||
        (at.department !== null && ticket.department !== at.department)
      ) {
        return refused("gone");
      }
      if (ticket.held && ticket.state === "new") return refused("held");
      if (body.ready) {
        if (ticket.state !== "new") return done(data);
        return done(
          changeTicket(data, ticket.id, {
            state: "ready",
            readyAt: at.now,
            readyBy: null,
          }),
        );
      }
      if (ticket.state === "new") return done(data);
      if (ticket.state === "served") return refused("served");
      if (at.now > (ticket.readyAt ?? 0) + 5 * 60_000) {
        return refused("window");
      }
      return done(
        changeTicket(data, ticket.id, { state: "new", readyAt: null }),
      );
    }
    case "available": {
      const item = data.menu.items.find((i) => i.id === body.item);
      const category = data.menu.categories.find(
        (c) => c.id === item?.categoryId,
      );
      if (!item || !category) return refused("gone");
      if (at.department !== null && category.department !== at.department) {
        return refused("noAccess");
      }
      return done(setSoldOut(data, item.id, !body.available));
    }
    case "close": {
      const order = data.orders.find((o) => o.id === body.order);
      if (!order) {
        return data.closed.some((o) => o.id === body.order && !o.cancelled)
          ? done(data)
          : refused("gone");
      }
      if (hasHeld(order)) return refused("held");
      return done(closeOrder(data, order.id, "station", at.now));
    }
    case "reopen":
    case "undoClose": {
      if (data.orders.some((o) => o.id === body.order)) return done(data);
      const order = data.closed.find((o) => o.id === body.order);
      if (!order) return refused("gone");
      if (order.cancelled) return refused("notClosed");
      if (data.orders.some((o) => o.placeId === order.placeId)) {
        return refused("taken");
      }
      if (body.do === "reopen") {
        return done(reopenOrder(data, order.id, "station", at.now));
      }
      const next = undoCloseOrder(data, order.id, "station", at.now);
      return next === data ? refused("window") : done(next);
    }
  }
}
