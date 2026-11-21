import type { MenuItem, OrderPlace } from "./order-taking";
import {
  type FloorOrder,
  type LineState,
  type MyOrders,
  ORDER_CAPS,
  type OrderDetail,
  type OrderFloor,
  type OrderLine,
  type OrderTicket,
  type RoundLine,
  type RoundTarget,
  type TicketStatus,
  ticketWait,
} from "./orders";

/**
 * Waiter mode's screens (P4): the rules they draw by, free of React and the
 * database, shared by the app's screens and the twins at
 * /design/order-taking. The draft lives on the phone; what it sends is a
 * round (`roundInput` in @domain/orders), which the database splits.
 */

/** A choice of a line: its group and option, by their ids in the item. */
export type DraftChoice = { group: string; option: string };

/** A line as the waiter builds it, before anything is sent. */
export type DraftLine = {
  id: string;
  item: string;
  quantity: number;
  /** One note per line; with `allergy`, it says what to avoid. */
  note: string | null;
  allergy: boolean;
  /** "לחכות עם זה": it goes in the held block, for a later course. */
  held: boolean;
  /** Empty in P4, whose picker adds only items with no required choice (P6). */
  choices: DraftChoice[];
};

/** How many items a draft holds, its lines' quantities added up. */
export const draftCount = (lines: readonly DraftLine[]) =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

/** A line one tap adds to: plain, nothing on it the waiter wrote. */
const plain = (line: DraftLine) =>
  line.choices.length === 0 && !line.note && !line.allergy && !line.held;

/**
 * One tap on an item: one more of a plain line of it, else a new line (up
 * to a round's 40 lines and a line's 99, as the send takes them; past
 * either, nothing changes).
 */
export function addToDraft(
  lines: readonly DraftLine[],
  item: string,
  newId: () => string,
): DraftLine[] {
  const same = lines.find((line) => line.item === item && plain(line));
  if (same) {
    if (same.quantity >= ORDER_CAPS.quantity) return [...lines];
    return lines.map((line) =>
      line === same ? { ...line, quantity: line.quantity + 1 } : line,
    );
  }
  if (lines.length >= ORDER_CAPS.linesPerRound) return [...lines];
  return [
    ...lines,
    {
      id: newId(),
      item,
      quantity: 1,
      note: null,
      allergy: false,
      held: false,
      choices: [],
    },
  ];
}

/** A line's quantity, note, allergy or hold, changed. A quantity stays 1 to 99. */
export function changeDraftLine(
  lines: readonly DraftLine[],
  id: string,
  change: Partial<Pick<DraftLine, "quantity" | "note" | "allergy" | "held">>,
): DraftLine[] {
  if (
    change.quantity !== undefined &&
    (!Number.isInteger(change.quantity) ||
      change.quantity < 1 ||
      change.quantity > ORDER_CAPS.quantity)
  ) {
    return [...lines];
  }
  return lines.map((line) => (line.id === id ? { ...line, ...change } : line));
}

/** A line taken off, and where it was, for its undo. */
export function removeDraftLine(
  lines: readonly DraftLine[],
  id: string,
): { lines: DraftLine[]; removed: { line: DraftLine; index: number } | null } {
  const index = lines.findIndex((line) => line.id === id);
  const line = lines[index];
  if (!line) return { lines: [...lines], removed: null };
  return {
    lines: lines.filter((_, at) => at !== index),
    removed: { line, index },
  };
}

/** The undo of a removal: the line where it was. */
export function putDraftLineBack(
  lines: readonly DraftLine[],
  line: DraftLine,
  index: number,
): DraftLine[] {
  const rest = lines.filter((l) => l.id !== line.id);
  rest.splice(Math.min(Math.max(index, 0), rest.length), 0, line);
  return rest;
}

/**
 * What one send takes of a draft: its first 40 lines, as a round holds
 * them. A draft holds more only after a refusal put a round's lines back in
 * front of what was added meanwhile (`putRefusedBack`); the rest wait for
 * the next send.
 */
export function roundOf(lines: readonly DraftLine[]): DraftLine[] {
  return lines.slice(0, ORDER_CAPS.linesPerRound);
}

/** The draft once a round of it went: only the lines it sent leave. */
export function withoutSent(
  lines: readonly DraftLine[],
  sent: readonly DraftLine[],
): DraftLine[] {
  const gone = new Set(sent.map((line) => line.id));
  return lines.filter((line) => !gone.has(line.id));
}

/**
 * A refused round's lines back at the front of their draft, before what was
 * added while it was on its way; a line already there is not put twice.
 */
export function putRefusedBack(
  lines: readonly DraftLine[],
  refused: readonly DraftLine[],
): DraftLine[] {
  const back = new Set(refused.map((line) => line.id));
  return [...refused, ...lines.filter((line) => !back.has(line.id))];
}

