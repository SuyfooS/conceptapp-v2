import type { DraftLine } from "@domain/order-screens";
import type {
  StationDepartment,
  StationMenu,
  StationPrep,
  StationTill,
  StationTillOrder,
} from "@domain/order-stations";
import { checkPicks } from "@domain/order-taking";
import {
  type FloorOrder,
  type MyOrders,
  type OrderDetail,
  type OrderFloor,
  type OrderPrep,
  type OrderStatus,
  orderTill,
  type PrepLine,
  type ReadyTicket,
  type SentRound,
  type TicketStatus,
} from "@domain/orders";
import type { OrdersFrame } from "../../(app)/orders/orders-types";
import {
  orderDemoDepartments,
  orderDemoPeople,
  READER,
  READER_DEPARTMENTS,
} from "./data";
import {
  lineLive,
  type Order,
  type Place,
  type Round,
  type SentLine,
  TAKE_BACK_MINUTES,
  type Ticket,
  ticketCount,
} from "./model";
import { twinGroups } from "./real-menu";
import type { DemoData, TwinViewer } from "./scenario";

/*
 * The twin's rows as the app's mode screens read them (waiter mode P4), as
 * real-menu.ts does for the menu: S0's store stays the one store, so what the
 * floor sends reaches the prep screen and comes back ready, and the real
 * screens draw it as the app does. Pure, so it is tested
 * (order-taking.test.ts). The twin's ids are words ("table-4"), which the
 * screens never read as more than keys. P5 adds the fixes: lines cancelled
 * and on the house, orders moved, opened again and cancelled whole. P8a adds
 * the kitchen's screen and the till, as their stations read them.
 */

const iso = (at: number) => new Date(at).toISOString();

/** Thursday's business day, as the twin's evening has it. */
const DAY = "2026-11-19";

/** A ticket's status as the database keeps it: a held block not fired yet is "held". */
export const statusOf = (ticket: Ticket): TicketStatus =>
  ticket.held && ticket.state === "new" ? "held" : ticket.state;

const live = (ticket: Ticket) => ticketCount(ticket) > 0;

/** The place an order is at, among the tables and the takeaways. */
function placeOf(data: DemoData, order: Order): Place | undefined {
  return [...data.tables, ...data.takeaways].find(
    (p) => p.id === order.placeId,
  );
}

/** Where an order is, as the reads name it: a table's name, or a takeaway's number. */
function whereOf(data: DemoData, order: Order) {
  const place = placeOf(data, order);
  const table = place?.kind === "table";
  return {
    place: table ? (place?.id ?? null) : null,
    placeName: table ? (place?.name ?? null) : null,
    takeaway: table || !place?.name ? null : Number(place.name),
    label: table ? null : (place?.label ?? null),
  };
}

/** A sent line as the kitchen reads it: one note, its allergy said in it. */
function prepLine(line: SentLine): PrepLine {
  return {
    id: line.id,
    name: line.name,
    choices: line.choices,
    quantity: line.qty,
    note: line.allergy ?? line.note,
    allergy: line.allergy !== null,
    state: line.takenBack ? "takenBack" : line.cancelled ? "cancelled" : "live",
  };
}

/** An order's status as the database keeps it. */
const statusOfOrder = (data: DemoData, order: Order): OrderStatus =>
  data.orders.includes(order)
    ? "open"
    : order.cancelled
      ? "cancelled"
      : "closed";

const servedAt = (ticket: Ticket, round: Round) =>
  ticket.state === "served" ? iso(ticket.readyAt ?? round.at) : null;

