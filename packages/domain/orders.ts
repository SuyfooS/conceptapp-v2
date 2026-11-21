import { z } from "zod";
import { addDays, dateIn } from "./availability";
import { minutesOf } from "./hours";
import { choiceId, MAX_UNIT_AGOROT, typedName } from "./order-taking";
import { timeIn } from "./shabbat";

/**
 * Taking orders (waiter mode, P3): the orders as the database keeps them
 * (supabase/migrations/20261120000300_order_taking_orders.sql). A round is
 * what one phone sends at once, split into tickets, one per department that
 * prepares and per held block; each line keeps the item's name, unit price
 * and choices as they were when it was sent. Nothing adds money up (Orel's
 * decision 7): a line has its unit price and quantity, never a total. Pure:
 * the database decides every write, and this says the same to the screens.
 */

/** How much one send holds (`public.send_order_round` says the same). */
export const ORDER_CAPS = {
  /** Lines in one round (a 41st is refused, 54000). */
  linesPerRound: 40,
  /** One line's quantity. */
  quantity: 99,
  /** A line's note, in characters. */
  note: 120,
  /** A takeaway's label, in characters. */
  label: 20,
  /** Takeaways in one business day. */
  takeaway: 9999,
} as const;

/** The rules' numbers, as the database counts them. */
export const ORDER_RULES = {
  /** An open shift older than this doesn't count (decision 4). */
  shiftStaleHours: 16,
  /** Orders are taken this long after clocking out. */
  afterClockOutMinutes: 30,
  /** Two first sends to one place this close together join one order. */
  joinFirstRoundSeconds: 60,
  /** A ticket marked ready goes back to new within this. */
  readyUndoMinutes: 5,
  /**
   * Whoever closed an order takes the close back within this, what it
   * served back where it was (`public.undo_close_order`); after it, the
   * order only opens again, its tickets served.
   */
  closeUndoMinutes: 2,
  /** Notes and labels are erased this long after the order closes. */
  notesKeptDays: 2,
  /** Who sent a round is kept this long. */
  senderKeptDays: 30,
  /** How many items the send's first screen offers. */
  favourites: 8,
  /** Counted over this many days. */
  favouriteDays: 14,
} as const;

/** Why a line is cancelled. */
export const LINE_CANCEL_REASONS = [
  "guest",
  "mistake",
  "sold_out",
  "other",
] as const;
export type LineCancelReason = (typeof LINE_CANCEL_REASONS)[number];

/** Why a line is on the house. */
export const COMP_REASONS = ["make_good", "staff", "other"] as const;
export type CompReason = (typeof COMP_REASONS)[number];

/** Why a whole order is cancelled. */
export const ORDER_CANCEL_REASONS = ["guest", "mistake", "other"] as const;
export type OrderCancelReason = (typeof ORDER_CANCEL_REASONS)[number];