/**
 * How a refused send marks the draft's lines it names: "soldOut" for what
 * sold out meanwhile, "noRoute" for what no department prepares; nothing
 * for any other refusal.
 */
export function refusalMark(failure: string): "soldOut" | "noRoute" | null {
  if (failure === "unavailable") return "soldOut";
  if (failure === "route") return "noRoute";
  return null;
}

/**
 * Where a draft's items go, and how many to each ("מטבח · 3, בר · 1"): by
 * each item's route, in the order `departments` lists them, those it
 * doesn't after. An item with no route, or gone from the menu, counts
 * nowhere.
 */
export function draftRoutes(
  items: readonly Pick<MenuItem, "id" | "route">[],
  lines: readonly DraftLine[],
  departments: readonly string[] = [],
): { department: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const line of lines) {
    const route = items.find((item) => item.id === line.item)?.route;
    if (!route) continue;
    counts.set(route, (counts.get(route) ?? 0) + line.quantity);
  }
  const place = (id: string) => {
    const at = departments.indexOf(id);
    return at === -1 ? departments.length : at;
  };
  return [...counts]
    .map(([department, count]) => ({ department, count }))
    .sort((a, b) => place(a.department) - place(b.department));
}

/**
 * The draft as a round sends it: a note trimmed (none when empty), an
 * allergy only with its words, a hold, the choices.
 */
export function roundLinesOf(lines: readonly DraftLine[]): RoundLine[] {
  return lines.map((line) => {
    const note = line.note?.trim() || null;
    return {
      item: line.item,
      quantity: line.quantity,
      ...(note ? { note } : {}),
      ...(note && line.allergy ? { allergy: true } : {}),
      ...(line.held ? { held: true } : {}),
      ...(line.choices.length > 0 ? { choices: line.choices } : {}),
    };
  });
}

/**
 * Whether one tap adds an item: "soldOut" tonight, "noRoute" when no
 * department prepares it, "needsChoice" with a choice that must be made
 * (passed on by word of mouth until the choices' sheet, P6); otherwise
 * "add", an item with only optional choices added with none.
 */
export function pickState(
  item: Pick<MenuItem, "available" | "route" | "optionGroups">,
): "add" | "soldOut" | "noRoute" | "needsChoice" {
  if (!item.available) return "soldOut";
  if (!item.route) return "noRoute";
  if (item.optionGroups.some((group) => group.min > 0)) return "needsChoice";
  return "add";
}

/** A place's one state on the floor: free, ready to serve, waiting past the late mark, or open. */
export type PlaceState =
  | { kind: "free" }
  | { kind: "ready"; count: number }
  | { kind: "late"; minutes: number }
  | { kind: "open"; minutes: number };

const MINUTE = 60_000;

/** Whole minutes from `at` to `now`, never below 0. */
export function minutesSince(at: string | number | Date, now: number): number {
  return Math.max(0, Math.floor((now - new Date(at).getTime()) / MINUTE));
}

/**
 * A place's one state, in words as well as colour: ready to serve first
 * (how many tickets), then a ticket waiting past `lateAfterMinutes` (since
 * its oldest new ticket), then open, with the minutes since its last send.
 * An order with no round yet reads open since it opened.
 */
export function placeState(
  order: Pick<
    FloorOrder,
    "tickets" | "waitingSince" | "lastSentAt" | "openedAt"
  > | null,
  now: number,
  lateAfterMinutes: number,
): PlaceState {
  if (!order) return { kind: "free" };
  if (order.tickets.ready > 0) {
    return { kind: "ready", count: order.tickets.ready };
  }
  if (
    order.waitingSince &&
    ticketWait(
      new Date(order.waitingSince),
      new Date(now),
      lateAfterMinutes,
    ) !== "fresh"
  ) {
    return { kind: "late", minutes: minutesSince(order.waitingSince, now) };
  }
  return {
    kind: "open",
    minutes: minutesSince(order.lastSentAt ?? order.openedAt, now),
  };
}

/** The floor's status line: how many places are ready, waiting and open. */
export function floorStatus(states: readonly PlaceState[]): {
  ready: number;
  late: number;
  open: number;
} {
  return {
    ready: states.filter((s) => s.kind === "ready").length,
    late: states.filter((s) => s.kind === "late").length,
    open: states.filter((s) => s.kind !== "free").length,
  };
}

/**
 * How a place is named: a number takes the word ("שולחן 4"), a name stands
 * alone ("בר 3").
 */
export function placeTitleKind(name: string): "numbered" | "named" {
  return /^\d/.test(name.trim()) ? "numbered" : "named";
}

/**
 * A ticket's state for whoever sent it, in words as well as colour:
 * "held" waiting to be called, "sent" and then "onScreen" once its
 * department had it on a screen, "ready", "served"; "none" when no line of
 * it is live.
 */