/** The floor, as `public.order_floor` gives it. */
export function twinFloor(
  data: DemoData,
  now: number,
  version = 1,
): OrderFloor {
  const orders: FloorOrder[] = data.orders.map((order) => {
    const tickets = order.rounds.flatMap((round) =>
      round.tickets.filter(live).map((ticket) => ({ ticket, round })),
    );
    const count = (status: TicketStatus) =>
      tickets.filter(({ ticket }) => statusOf(ticket) === status).length;
    const waiting = tickets
      .filter(({ ticket }) => statusOf(ticket) === "new")
      .map(({ ticket, round }) => ticket.firedAt ?? round.at);
    const where = whereOf(data, order);
    return {
      id: order.id,
      place: where.place,
      placeName: where.placeName,
      takeaway: where.takeaway,
      label: where.label,
      openedAt: iso(order.openedAt),
      openedBy: order.openedBy,
      movedAt: order.moved ? iso(order.moved.at) : null,
      lastSentAt: order.rounds.length
        ? iso(Math.max(...order.rounds.map((round) => round.at)))
        : null,
      rounds: order.rounds.length,
      tickets: {
        held: count("held"),
        new: count("new"),
        ready: count("ready"),
        served: count("served"),
      },
      waitingSince: waiting.length ? iso(Math.min(...waiting)) : null,
      unseen: tickets.some(
        ({ ticket }) => statusOf(ticket) === "new" && !ticket.seen,
      ),
    };
  });
  const ready: ReadyTicket[] = data.orders
    .flatMap((order) =>
      order.rounds.flatMap((round) =>
        round.tickets
          .filter((ticket) => ticket.state === "ready" && live(ticket))
          .map((ticket) => {
            const where = whereOf(data, order);
            return {
              ticket: ticket.id,
              order: order.id,
              department: ticket.department,
              placeName: where.placeName,
              takeaway: where.takeaway,
              readyAt: iso(ticket.readyAt ?? round.at),
              sentBy: round.by,
              lines: ticket.lines
                .filter(lineLive)
                .map(({ id, name, choices, qty, note, allergy }) => ({
                  id,
                  name,
                  choices,
                  quantity: qty,
                  note: allergy ?? note,
                  allergy: allergy !== null,
                })),
            };
          }),
      ),
    )
    .sort((a, b) => Date.parse(a.readyAt) - Date.parse(b.readyAt));
  return {
    version,
    now: iso(now),
    day: DAY,
    runs: true,
    orders,
    closed: data.closed.map((order) => {
      const where = whereOf(data, order);
      return {
        id: order.id,
        placeName: where.placeName,
        takeaway: where.takeaway,
        status: order.cancelled ? ("cancelled" as const) : ("closed" as const),
        closedAt: iso(order.cancelled?.at ?? order.closedAt ?? now),
      };
    }),
    // Shiran runs orders: she reads the evening's fixes.
    fixes: twinFixes(data),
    ready,
  };
}

/** How many lines were taken back, cancelled and given on the house this evening. */
export function twinFixes(data: DemoData): NonNullable<OrderFloor["fixes"]> {
  const lines = [...data.orders, ...data.closed].flatMap((order) =>
    order.rounds.flatMap((round) =>
      round.tickets.flatMap((ticket) => ticket.lines),
    ),
  );
  return {
    takenBack: lines.filter((line) => line.takenBack).length,
    cancelled: lines.filter((line) => line.cancelled).length,
    comped: lines.filter((line) => line.comped).length,
  };
}

/**
 * A sent line's choices as `public.order_detail` names them: each with its
 * group's name and the option's price, from the item as the twin has it now
 * (the send froze only their names); "" and 0 for one it no longer has.
 */
function detailChoices(data: DemoData, line: SentLine) {
  const item = data.menu.items.find((i) => i.id === line.itemId);
  return line.choices.map((option) => {
    const group = item?.groups.find((g) =>
      g.options.some((o) => o.name === option),
    );
    return {
      group: group?.name ?? "",
      option,
      priceAgorot: group?.options.find((o) => o.name === option)?.price ?? 0,
    };
  });
}

