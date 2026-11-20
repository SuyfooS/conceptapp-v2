import type { MenuImportRow } from "@domain/menu-import";
import type { CategoryInput } from "@domain/order-taking";
import { newId as id } from "./ids";
import {
  chosenOptions,
  type DepartmentKey,
  type DraftLine,
  departmentOf,
  itemById,
  type MenuItem,
  type Order,
  type SentLine,
  type Ticket,
  unitPrice,
} from "./model";
import { importedRows, savedCategories } from "./real-menu";
import type { DemoData } from "./scenario";

// What the demo's screens change, each as data in and data out, so a
// screen keeps what it needs for its undo before it asks. The send's split
// and the close's settling follow the design's §3.2 and §6.3, roughly, for
// the look only: P3 does them in one database function.

const draftOf = (data: DemoData, placeId: string) => data.drafts[placeId] ?? [];

function withDraft(
  data: DemoData,
  placeId: string,
  lines: DraftLine[],
): DemoData {
  return { ...data, drafts: { ...data.drafts, [placeId]: lines } };
}

/** One tap adds a plain item, or one more of the same plain line. */
export function addLine(
  data: DemoData,
  placeId: string,
  itemId: string,
  choices: string[],
  qty: number,
): DemoData {
  const lines = draftOf(data, placeId);
  const same = lines.find(
    (line) =>
      line.itemId === itemId &&
      line.choices.length === 0 &&
      choices.length === 0 &&
      !line.note &&
      !line.allergy &&
      !line.held,
  );
  if (same) {
    return withDraft(
      data,
      placeId,
      lines.map((line) =>
        line === same ? { ...line, qty: line.qty + qty } : line,
      ),
    );
  }
  return withDraft(data, placeId, [
    ...lines,
    { id: id(), itemId, qty, choices, note: null, allergy: null, held: false },
  ]);
}

export function changeLine(
  data: DemoData,
  placeId: string,
  lineId: string,
  change: Partial<Pick<DraftLine, "qty" | "note" | "allergy" | "held">>,
): DemoData {
  return withDraft(
    data,
    placeId,
    draftOf(data, placeId).map((line) =>
      line.id === lineId ? { ...line, ...change } : line,
    ),
  );
}

export function removeLine(
  data: DemoData,
  placeId: string,
  lineId: string,
): DemoData {
  return withDraft(
    data,
    placeId,
    draftOf(data, placeId).filter((line) => line.id !== lineId),
  );
}

/** The undo of a removal: the line where it was. */
export function putLineBack(
  data: DemoData,
  placeId: string,
  line: DraftLine,
  index: number,
): DemoData {
  const lines = draftOf(data, placeId).filter((l) => l.id !== line.id);
  lines.splice(Math.min(index, lines.length), 0, line);
  return withDraft(data, placeId, lines);
}

/** A takeaway before its first send: on the phone only, with no number yet. */
export function newTakeaway(data: DemoData, placeId: string): DemoData {
  return {
    ...data,
    takeaways: [
      ...data.takeaways,
      { id: placeId, kind: "takeaway", name: null, label: null },
    ],
  };
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
  return {
    id: id(),
    itemId: item.id,
    name: item.name,
    choices: chosenOptions(item, line.choices).map((option) => option.name),
    unit: unitPrice(item, line.choices),
    qty: line.qty,
    note: line.note,
    allergy: line.allergy,
    takenBack: false,
  };
}

/**
 * Sends the place's draft as one round: one ticket per department, and one
 * more per department for the lines held for later. The first send opens
 * the order, and gives a takeaway its number.
 */
export function send(
  data: DemoData,
  placeId: string,
  by: string,
  now: number,
): DemoData {
  const lines = draftOf(data, placeId);
  if (lines.length === 0) return data;
  const tickets = new Map<string, Ticket>();
  for (const line of lines) {
    const item = itemById(data.menu, line.itemId);
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
  // Held blocks last, after what goes now.
  const round = {
    id: id(),
    at: now,
    by,
    tickets: [...tickets.values()].sort(
      (a, b) => Number(a.held) - Number(b.held),
    ),
  };
  const open = data.orders.find((order) => order.placeId === placeId);
  const orders: Order[] = open
    ? data.orders.map((order) =>
        order === open ? { ...order, rounds: [...order.rounds, round] } : order,
      )
    : [
        ...data.orders,
        {
          id: id(),
          placeId,
          openedBy: by,
          openedAt: now,
          rounds: [round],
          closedAt: null,
          closedBy: null,
        },
      ];
  const takeaway = data.takeaways.find(
    (place) => place.id === placeId && place.name === null,
  );
  return {
    ...data,
    orders,
    drafts: { ...data.drafts, [placeId]: [] },
    takeaways: takeaway
      ? data.takeaways.map((place) =>
          place === takeaway
            ? { ...place, name: String(data.nextTakeaway) }
            : place,
        )
      : data.takeaways,
    nextTakeaway: takeaway ? data.nextTakeaway + 1 : data.nextTakeaway,
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