export function ticketBadge(ticket: {
  status: TicketStatus;
  kitchenSeenAt: string | null;
  /** Its live lines. */
  lines: number;
}): "held" | "sent" | "onScreen" | "ready" | "served" | "none" {
  if (ticket.lines === 0) return "none";
  switch (ticket.status) {
    case "held":
      return "held";
    case "ready":
      return "ready";
    case "served":
      return "served";
    default:
      return ticket.kitchenSeenAt ? "onScreen" : "sent";
  }
}

/** How long a ticket has waited, and how late that is: calm, late, overdue. */
export function ticketAge(
  since: string,
  now: number,
  lateAfterMinutes: number,
): { minutes: number; tone: "calm" | "late" | "overdue" } {
  const wait = ticketWait(new Date(since), new Date(now), lateAfterMinutes);
  return {
    minutes: minutesSince(since, now),
    tone: wait === "veryLate" ? "overdue" : wait === "late" ? "late" : "calm",
  };
}

/** A ticket of one's own that turned ready, for the mode's toast. */
export type ReadyNews = {
  ticket: string;
  order: string;
  department: string;
  placeName: string | null;
  takeaway: number | null;
  readyAt: string;
};

/**
 * What turned ready since the last answer of "ההזמנות שלי", newest first:
 * none on the first answer (what was ready before the screen opened is on
 * it already), and only tickets with a live line that weren't ready before.
 * Never what was marked ready on this phone (`markedHere`): someone who
 * takes orders and prepares too said "מוכן" themselves, and was told so.
 * Nor a serve's "ביטול": a ticket served once it was ready is ready again
 * with the time it was ready at, which the person knew. One served before
 * anyone marked it ready goes back to new, and its "מוכן" since has a time
 * of its own: news.
 */
export function readyNews(
  before: MyOrders | null,
  after: MyOrders,
  markedHere: ReadonlySet<string> = new Set(),
): ReadyNews[] {
  if (!before) return [];
  const wasReady = new Set(markedHere);
  /** Served before, by the time it was ready at (its serve's, served new). */
  const servedReady = new Map<string, number>();
  for (const round of before.rounds) {
    for (const ticket of round.tickets) {
      if (ticket.status === "ready") wasReady.add(ticket.id);
      if (ticket.status === "served" && ticket.readyAt !== null) {
        servedReady.set(ticket.id, Date.parse(ticket.readyAt));
      }
    }
  }
  const unServed = (id: string, readyAt: string) =>
    servedReady.get(id) === Date.parse(readyAt);
  return after.rounds
    .flatMap((round) =>
      round.tickets
        .filter(
          (ticket) =>
            ticket.status === "ready" &&
            ticket.lines > 0 &&
            ticket.readyAt !== null &&
            !wasReady.has(ticket.id) &&
            !unServed(ticket.id, ticket.readyAt),
        )
        .map((ticket) => ({
          ticket: ticket.id,
          order: round.order,
          department: ticket.department,
          placeName: round.placeName,
          takeaway: round.takeaway,
          readyAt: ticket.readyAt ?? "",
        })),
    )
    .sort((a, b) => Date.parse(b.readyAt) - Date.parse(a.readyAt));
}

/** Where a draft waits on the phone: a place's, a new takeaway's, an open takeaway's. */
export function draftKey(
  target: { place: string } | { takeaway: string | null },
): string {
  if ("place" in target) return `place:${target.place}`;
  return target.takeaway ? `takeaway:${target.takeaway}` : "takeaway:new";
}

/**
 * Where a draft's send goes: an open order (with its place, so one moved
 * since is refused), a first send to a place, or a new takeaway with its
 * label.
 */
export function sendTarget(where: {
  order: string | null;
  place: string | null;
  label?: string | null;
}): RoundTarget {
  if (where.order) {
    return where.place
      ? { order: where.order, place: where.place }
      : { order: where.order };
  }
  if (where.place) return { place: where.place };
  const label = where.label?.trim();
  return label ? { takeaway: true, label } : { takeaway: true };
}

/** The mode's items, as the manifest names them. */
export type OrderModeItem = "places" | "mine" | "prep" | "menu";

/**
 * Which of the mode's items someone gets, from where they stand
 * (`public.order_mode`): the places and their own orders when they take
 * orders, preparing when a department they prepare for has items, the menu
 * for whoever runs it and whoever prepares (they mark sold out what their
 * department makes; default 5). None: no mode at all.
 */
export function orderModeItems(mode: {
  takes: boolean;
  runs: boolean;
  departments: readonly string[];
}): OrderModeItem[] {
  const prepares = mode.departments.length > 0;
  return [
    ...(mode.takes ? (["places", "mine"] as const) : []),
    ...(prepares ? (["prep"] as const) : []),
    ...(mode.runs || prepares ? (["menu"] as const) : []),
  ];
}

