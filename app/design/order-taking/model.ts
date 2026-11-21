// The order-taking demo's shapes and the rules it draws by (S0 of waiter
// mode, issue #191). Nothing here is stored: the demo keeps its rows in
// memory (demo-store.tsx), and P1 and P3 bring the real ones to the
// database, with `@domain/order-taking` in place of these helpers. Since P4
// the mode's screens are the app's, drawn from these rows by
// real-orders.ts, and since P5 its till too; the stations still draw them as
// S0 did (P8).

import type {
  CompReason,
  LineCancelReason,
  OrderCancelReason,
} from "@domain/orders";

export type DepartmentKey = "kitchen" | "bar";

export type Department = { key: DepartmentKey; name: string };

export type ChoiceOption = { id: string; name: string; price: number };

/** One choice on an item: required single (1 to 1), or extras (0 to n). */
export type ChoiceGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: ChoiceOption[];
};

export type Category = { id: string; name: string; department: DepartmentKey };

/** Prices in whole agorot, VAT included, as the business types them. */
export type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  price: number;
  groups: ChoiceGroup[];
};

export type Menu = { categories: Category[]; items: MenuItem[] };

export type Person = { id: string; name: string; photo: string | null };

/** A table, or a takeaway whose number comes with its first send. */
export type Place = {
  id: string;
  kind: "table" | "takeaway";
  /** A table's name ("4"); a takeaway's number once sent, else null. */
  name: string | null;
  /** A takeaway's few words to call the customer by. */
  label?: string | null;
};

/** A line as sent: the send copies its name, choices and price. */
export type SentLine = {
  id: string;
  itemId: string;
  name: string;
  choices: string[];
  /** The unit price: the item's with its options', frozen at the send. */
  unit: number;
  qty: number;
  note: string | null;
  allergy: string | null;
  /** Taken back by its sender within the window: struck through, not made. */
  takenBack: boolean;
  /** Cancelled with a reason (P5): struck through, not made, not rung up. */
  cancelled: Fix<LineCancelReason> | null;
  /** On the house with a reason (P5): made as usual, marked at the till. */
  comped: Fix<CompReason> | null;
};

/** A fix to the orders: why, when and by whom (P5). */
export type Fix<R extends string> = { reason: R; at: number; by: string };

export type TicketState = "new" | "ready" | "served";

/** One department's part of a round; a held block is a ticket of its own. */
export type Ticket = {
  id: string;
  department: DepartmentKey;
  held: boolean;
  state: TicketState;
  lines: SentLine[];
  /** A kitchen screen has it: "על המסך", not that a cook read it. */
  seen: boolean;
  /** When it was fired, for a held block once called. */
  firedAt: number | null;
  readyAt: number | null;
  /** Who marked it ready on a phone; a station names nobody. */
  readyBy: string | null;
};

export type Round = { id: string; at: number; by: string; tickets: Ticket[] };

export type Order = {
  id: string;
  placeId: string;
  openedBy: string;
  openedAt: number;
  rounds: Round[];
  closedAt: number | null;
  closedBy: string | null;
  /** Moved from another table (P5): the table it was at, when and by whom. */
  moved?: { from: string; at: number; by: string } | null;
  /** Opened again after a close (P5). */
  reopened?: { at: number; by: string } | null;
  /** Cancelled whole, for good (P5); it is closed then too, for the stations. */
  cancelled?: Fix<OrderCancelReason> | null;
};

/** After this long a ticket still new is late: `lateAfterMinutes`' default. */
export const LATE_AFTER_MINUTES = 15;
/** How long the sender may take a line back: `takeBackMinutes`' default. */
export const TAKE_BACK_MINUTES = 2;

const MINUTE = 60_000;

export function minutesSince(at: number, now: number): number {
  return Math.max(0, Math.floor((now - at) / MINUTE));
}

export function itemById(menu: Menu, id: string): MenuItem | undefined {
  return menu.items.find((item) => item.id === id);
}

export function departmentOf(menu: Menu, item: MenuItem): DepartmentKey {
  return (
    menu.categories.find((c) => c.id === item.categoryId)?.department ??
    "kitchen"
  );
}

/** The chosen options, in the item's own order. */
export function chosenOptions(
  item: MenuItem,
  choices: readonly string[],
): ChoiceOption[] {
  return item.groups.flatMap((group) =>
    group.options.filter((option) => choices.includes(option.id)),
  );
}

/** The item's price with its chosen options': what a line's unit costs. */
export function unitPrice(item: MenuItem, choices: readonly string[]): number {
  return chosenOptions(item, choices).reduce(
    (sum, option) => sum + option.price,
    item.price,
  );
}

/**
 * A group of exactly one choice, drawn as radios: one must be picked and
 * another replaces it. Any other group, an optional one of one option
 * included, is drawn with switches, so what was picked can be unpicked.
 */