/** An order whole, as `public.order_detail` gives it; null for none open or closed today. */
export function twinDetail(
  data: DemoData,
  orderId: string,
  now: number,
): OrderDetail | null {
  const open = data.orders.find((order) => order.id === orderId);
  const order = open ?? data.closed.find((o) => o.id === orderId);
  if (!order) return null;
  const place = placeOf(data, order);
  const where = whereOf(data, order);
  const from = order.moved
    ? data.tables.find((p) => p.id === order.moved?.from)
    : undefined;
  return {
    id: order.id,
    status: open ? "open" : order.cancelled ? "cancelled" : "closed",
    day: DAY,
    place:
      place?.kind === "table" ? { id: place.id, name: place.name ?? "" } : null,
    takeaway:
      where.takeaway === null
        ? null
        : { number: where.takeaway, label: where.label },
    openedAt: iso(order.openedAt),
    openedBy: order.openedBy,
    // A cancelled order is closed in the twin for the stations, never here.
    closedAt:
      order.closedAt === null || order.cancelled ? null : iso(order.closedAt),
    closedBy: order.cancelled ? null : order.closedBy,
    reopenedAt: order.reopened ? iso(order.reopened.at) : null,
    reopenedBy: order.reopened?.by ?? null,
    movedAt: order.moved ? iso(order.moved.at) : null,
    movedBy: order.moved?.by ?? null,
    movedFrom: from?.name ?? null,
    cancelledAt: order.cancelled ? iso(order.cancelled.at) : null,
    cancelledBy: order.cancelled?.by ?? null,
    cancelReason: order.cancelled?.reason ?? null,
    now: iso(now),
    takeBackMinutes: TAKE_BACK_MINUTES,
    rounds: order.rounds.map((round) => ({
      id: round.id,
      sentAt: iso(round.at),
      sentBy: round.by,
      tickets: round.tickets.map((ticket) => ({
        id: ticket.id,
        department: ticket.department,
        status: statusOf(ticket),
        held: ticket.held,
        firedAt: ticket.firedAt === null ? null : iso(ticket.firedAt),
        kitchenSeenAt: ticket.seen ? iso(ticket.firedAt ?? round.at) : null,
        readyAt: ticket.readyAt === null ? null : iso(ticket.readyAt),
        servedAt: servedAt(ticket, round),
        prepared: ticket.readyAt !== null,
        lines: ticket.lines.map((line) => ({
          id: line.id,
          item: line.itemId,
          name: line.name,
          choices: detailChoices(data, line),
          quantity: line.qty,
          note: line.allergy ?? line.note,
          allergy: line.allergy !== null,
          unitAgorot: line.unit,
          takenBackAt: line.takenBack ? iso(round.at) : null,
          cancelledAt: line.cancelled ? iso(line.cancelled.at) : null,
          cancelReason: line.cancelled?.reason ?? null,
          compedAt: line.comped ? iso(line.comped.at) : null,
          compReason: line.comped?.reason ?? null,
        })),
      })),
    })),
  };
}

/** The order open at a place, if any. */
export const twinOrderAt = (data: DemoData, placeId: string) =>
  data.orders.find((order) => order.placeId === placeId) ?? null;

/** Shiran's own rounds of the evening, as `public.order_mine` gives them, ready first. */
export function twinMine(data: DemoData, now: number, version = 1): MyOrders {
  const rounds = [...data.orders, ...data.closed].flatMap((order) =>
    order.rounds
      .filter((round) => round.by === READER)
      .map((round) => {
        const where = whereOf(data, order);
        return {
          id: round.id,
          order: order.id,
          placeName: where.placeName,
          takeaway: where.takeaway,
          orderStatus: statusOfOrder(data, order),
          sentAt: iso(round.at),
          tickets: round.tickets.map((ticket) => ({
            id: ticket.id,
            department: ticket.department,
            status: statusOf(ticket),
            held: ticket.held,
            kitchenSeenAt: ticket.seen ? iso(round.at) : null,
            readyAt: ticket.readyAt === null ? null : iso(ticket.readyAt),
            servedAt: servedAt(ticket, round),
            lines: ticket.lines.filter(lineLive).length,
            items: ticket.lines.map(prepLine),
          })),
        };
      }),
  );
  const ready = (round: (typeof rounds)[number]) =>
    round.tickets.some((ticket) => ticket.status === "ready");
  return {
    version,
    now: iso(now),
    day: DAY,
    rounds: rounds.sort(
      (a, b) =>
        Number(ready(b)) - Number(ready(a)) ||
        Date.parse(b.sentAt) - Date.parse(a.sentAt),
    ),
  };
}