/** Where a ticket is: waiting to be called, at its department, ready, served. */
export const TICKET_STATUSES = ["held", "new", "ready", "served"] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const ORDER_STATUSES = ["open", "closed", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** A line as the kitchen sees it: still to make, taken back, or cancelled. */
export const PREP_LINE_STATES = ["live", "takenBack", "cancelled"] as const;
export type PrepLineState = (typeof PREP_LINE_STATES)[number];

const uuid = z.uuid();

/** Control characters, as Postgres's `[[:cntrl:]]` finds them in a note. */
const CONTROL = /[\p{Cc}\u2028\u2029]/u;

/** One line of typed text, trimmed, from 1 to `max` characters, as the database keeps a note. */
const oneLine = (max: number) =>
  typedName(max).refine((text) => !CONTROL.test(text), "One line of text");

// Sending

/** A line as a send gives it: the item, how many, and what goes with it. */
export const roundLine = z
  .strictObject({
    item: uuid,
    quantity: z.int().min(1).max(ORDER_CAPS.quantity),
    note: oneLine(ORDER_CAPS.note).nullable().optional(),
    /** An allergy, said in the note. */
    allergy: z.boolean().optional(),
    /** Waits with its block until it is called. */
    held: z.boolean().optional(),
    choices: z
      .array(z.strictObject({ group: choiceId, option: choiceId }))
      .optional(),
  })
  .refine((line) => !line.allergy || Boolean(line.note), {
    message: "An allergy says what in its note",
    path: ["note"],
  });

export type RoundLine = z.infer<typeof roundLine>;

/**
 * Where a send goes: an order the phone shows (with the place it shows it
 * at, so one moved since is refused), a first send to a place, or a takeaway.
 */
export const roundTarget = z.union([
  z.strictObject({ order: uuid, place: uuid.nullable().optional() }),
  z.strictObject({ place: uuid }),
  z.strictObject({
    takeaway: z.literal(true),
    label: oneLine(ORDER_CAPS.label).nullable().optional(),
  }),
]);

export type RoundTarget = z.infer<typeof roundTarget>;

/** A round as the phone sends it, keyed by the phone so a retry is the same round. */
export const roundInput = z.strictObject({
  key: uuid,
  target: roundTarget,
  lines: z.array(roundLine).min(1).max(ORDER_CAPS.linesPerRound),
});

export type RoundInput = z.infer<typeof roundInput>;

// Time

/**
 * The business day `at` falls on: its date in `timeZone`, the day before
 * until `dayEndsAt` ("05:00"). By the wall clock, as
 * `private.order_business_day` counts it, so a change of the clocks after
 * midnight never moves the day.
 */
export function orderDay(
  at: Date,
  timeZone: string,
  dayEndsAt: string,
): string {
  const date = dateIn(at, timeZone);
  return minutesOf(timeIn(at, timeZone)) < minutesOf(dayEndsAt)
    ? addDays(date, -1)
    : date;
}

/** Where a line is: still live, taken back, cancelled, or on the house. */
export type LineState = "live" | "takenBack" | "cancelled" | "comped";

/**
 * What the sender may do with a line now, in the order
 * `public.take_back_order_line` checks it: "open" to take it back; "done"
 * when it is no longer live; "notSender" for anyone else; "ownDepartment"
 * when the sender is on the staff of the department it went to (they cancel
 * it with a reason); "prepared" once someone of it marked it ready, even if
 * it went back to new; "window" once `minutes` after sending passed (none
 * at all for 0).
 */
export function takeBackState(state: {
  sentAt: Date;
  now: Date;
  minutes: number;
  ticket: { status: TicketStatus; prepared: boolean };
  isSender: boolean;
  senderInDepartment: boolean;
  line: LineState;
}): "open" | "window" | "prepared" | "ownDepartment" | "notSender" | "done" {
  if (!state.isSender) return "notSender";
  if (state.line !== "live") return "done";
  if (state.senderInDepartment) return "ownDepartment";
  if (
    state.ticket.prepared ||
    state.ticket.status === "ready" ||
    state.ticket.status === "served"
  ) {
    return "prepared";
  }
  if (
    state.minutes === 0 ||
    state.now.getTime() > state.sentAt.getTime() + state.minutes * 60_000
  ) {
    return "window";
  }
  return "open";
}

/**
 * Whether "החזרה מהשליחה" is offered: the line may be taken back now
 * (`takeBackState` "open"), with at least `holdMs` left in its window, so a
 * take-back the screen holds for its "ביטול" never lands after the window
 * closed.
 */
export function takeBackOffered(
  state: Parameters<typeof takeBackState>[0],
  holdMs: number,
): boolean {
  return (
    takeBackState(state) === "open" &&
    state.now.getTime() + holdMs <=
      state.sentAt.getTime() + state.minutes * 60_000
  );
}

/**
 * Whether `actor` may take a close back now, as `public.undo_close_order`
 * checks it: "ok" for whoever closed it, until `ORDER_RULES.closeUndoMinutes`
 * after the close; "window" for anyone else, or after that.
 */
export function closeUndoState(state: {
  closedAt: Date;
  closedBy: string | null;
  actor: string;
  now: Date;
}): "ok" | "window" {
  return state.closedBy === state.actor &&
    state.now.getTime() <=
      state.closedAt.getTime() + ORDER_RULES.closeUndoMinutes * 60_000
    ? "ok"
    : "window";
}

/**
 * How long a ticket has waited since it was sent (or called): "late" from
 * `lateAfterMinutes`, "veryLate" from twice that (§4.4 of the design).
 */
export function ticketWait(
  since: Date,
  now: Date,
  lateAfterMinutes: number,
): "fresh" | "late" | "veryLate" {
  const waited = now.getTime() - since.getTime();
  const late = lateAfterMinutes * 60_000;
  if (waited >= 2 * late) return "veryLate";
  if (waited >= late) return "late";
  return "fresh";
}

// Reading

const instant = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Expected a time");
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected a date");
const count = z.int().min(0);
const version = z.int().min(0);
const agorot = z.int().min(0).max(MAX_UNIT_AGOROT);
const takeaway = z.int().min(1).max(ORDER_CAPS.takeaway);

/** A round as the send answers it. */
export type SentRound = {
  round: string;
  order: string;
  sentAt: string;
  /** The order's first round: a new order, or one joined within a minute. */
  first: boolean;
  place: string | null;
  takeaway: number | null;
  tickets: { id: string; department: string; held: boolean }[];
};

export const sentRoundSchema = z.object({
  round: uuid,
  order: uuid,
  sentAt: instant,
  first: z.boolean(),
  place: uuid.nullable(),
  takeaway: takeaway.nullable(),
  tickets: z.array(z.object({ id: uuid, department: uuid, held: z.boolean() })),
}) satisfies z.ZodType<SentRound>;

/** A line as the kitchen reads it: no price at all. */
export type PrepLine = {
  id: string;
  name: string;
  /** Each choice by its name. */
  choices: string[];
  quantity: number;
  note: string | null;
  allergy: boolean;
  state: PrepLineState;
};

// Strict, so a price that reached a line without one fails to parse.
export const prepLineSchema = z.strictObject({
  id: uuid,
  name: z.string(),
  choices: z.array(z.string()),
  quantity: z.int().min(1).max(ORDER_CAPS.quantity),
  note: z.string().nullable(),
  allergy: z.boolean(),
  state: z.enum(PREP_LINE_STATES),
}) satisfies z.ZodType<PrepLine>;

/**
 * A ticket ready to serve, on the floor (P4): where it goes, who sent it (on
 * an order of today only) and its live lines, no price.
 */
export type ReadyTicket = {
  ticket: string;
  order: string;
  department: string;
  placeName: string | null;
  takeaway: number | null;
  readyAt: string;
  sentBy: string | null;
  lines: Omit<PrepLine, "state">[];
};

const readyTicketSchema = z.strictObject({
  ticket: uuid,
  order: uuid,
  department: uuid,
  placeName: z.string().nullable(),
  takeaway: takeaway.nullable(),
  readyAt: instant,
  sentBy: uuid.nullable(),
  lines: z.array(prepLineSchema.omit({ state: true })),
}) satisfies z.ZodType<ReadyTicket>;

/** An open order on the floor. No money. */
export type FloorOrder = {
  id: string;
  place: string | null;
  placeName: string | null;
  takeaway: number | null;
  label: string | null;
  openedAt: string;
  /** Who opened it, on an order of today's business day only. */
  openedBy: string | null;
  movedAt: string | null;
  lastSentAt: string | null;
  rounds: number;
  /** Its tickets with a line still live, by where they are. */
  tickets: Record<TicketStatus, number>;
  /** Since when its oldest new ticket waits. */
  waitingSince: string | null;
  /** A new ticket nobody of its department saw yet. */
  unseen: boolean;
};

export type OrderFloor = {
  version: number;
  now: string;
  day: string;
  /** The reader runs orders: they fix anything, and see today's fixes. */
  runs: boolean;
  orders: FloorOrder[];
  /** Today's closed and cancelled orders. */
  closed: {
    id: string;
    placeName: string | null;
    takeaway: number | null;
    status: Exclude<OrderStatus, "open">;
    closedAt: string;
  }[];
  /** How many lines were taken back, cancelled and given on the house today. */
  fixes: { takenBack: number; cancelled: number; comped: number } | null;
  /** Every waiter's tickets ready to serve, oldest first (P4). */
  ready: ReadyTicket[];
};

export const orderFloorSchema = z.object({
  version,
  now: instant,
  day,
  runs: z.boolean(),
  orders: z.array(
    z.object({
      id: uuid,
      place: uuid.nullable(),
      placeName: z.string().nullable(),
      takeaway: takeaway.nullable(),
      label: z.string().nullable(),
      openedAt: instant,
      openedBy: uuid.nullable(),
      movedAt: instant.nullable(),
      lastSentAt: instant.nullable(),
      rounds: count,
      tickets: z.object({
        held: count,
        new: count,
        ready: count,
        served: count,
      }),
      waitingSince: instant.nullable(),
      unseen: z.boolean(),
    }),
  ),
  closed: z.array(
    z.object({
      id: uuid,
      placeName: z.string().nullable(),
      takeaway: takeaway.nullable(),
      status: z.enum(["closed", "cancelled"]),
      closedAt: instant,
    }),
  ),
  fixes: z
    .object({ takenBack: count, cancelled: count, comped: count })
    .nullable(),
  // Until 20261121000100 reaches a project, P3's answer has none.
  ready: z.array(readyTicketSchema).default([]),
}) satisfies z.ZodType<OrderFloor>;

/** A line of an order, as it was sent, and what happened to it since. */
export type OrderLine = {
  id: string;
  item: string;
  name: string;
  /** Each choice by its group's name and its own, and what it adds. */
  choices: { group: string; option: string; priceAgorot: number }[];
  quantity: number;
  note: string | null;
  allergy: boolean;
  unitAgorot: number;
  takenBackAt: string | null;
  cancelledAt: string | null;
  cancelReason: LineCancelReason | null;
  compedAt: string | null;
  compReason: CompReason | null;
};

export type OrderTicket = {
  id: string;
  department: string;
  status: TicketStatus;
  held: boolean;
  firedAt: string | null;
  kitchenSeenAt: string | null;
  readyAt: string | null;
  servedAt: string | null;
  /** Someone of its department marked it ready once: it can't be taken back. */
  prepared: boolean;
  lines: OrderLine[];
};

/** An order whole. Unit prices, never a sum. */
export type OrderDetail = {
  id: string;
  status: OrderStatus;
  day: string;
  place: { id: string; name: string } | null;
  takeaway: { number: number; label: string | null } | null;
  openedAt: string;
  openedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  reopenedAt: string | null;
  reopenedBy: string | null;
  movedAt: string | null;
  movedBy: string | null;
  /** The place it was moved from, by its name. */
  movedFrom: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancelReason: OrderCancelReason | null;
  now: string;
  takeBackMinutes: number;
  rounds: {
    id: string;
    sentAt: string;
    sentBy: string | null;
    tickets: OrderTicket[];
  }[];
};

const placeRef = z.object({ id: uuid, name: z.string() });
const takeawayRef = z.object({
  number: takeaway,
  label: z.string().nullable(),
});

export const orderDetailSchema = z.object({
  id: uuid,
  status: z.enum(ORDER_STATUSES),
  day,
  place: placeRef.nullable(),
  takeaway: takeawayRef.nullable(),
  openedAt: instant,
  openedBy: uuid.nullable(),
  closedAt: instant.nullable(),
  closedBy: uuid.nullable(),
  reopenedAt: instant.nullable(),
  reopenedBy: uuid.nullable(),
  movedAt: instant.nullable(),
  movedBy: uuid.nullable(),
  movedFrom: z.string().nullable(),
  cancelledAt: instant.nullable(),
  cancelledBy: uuid.nullable(),
  cancelReason: z.enum(ORDER_CANCEL_REASONS).nullable(),
  now: instant,
  takeBackMinutes: z.int().min(0),
  rounds: z.array(
    z.object({
      id: uuid,
      sentAt: instant,
      sentBy: uuid.nullable(),
      tickets: z.array(
        z.object({
          id: uuid,
          department: uuid,
          status: z.enum(TICKET_STATUSES),
          held: z.boolean(),
          firedAt: instant.nullable(),
          kitchenSeenAt: instant.nullable(),
          readyAt: instant.nullable(),
          servedAt: instant.nullable(),
          prepared: z.boolean(),
          lines: z.array(
            z.object({
              id: uuid,
              item: uuid,
              name: z.string(),
              choices: z.array(
                z.object({
                  group: z.string(),
                  option: z.string(),
                  priceAgorot: agorot,
                }),
              ),
              quantity: z.int().min(1).max(ORDER_CAPS.quantity),
              note: z.string().nullable(),
              allergy: z.boolean(),
              unitAgorot: agorot,
              takenBackAt: instant.nullable(),
              cancelledAt: instant.nullable(),
              cancelReason: z.enum(LINE_CANCEL_REASONS).nullable(),
              compedAt: instant.nullable(),
              compReason: z.enum(COMP_REASONS).nullable(),
            }),
          ),
        }),
      ),
    }),
  ),
}) satisfies z.ZodType<OrderDetail>;

/** A line to ring up: its name and choices, unit price and quantity. */
export type TillLine = {
  name: string;
  choices: string[];
  unitAgorot: number;
  quantity: number;
  comped: boolean;
};

/** What to ring up for an order: by item and by round. No total: the till adds it up. */
export type OrderTill = {
  id: string;
  status: OrderStatus;
  place: { id: string; name: string } | null;
  takeaway: { number: number; label: string | null } | null;
  /** Identical live lines together, their quantities added. */
  byItem: TillLine[];
  byRound: {
    id: string;
    sentAt: string;
    sentBy: string | null;
    lines: TillLine[];
  }[];
};

const tillLine = z.object({
  name: z.string(),
  choices: z.array(z.string()),
  unitAgorot: agorot,
  quantity: z.int().min(1),
  comped: z.boolean(),
});

export const orderTillSchema = z.object({
  id: uuid,
  status: z.enum(ORDER_STATUSES),
  place: placeRef.nullable(),
  takeaway: takeawayRef.nullable(),
  byItem: z.array(tillLine),
  byRound: z.array(
    z.object({
      id: uuid,
      sentAt: instant,
      sentBy: uuid.nullable(),
      lines: z.array(tillLine),
    }),
  ),
}) satisfies z.ZodType<OrderTill>;

/** Where a line of an order is now: taken back first, as the database refuses in that order. */
export function lineStateOf(
  line: Pick<OrderLine, "takenBackAt" | "cancelledAt" | "compedAt">,
): LineState {
  if (line.takenBackAt) return "takenBack";
  if (line.cancelledAt) return "cancelled";
  if (line.compedAt) return "comped";
  return "live";
}

/** A line the till rings up: neither taken back nor cancelled (on the house too, marked). */
const rungUp = (line: OrderLine) =>
  line.takenBackAt === null && line.cancelledAt === null;

const tillLineOf = (line: OrderLine): TillLine => ({
  name: line.name,
  choices: line.choices.map((choice) => choice.option),
  unitAgorot: line.unitAgorot,
  quantity: line.quantity,
  comped: line.compedAt !== null,
});

/**
 * What to ring up for an order, from the order whole (P5), as
 * `public.order_till` groups it: identical lines (name, choices, unit price,
 * on the house or not) together by item with their quantities added, in the
 * order they were first sent; and each round's lines as they were sent.
 * Taken back and cancelled lines are left out. The phones draw the till from
 * this, so it stays current with the mode's sync; the till's station reads
 * `station_order_till` (P8a), which groups them the same, and
 * modules/order_taking/till.db.test.ts and stations.db.test.ts hold them
 * alike. No total: the till adds it up.
 */
export function orderTill(order: OrderDetail): OrderTill {
  const byItem = new Map<string, TillLine>();
  const byRound = order.rounds.map((round) => {
    const lines = round.tickets
      .flatMap((ticket) => ticket.lines)
      .filter(rungUp)
      .map(tillLineOf);
    for (const line of lines) {
      const key = JSON.stringify([
        line.name,
        line.choices,
        line.unitAgorot,
        line.comped,
      ]);
      const same = byItem.get(key);
      byItem.set(
        key,
        same ? { ...same, quantity: same.quantity + line.quantity } : line,
      );
    }
    return {
      id: round.id,
      sentAt: round.sentAt,
      sentBy: round.sentBy,
      lines,
    };
  });
  return {
    id: order.id,
    status: order.status,
    place: order.place,
    takeaway: order.takeaway,
    byItem: [...byItem.values()],
    byRound,
  };
}

/**
 * How many items a whole order's cancel cancels, as its sheet says before
 * it: the quantities of the lines still live, neither taken back, cancelled
 * nor on the house, which `public.cancel_order` cancels. Two coffees on one
 * line are two.
 */
export function liveItemCount(order: Pick<OrderDetail, "rounds">): number {
  return order.rounds
    .flatMap((round) => round.tickets)
    .flatMap((ticket) => ticket.lines)
    .filter((line) => lineStateOf(line) === "live")
    .reduce((sum, line) => sum + line.quantity, 0);
}

/** The reader's own rounds of today, those with a ticket ready first. */
export type MyOrders = {
  version: number;
  now: string;
  day: string;
  rounds: {
    id: string;
    order: string;
    placeName: string | null;
    takeaway: number | null;
    orderStatus: OrderStatus;
    sentAt: string;
    tickets: {
      id: string;
      department: string;
      status: TicketStatus;
      held: boolean;
      kitchenSeenAt: string | null;
      readyAt: string | null;
      servedAt: string | null;
      /** How many of its lines are still live. */
      lines: number;
      /** Its lines, as the kitchen reads them: no price (P4). */
      items: PrepLine[];
    }[];
  }[];
};

export const myOrdersSchema = z.object({
  version,
  now: instant,
  day,
  rounds: z.array(
    z.object({
      id: uuid,
      order: uuid,
      placeName: z.string().nullable(),
      takeaway: takeaway.nullable(),
      orderStatus: z.enum(ORDER_STATUSES),
      sentAt: instant,
      tickets: z.array(
        z.object({
          id: uuid,
          department: uuid,
          status: z.enum(TICKET_STATUSES),
          held: z.boolean(),
          kitchenSeenAt: instant.nullable(),
          readyAt: instant.nullable(),
          servedAt: instant.nullable(),
          lines: count,
          // Until 20261121000100 reaches a project, P3's answer has none.
          items: z.array(prepLineSchema).default([]),
        }),
      ),
    }),
  ),
}) satisfies z.ZodType<MyOrders>;

/** A ticket as the kitchen sees it: no price at all. */
export type PrepTicket = {
  id: string;
  order: string;
  department: string;
  placeName: string | null;
  takeaway: number | null;
  status: TicketStatus;
  sentAt: string;
  firedAt: string | null;
  readyAt: string | null;
  sentBy: string | null;
  lines: PrepLine[];
};

export type OrderPrep = {
  version: number;
  now: string;
  /** The departments the reader prepares for. */
  departments: string[];
  tickets: PrepTicket[];
};

/**
 * A ticket of the kitchen's read, strict, so a price or a label that reached
 * it fails to parse; the stations read the same (@domain/order-stations).
 */
export const prepTicketSchema = z.strictObject({
  id: uuid,
  order: uuid,
  department: uuid,
  placeName: z.string().nullable(),
  takeaway: takeaway.nullable(),
  status: z.enum(TICKET_STATUSES),
  sentAt: instant,
  firedAt: instant.nullable(),
  readyAt: instant.nullable(),
  sentBy: uuid.nullable(),
  lines: z.array(prepLineSchema),
}) satisfies z.ZodType<PrepTicket>;

// Strict, so a price that reached the kitchen's read fails to parse.
export const orderPrepSchema = z.strictObject({
  version,
  now: instant,
  departments: z.array(uuid),
  tickets: z.array(prepTicketSchema),
}) satisfies z.ZodType<OrderPrep>;

/** The items most ordered lately, for the send's first screen. */
export type Favourites = { items: string[] };

export const favouritesSchema = z.object({
  items: z.array(uuid).max(ORDER_RULES.favourites),
}) satisfies z.ZodType<Favourites>;

/**
 * Where the signed-in person stands in the mode (`public.order_mode`, P4):
 * whether they take orders, run them, and the clock's refusal for a taker
 * off a shift; the live departments they prepare for that an item goes to;
 * their own tickets of today ready and being made; what waits in those
 * departments; how many items are sold out; and the live departments a
 * running prep screen shows (P8b). Counts and ids only.
 */
export type OrderMode = {
  version: number;
  takes: boolean;
  runs: boolean;
  viewing: boolean;
  clock: "clock" | "staleShift" | null;
  departments: string[];
  ready: number;
  making: number;
  waiting: { department: string; count: number }[];
  soldOut: number;
  /**
   * The live departments a running prep screen shows, its own or every
   * one's: a ticket of one that no screen fetched in 2 minutes says "המסך
   * לא מחובר" (P8b).
   */
  screens: string[];
};

// Strict, so a person or a price that reached it fails to parse. `screens`
// is none until P8b's migration reaches the project.
export const orderModeSchema = z
  .strictObject({
    version,
    takes: z.boolean(),
    runs: z.boolean(),
    viewing: z.boolean(),
    clock: z.enum(["clock", "stale_shift"]).nullable(),
    departments: z.array(uuid),
    ready: count,
    making: count,
    waiting: z.array(z.strictObject({ department: uuid, count })),
    soldOut: count,
    screens: z.array(uuid).default([]),
  })
  .transform(
    (mode): OrderMode => ({
      ...mode,
      clock: mode.clock === "stale_shift" ? "staleShift" : mode.clock,
    }),
  );