export const singleChoice = (group: ChoiceGroup) =>
  group.min === 1 && group.max === 1;

/**
 * The choices after an option of the group is switched on or off. Past the
 * group's most, switching one on replaces the other where only one is
 * allowed, and otherwise changes nothing until one is switched off.
 */
export function toggleChoice(
  group: ChoiceGroup,
  choices: readonly string[],
  optionId: string,
  on: boolean,
): string[] {
  const rest = choices.filter((c) => c !== optionId);
  if (!on) return rest;
  const inGroup = group.options
    .map((option) => option.id)
    .filter((id) => rest.includes(id));
  if (inGroup.length < group.max) return [...rest, optionId];
  if (group.max === 1) {
    return [...rest.filter((c) => !inGroup.includes(c)), optionId];
  }
  return [...choices];
}

/** The groups that still need a choice before the item can be added. */
export function missingGroups(
  item: MenuItem,
  choices: readonly string[],
): ChoiceGroup[] {
  return item.groups.filter(
    (group) =>
      group.options.filter((option) => choices.includes(option.id)).length <
      group.min,
  );
}

/** A line still sent: neither taken back nor cancelled (on the house still is). */
export const lineLive = (line: SentLine) => !line.takenBack && !line.cancelled;

export const liveLines = (ticket: Ticket) => ticket.lines.filter(lineLive);

export const ticketCount = (ticket: Ticket) =>
  liveLines(ticket).reduce((sum, line) => sum + line.qty, 0);

/** A ticket still to make: nothing taken back left it empty. */
export const openTicket = (ticket: Ticket) =>
  ticket.state === "new" && ticketCount(ticket) > 0;

/** How long a ticket has waited: from its fire for a held block once called. */
export const ticketSince = (ticket: Ticket, round: Round) =>
  ticket.firedAt ?? round.at;

export type PlaceStatus =
  | { kind: "free" }
  | { kind: "ready"; count: number }
  | { kind: "late"; minutes: number }
  | { kind: "open"; minutes: number };

/**
 * A place's one state on the floor, in words as well as colour: ready to
 * serve first, then a ticket waiting past the late mark, then open with
 * the minutes since its last send.
 */
export function placeStatus(
  order: Order | undefined,
  now: number,
): PlaceStatus {
  if (!order) return { kind: "free" };
  const tickets = order.rounds.flatMap((round) =>
    round.tickets.map((ticket) => ({ ticket, round })),
  );
  const ready = tickets.filter(
    ({ ticket }) => ticket.state === "ready" && ticketCount(ticket) > 0,
  ).length;
  if (ready > 0) return { kind: "ready", count: ready };
  const waited = tickets
    .filter(({ ticket }) => !ticket.held && openTicket(ticket))
    .map(({ ticket, round }) => minutesSince(ticketSince(ticket, round), now));
  const longest = Math.max(0, ...waited);
  if (longest >= LATE_AFTER_MINUTES) return { kind: "late", minutes: longest };
  const last = order.rounds.at(-1)?.at ?? order.openedAt;
  return { kind: "open", minutes: minutesSince(last, now) };
}

/**
 * The takeaways the floor shows: each with an open order. A closed one
 * leaves the floor, so its number is never taken again; its list stays under
 * today's closed. A new one waits as a draft on the phone (P4).
 */
export function takeawaysOnFloor(
  takeaways: readonly Place[],
  orders: readonly Order[],
): Place[] {
  return takeaways.filter((place) =>
    orders.some((order) => order.placeId === place.id),
  );
}

/** Whether an order has a held block neither fired nor taken back. */
export const hasHeld = (order: Order) =>
  order.rounds.some((round) =>
    round.tickets.some(
      (ticket) => ticket.held && ticket.state === "new" && ticketCount(ticket),
    ),
  );

/** One line of the till's list by item: the same item, choices and price added up. */
export type TillItem = {
  key: string;
  name: string;
  choices: string[];
  unit: number;
  qty: number;
};

/** The order's lines for ringing up at the register, by item, with no total. */
export function tillByItem(order: Order): TillItem[] {
  const rows = new Map<string, TillItem>();
  for (const round of order.rounds) {
    for (const ticket of round.tickets) {
      for (const line of liveLines(ticket)) {
        const key = [line.itemId, ...line.choices, line.unit].join("|");
        const row = rows.get(key);
        if (row) row.qty += line.qty;
        else
          rows.set(key, {
            key,
            name: line.name,
            choices: line.choices,
            unit: line.unit,
            qty: line.qty,
          });
      }
    }
  }
  return [...rows.values()];
}

/** A round's lines for the till, whatever department made them. */
export const roundLines = (round: Round) =>
  round.tickets.flatMap((ticket) => liveLines(ticket));