/** The kitchen's tickets, as `public.order_prep` gives them: no price at all. */
export function twinPrep(
  data: DemoData,
  departments: readonly string[],
  now: number,
  version = 1,
): OrderPrep {
  return {
    version,
    now: iso(now),
    departments: [...departments],
    tickets: data.orders
      .flatMap((order) =>
        order.rounds.flatMap((round) =>
          round.tickets
            .filter(
              (ticket) =>
                departments.includes(ticket.department) &&
                (ticket.state === "new" ||
                  (ticket.state === "ready" &&
                    ticket.readyAt !== null &&
                    now - ticket.readyAt < 5 * 60_000)),
            )
            .map((ticket) => {
              const where = whereOf(data, order);
              return {
                id: ticket.id,
                order: order.id,
                department: ticket.department,
                placeName: where.placeName,
                takeaway: where.takeaway,
                status: statusOf(ticket),
                sentAt: iso(round.at),
                firedAt: ticket.firedAt === null ? null : iso(ticket.firedAt),
                readyAt: ticket.readyAt === null ? null : iso(ticket.readyAt),
                sentBy: round.by,
                lines: ticket.lines.map(prepLine),
              };
            }),
        ),
      )
      .sort(
        (a, b) =>
          Date.parse(a.firedAt ?? a.sentAt) - Date.parse(b.firedAt ?? b.sentAt),
      ),
  };
}

/** The round a twin's send makes, as `public.send_order_round` answers it. */
export function twinSentRound(
  data: DemoData,
  order: Order,
  round: Round,
): SentRound {
  const where = whereOf(data, order);
  return {
    round: round.id,
    order: order.id,
    sentAt: iso(round.at),
    first: order.rounds.length === 1,
    place: where.place,
    takeaway: where.takeaway,
    tickets: round.tickets.map((ticket) => ({
      id: ticket.id,
      department: ticket.department,
      held: ticket.held,
    })),
  };
}

/**
 * Whether the send refuses a draft's choices, as `public.send_order_round`
 * does: a line of an item still on the menu and available whose picks don't
 * fit its groups now. The database stops at it before it names what sold
 * out, so this is asked first.
 */
export const choicesRefused = (
  data: DemoData,
  lines: readonly DraftLine[],
): boolean =>
  lines.some((line) => {
    const item = data.menu.items.find((i) => i.id === line.item);
    if (!item || data.soldOut.includes(item.id)) return false;
    return !checkPicks(twinGroups(item), line.choices).ok;
  });

/** The items of a draft sold out meanwhile, as the send refuses them. */
export const soldOutIn = (data: DemoData, items: readonly string[]) =>
  [...new Set(items)].filter((item) => data.soldOut.includes(item));

/**
 * Who looks at the twin, as the mode's frame says it, with the departments a
 * running prep screen shows (none, but `?state=screenOff`'s kitchen).
 */
export function twinFrame(
  viewer: TwinViewer,
  screens: readonly string[] = [],
): OrdersFrame {
  const departments = orderDemoDepartments.map((d) => d.key);
  const base: OrdersFrame = {
    business: "twin",
    userId: READER,
    viewing: false,
    takes: true,
    runs: true,
    clock: null,
    prepares: departments,
    own: [...READER_DEPARTMENTS],
    names: Object.fromEntries(orderDemoPeople.map((p) => [p.id, p.name])),
    departments: Object.fromEntries(
      orderDemoDepartments.map((d) => [d.key, d.name]),
    ),
    departmentOrder: departments,
    screens: [...screens],
    lateAfterMinutes: 15,
    timeZone: "Asia/Jerusalem",
  };
  switch (viewer) {
    case "noa":
      return {
        ...base,
        userId: "noa",
        takes: false,
        runs: false,
        prepares: ["kitchen"],
        own: ["kitchen"],
      };
    case "offClock":
    case "staleShift":
      return {
        ...base,
        userId: "yoav",
        runs: false,
        clock: viewer === "offClock" ? "clock" : "staleShift",
        prepares: [],
        own: [],
      };
    case "viewing":
      return { ...base, viewing: true };
    default:
      return base;
  }
}

