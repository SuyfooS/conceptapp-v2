import type { MenuImportRow } from "@domain/menu-import";
import type { DraftLine } from "@domain/order-screens";
import type { CategoryInput } from "@domain/order-taking";
import { newId as id } from "./ids";
import {
  chosenOptions,
  type DepartmentKey,
  departmentOf,
  itemById,
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
// domain's since P4 (@domain/order-screens), kept by their draft's key.

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

/**
 * Closes the place's order for the till: whatever is new or ready counts as
 * served. The screen refuses first while a held block waits (`hasHeld`).
 */
export function closeOrder(
  data: DemoData,
  placeId: string,
  by: string,
  now: number,
): DemoData {
  const order = data.orders.find((o) => o.placeId === placeId);
  if (!order) return data;
  const closed: Order = {
    ...order,
    closedAt: now,
    closedBy: by,
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

/** "פתיחה מחדש": back on the floor, while the place is free. */
export function reopenOrder(data: DemoData, orderId: string): DemoData {
  const order = data.closed.find((o) => o.id === orderId);
  if (!order || data.orders.some((o) => o.placeId === order.placeId)) {
    return data;
  }
  return {
    ...data,
    orders: [...data.orders, { ...order, closedAt: null, closedBy: null }],
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
