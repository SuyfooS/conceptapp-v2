import type {
  FloorOrder,
  MyOrders,
  OrderDetail,
  OrderFloor,
  OrderPrep,
  PrepLine,
  ReadyTicket,
  SentRound,
  TicketStatus,
} from "@domain/orders";
import type { OrdersFrame } from "../../(app)/orders/orders-types";
import {
  orderDemoDepartments,
  orderDemoPeople,
  READER,
  READER_DEPARTMENTS,
} from "./data";
import {
  type Order,
  type Place,
  type Round,
  type SentLine,
  TAKE_BACK_MINUTES,
  type Ticket,
  ticketCount,
} from "./model";
import type { DemoData, TwinViewer } from "./scenario";

/*
 * The twin's rows as the app's mode screens read them (waiter mode P4), as
 * real-menu.ts does for the menu: S0's store stays the one store, so what the
 * floor sends reaches the prep screen and comes back ready, and the real
 * screens draw it as the app does. Pure, so it is tested
 * (order-taking.test.ts). The twin's ids are words ("table-4"), which the
 * screens never read as more than keys.
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
    state: line.takenBack ? "takenBack" : "live",
  };
}

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
      movedAt: null,
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
                .filter((line) => !line.takenBack)
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
        status: "closed" as const,
        closedAt: iso(order.closedAt ?? now),
      };
    }),
    fixes: null,
    ready,
  };
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
  return {
    id: order.id,
    status: open ? "open" : "closed",
    day: DAY,
    place:
      place?.kind === "table" ? { id: place.id, name: place.name ?? "" } : null,
    takeaway:
      where.takeaway === null
        ? null
        : { number: where.takeaway, label: where.label },
    openedAt: iso(order.openedAt),
    openedBy: order.openedBy,
    closedAt: order.closedAt === null ? null : iso(order.closedAt),
    closedBy: order.closedBy,
    reopenedAt: null,
    reopenedBy: null,
    movedAt: null,
    movedBy: null,
    movedFrom: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
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
          choices: line.choices.map((option) => ({
            group: "",
            option,
            priceAgorot: 0,
          })),
          quantity: line.qty,
          note: line.allergy ?? line.note,
          allergy: line.allergy !== null,
          unitAgorot: line.unit,
          takenBackAt: line.takenBack ? iso(round.at) : null,
          cancelledAt: null,
          cancelReason: null,
          compedAt: null,
          compReason: null,
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
          orderStatus: data.orders.includes(order)
            ? ("open" as const)
            : ("closed" as const),
          sentAt: iso(round.at),
          tickets: round.tickets.map((ticket) => ({
            id: ticket.id,
            department: ticket.department,
            status: statusOf(ticket),
            held: ticket.held,
            kitchenSeenAt: ticket.seen ? iso(round.at) : null,
            readyAt: ticket.readyAt === null ? null : iso(ticket.readyAt),
            servedAt: servedAt(ticket, round),
            lines: ticket.lines.filter((line) => !line.takenBack).length,
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

/** The items of a draft sold out meanwhile, as the send refuses them. */
export const soldOutIn = (data: DemoData, items: readonly string[]) =>
  [...new Set(items)].filter((item) => data.soldOut.includes(item));

/** Who looks at the twin, as the mode's frame says it. */
export function twinFrame(viewer: TwinViewer): OrdersFrame {
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