/**
 * Where the mode's ways in lead: the places for someone who takes orders,
 * preparing for someone who only prepares (default 6).
 */
export function orderModeEntry(mode: { takes: boolean }): "places" | "prep" {
  return mode.takes ? "places" : "prep";
}

// Fixing an order (P5)

/** What can be done to a sent line: cancel it, put it back, give it on the house, take that back. */
export type LineFix = "cancel" | "restore" | "comp" | "uncomp";

/**
 * What the line's sheet offers, as `public.cancel_order_line` and
 * `public.comp_order_line` decide it: nothing unless the order is open and
 * the person isn't viewing; a live line is cancelled while its ticket is
 * held or new, and once it is ready or served only by those who run orders
 * (for anyone else `readyLocked`, so the sheet says why), and given on the
 * house by those who run orders; a cancelled line is put back by the same
 * rule; a line on the house is taken off it by those who run orders; a line
 * taken back is done with.
 */
export function lineFixes(state: {
  order: Pick<OrderDetail, "status">;
  ticket: Pick<OrderTicket, "status">;
  /** Where the line is, as the screen shows it (`lineStateOf`, or a fix held). */
  line: LineState;
  runs: boolean;
  viewing: boolean;
}): { fixes: LineFix[]; readyLocked: boolean } {
  const none = { fixes: [], readyLocked: false };
  if (state.viewing || state.order.status !== "open") return none;
  const ready =
    state.ticket.status === "ready" || state.ticket.status === "served";
  const readyLocked = ready && !state.runs;
  switch (state.line) {
    case "live":
      return {
        fixes: [
          ...(readyLocked ? [] : (["cancel"] as const)),
          ...(state.runs ? (["comp"] as const) : []),
        ],
        readyLocked,
      };
    case "cancelled":
      return { fixes: readyLocked ? [] : ["restore"], readyLocked };
    case "comped":
      return { fixes: state.runs ? ["uncomp"] : [], readyLocked: false };
    default:
      return none;
  }
}

/** Neither taken back nor cancelled: what `public.close_order` asks of a held block. */
const stillSent = (line: Pick<OrderLine, "takenBackAt" | "cancelledAt">) =>
  line.takenBackAt === null && line.cancelledAt === null;

/**
 * What closing an order meets (`public.close_order`): `held` while a held
 * block with a line still sent waits to be called, which refuses it; and
 * the departments whose tickets aren't served yet, each once, in the
 * business's order, which the close then marks served.
 */
export function closeState(
  order: Pick<OrderDetail, "rounds">,
  departmentOrder: readonly string[] = [],
): { held: boolean; unserved: string[] } {
  const tickets = order.rounds
    .flatMap((round) => round.tickets)
    .filter((ticket) => ticket.lines.some(stillSent));
  const held = tickets.some((ticket) => ticket.status === "held");
  const unserved = [
    ...new Set(
      tickets
        .filter(
          (ticket) => ticket.status === "new" || ticket.status === "ready",
        )
        .map((ticket) => ticket.department),
    ),
  ];
  const place = (id: string) => {
    const at = departmentOrder.indexOf(id);
    return at === -1 ? departmentOrder.length : at;
  };
  return { held, unserved: unserved.sort((a, b) => place(a) - place(b)) };
}

/**
 * Whether a closed order opens again now (`public.reopen_order`): "open"
 * already, "cancelled" for good, "dayOver" once its business day ended,
 * "taken" while another open order is at its place (a takeaway never is),
 * else "ok".
 */
export function reopenState(
  order: Pick<OrderDetail, "id" | "status" | "day" | "place">,
  floor: Pick<OrderFloor, "day" | "orders">,
): "open" | "cancelled" | "dayOver" | "taken" | "ok" {
  if (order.status === "open") return "open";
  if (order.status === "cancelled") return "cancelled";
  if (order.day !== floor.day) return "dayOver";
  const at = order.place?.id ?? null;
  if (at && floor.orders.some((o) => o.place === at && o.id !== order.id)) {
    return "taken";
  }
  return "ok";
}

/** Where an order can move: the live places with no open order, but its own. */
export function freePlaces(
  places: readonly OrderPlace[],
  floor: Pick<OrderFloor, "orders">,
  current: string | null,
): OrderPlace[] {
  return places.filter(
    (place) =>
      place.id !== current &&
      !floor.orders.some((order) => order.place === place.id),
  );
}

/**
 * "נסגרו היום" on a phone or a tablet: the newest `shown` first (the read's
 * order, newest first), and the rest behind "הצגת כל".
 */
export function closedToday<T>(
  closed: readonly T[],
  shown = 5,
): { rows: T[]; rest: T[] } {
  return { rows: closed.slice(0, shown), rest: closed.slice(shown) };
}