/** The twin's departments, as a station names them. */
const stationDepartments = (): StationDepartment[] =>
  orderDemoDepartments.map((d) => ({
    id: d.key,
    name: d.name,
    archived: false,
  }));

/**
 * A kitchen's screen's tickets (P8a), as `public.station_order_prep` gives
 * them: of `department`, or of every one for null, with the departments by
 * name and the business's late mark. No price.
 */
export function twinStationPrep(
  data: DemoData,
  department: string | null,
  now: number,
  version = 1,
): StationPrep {
  const departments = department
    ? [department]
    : orderDemoDepartments.map((d) => d.key);
  return {
    version,
    now: iso(now),
    lateAfterMinutes: 15,
    department,
    departmentGone: false,
    departments: stationDepartments(),
    tickets: twinPrep(data, departments, now, version).tickets,
  };
}

/**
 * What a kitchen's screen marks sold out (P8a), as
 * `public.station_order_menu` gives it: the items that go to `department`
 * (every one's for null), with their category and whether they are
 * available. No price.
 */
export function twinStationMenu(
  data: DemoData,
  department: string | null,
  version = 1,
): StationMenu {
  return {
    version,
    items: data.menu.categories
      .filter((c) => department === null || c.department === department)
      .flatMap((c) =>
        data.menu.items
          .filter((item) => item.categoryId === c.id)
          .map((item) => ({
            id: item.id,
            name: item.name,
            category: { id: c.id, name: c.name },
            available: !data.soldOut.includes(item.id),
          })),
      ),
  };
}

/** An order as the till reads it (P8a): no label, no person, no total. */
function twinTillOrder(
  data: DemoData,
  order: Order,
  now: number,
): StationTillOrder | null {
  const detail = twinDetail(data, order.id, now);
  if (!detail) return null;
  const till = orderTill(detail);
  const tickets = order.rounds.flatMap((round) => round.tickets).filter(live);
  const cancelled = detail.status === "cancelled";
  return {
    id: detail.id,
    status: detail.status,
    place: detail.place,
    takeaway: detail.takeaway?.number ?? null,
    openedAt: detail.openedAt,
    reopenedAt: detail.reopenedAt,
    closedAt: detail.closedAt,
    cancelledAt: detail.cancelledAt,
    cancelReason: detail.cancelReason,
    closedHere: order.closedBy === "station" && detail.status === "closed",
    held: tickets.filter((ticket) => statusOf(ticket) === "held").length,
    ready: tickets.filter((ticket) => statusOf(ticket) === "ready").length,
    unserved:
      detail.status === "open"
        ? orderDemoDepartments
            .map((d) => d.key)
            .filter((key) =>
              tickets.some(
                (ticket) =>
                  ticket.department === key &&
                  (statusOf(ticket) === "new" || statusOf(ticket) === "ready"),
              ),
            )
        : [],
    byItem: cancelled ? [] : till.byItem,
    byRound: cancelled
      ? []
      : till.byRound.map((round) => ({
          id: round.id,
          sentAt: round.sentAt,
          lines: round.lines,
        })),
  };
}

/**
 * The till's orders (P8a), as `public.station_order_till` gives them: every
 * open one, oldest first, and this evening's closed and cancelled ones, the
 * newest first.
 */
export function twinStationTill(
  data: DemoData,
  now: number,
  version = 1,
): StationTill {
  const of = (orders: readonly Order[]) =>
    orders.flatMap((order) => {
      const read = twinTillOrder(data, order, now);
      return read ? [read] : [];
    });
  return {
    version,
    now: iso(now),
    day: DAY,
    departments: stationDepartments(),
    orders: of([...data.orders].sort((a, b) => a.openedAt - b.openedAt)),
    closed: of(
      [...data.closed].sort(
        (a, b) =>
          (b.cancelled?.at ?? b.closedAt ?? 0) -
          (a.cancelled?.at ?? a.closedAt ?? 0),
      ),
    ),
  };
}
