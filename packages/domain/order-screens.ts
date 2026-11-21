import {
  type ChoicePick,
  checkPicks,
  choiceRule,
  type MenuItem,
  type OptionGroup,
  type OrderPlace,
} from "./order-taking";
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
export type DraftChoice = ChoicePick;

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
  /** The picks, in the item's order (`orderedPicks`, P6). */
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
 * sold out meanwhile, "noRoute" for what no department prepares; "choices"
 * for choices the menu no longer has, which names no item, so the lines are
 * the ones whose picks don't fit the menu as the phone has it
 * (`staleChoiceLines`); nothing for any other refusal.
 */
export function refusalMark(
  failure: string,
): "soldOut" | "noRoute" | "choices" | null {
  if (failure === "unavailable") return "soldOut";
  if (failure === "route") return "noRoute";
  if (failure === "choices") return "choices";
  return null;
}

// Choices (P6): the item's sheet adds a line with its picks, and a line's
// picks are changed from the draft.

/** An item's choices, as the picks are read against them. */
type Choosing = Pick<MenuItem, "optionGroups">;

/** Where a pick is in the item: its group's place, then its option's; -1 for none. */
function placeOf(item: Choosing, pick: ChoicePick): [number, number] {
  const group = item.optionGroups.findIndex((g) => g.id === pick.group);
  const option =
    item.optionGroups[group]?.options.findIndex((o) => o.id === pick.option) ??
    -1;
  return [group, option];
}

const known = (item: Choosing, pick: ChoicePick) => placeOf(item, pick)[1] >= 0;

/**
 * Picks in the item's order, its groups' then their options' (picks it
 * doesn't have last, as they were): the order the send freezes them in, so
 * a round sends them as the server keeps them and two lines of the same
 * picks hold them alike.
 */
export function orderedPicks(
  item: Choosing,
  picks: readonly ChoicePick[],
): ChoicePick[] {
  const rank = (pick: ChoicePick) => {
    const [group, option] = placeOf(item, pick);
    return option < 0 ? Number.MAX_SAFE_INTEGER : group * 1000 + option;
  };
  return picks
    .map((pick, at) => ({ pick, at, rank: rank(pick) }))
    .sort((a, b) => a.rank - b.rank || a.at - b.at)
    .map(({ pick }) => ({ group: pick.group, option: pick.option }));
}

const pickKey = (pick: ChoicePick) => `${pick.group}\u0000${pick.option}`;

/** The same picks, in whatever order. */
export function samePicks(
  a: readonly ChoicePick[],
  b: readonly ChoicePick[],
): boolean {
  const keys = new Set(a.map(pickKey));
  return (
    a.length === b.length &&
    keys.size === new Set(b.map(pickKey)).size &&
    b.every((pick) => keys.has(pickKey(pick)))
  );
}

/** The picks the item still has, each once: what the sheet keeps of a line's. */
export function keepPicks(
  item: Choosing,
  picks: readonly ChoicePick[],
): ChoicePick[] {
  const seen = new Set<string>();
  return picks.filter((pick) => {
    const key = pickKey(pick);
    if (!known(item, pick) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The picks after an option of the group is switched on or off. A group of
 * one replaces the pick it had; one of more takes picks up to its most, and
 * past it changes nothing until one is switched off.
 */
export function toggleChoice(
  group: OptionGroup,
  picks: readonly ChoicePick[],
  option: string,
  on: boolean,
): ChoicePick[] {
  const rest = picks.filter(
    (pick) => !(pick.group === group.id && pick.option === option),
  );
  if (!on) return rest;
  const mine = rest.filter((pick) => pick.group === group.id);
  if (mine.length < group.max) return [...rest, { group: group.id, option }];
  if (group.max === 1) {
    return [
      ...rest.filter((pick) => pick.group !== group.id),
      { group: group.id, option },
    ];
  }
  return [...picks];
}

/** How many of the group's options are picked, each once, as `checkPicks` counts what the sheet keeps. */
export function pickedIn(
  group: OptionGroup,
  picks: readonly ChoicePick[],
): number {
  return new Set(
    picks
      .filter(
        (pick) =>
          pick.group === group.id &&
          group.options.some((option) => option.id === pick.option),
      )
      .map((pick) => pick.option),
  ).size;
}

/**
 * Whether a group's other options wait until one of its picks is switched
 * off: at its most, past one (a group of up to one replaces its pick
 * instead), and with an option still off. A group whose every option may be
 * picked together never waits, however many are on. Past its most is
 * `overGroups`, said in words of its own.
 */
export function groupFull(
  group: OptionGroup,
  picks: readonly ChoicePick[],
): boolean {
  if (group.max <= 1 || group.max >= group.options.length) return false;
  return pickedIn(group, picks) >= group.max;
}

/** The groups that still need a choice before the item is added: fewer than their least. */
export function missingGroups(
  item: Choosing,
  picks: readonly ChoicePick[],
): OptionGroup[] {
  return item.optionGroups.filter(
    (group) => pickedIn(group, picks) < group.min,
  );
}

/**
 * The groups with more picks than their most, as `checkPicks` refuses them
 * ("tooMany"): a line's picks after the menu lowered a group's most under
 * them, a group of one included. Nothing is added or saved until enough are
 * taken off, so the sheet never keeps what the send refuses: with none
 * missing and none over, what it keeps fits.
 */
export function overGroups(
  item: Choosing,
  picks: readonly ChoicePick[],
): OptionGroup[] {
  return item.optionGroups.filter(
    (group) => pickedIn(group, picks) > group.max,
  );
}

/**
 * What the sheet's action waits on, by what is done about it: groups to
 * choose in (fewer than their least, and a group of exactly one past its
 * most, whose radios show none and ask for one) and groups to take picks off
 * (any other group past its most, drawn as switches). Together they are
 * `missingGroups` and `overGroups`, each group once, in the item's order.
 */
export function waitingGroups(
  item: Choosing,
  picks: readonly ChoicePick[],
): { choose: OptionGroup[]; takeOff: OptionGroup[] } {
  const missing = missingGroups(item, picks);
  const over = overGroups(item, picks);
  const one = (group: OptionGroup) => choiceRule(group) === "one";
  return {
    choose: item.optionGroups.filter(
      (group) =>
        missing.includes(group) || (one(group) && over.includes(group)),
    ),
    takeOff: over.filter((group) => !one(group)),
  };
}

/**
 * The item's price with each picked option's, for the screen while picking:
 * what `unitAgorot` says once the picks fit, and before that what is picked
 * so far.
 */
export function picksAgorot(
  item: Pick<MenuItem, "priceAgorot" | "optionGroups">,
  picks: readonly ChoicePick[],
): number {
  return keepPicks(item, picks).reduce((sum, pick) => {
    const [group, option] = placeOf(item, pick);
    return sum + (item.optionGroups[group]?.options[option]?.priceAgorot ?? 0);
  }, item.priceAgorot);
}

/** The chosen options by name, in the item's order ("מדיום · גבינה"). */
export function choiceNames(
  item: Choosing,
  picks: readonly ChoicePick[],
): string[] {
  return orderedPicks(item, keepPicks(item, picks)).flatMap((pick) => {
    const [group, option] = placeOf(item, pick);
    const name = item.optionGroups[group]?.options[option]?.name;
    return name ? [name] : [];
  });
}

/**
 * The item added from its sheet with its picks: more of a plain line of the
 * same item and picks, in any order, up to a line's 99 (at 99 nothing
 * changes); else a new line, up to a round's 40. A line with a note, an
 * allergy or a hold is never added to.
 */
export function addChoiceLine(
  lines: readonly DraftLine[],
  item: Pick<MenuItem, "id" | "optionGroups">,
  picks: readonly ChoicePick[],
  quantity: number,
  newId: () => string,
): DraftLine[] {
  const count = Math.min(
    ORDER_CAPS.quantity,
    Math.max(1, Math.floor(quantity)),
  );
  const choices = orderedPicks(item, picks);
  const same = lines.find(
    (line) =>
      line.item === item.id &&
      !line.note &&
      !line.allergy &&
      !line.held &&
      samePicks(line.choices, choices),
  );
  if (same) {
    if (same.quantity >= ORDER_CAPS.quantity) return [...lines];
    return lines.map((line) =>
      line === same
        ? {
            ...line,
            quantity: Math.min(ORDER_CAPS.quantity, line.quantity + count),
          }
        : line,
    );
  }
  if (lines.length >= ORDER_CAPS.linesPerRound) return [...lines];
  return [
    ...lines,
    {
      id: newId(),
      item: item.id,
      quantity: count,
      note: null,
      allergy: false,
      held: false,
      choices,
    },
  ];
}

/** A line's picks, changed from its sheet: the line stays as it is otherwise. */
export function changeDraftChoices(
  lines: readonly DraftLine[],
  id: string,
  picks: readonly ChoicePick[],
): DraftLine[] {
  return lines.map((line) =>
    line.id === id ? { ...line, choices: [...picks] } : line,
  );
}

/**
 * The lines whose picks don't fit their item as the menu has it now (an
 * option gone, a group made required, a group gone): each says "לבחור שוב".
 * None for an item gone from the menu, which the send refuses on its own.
 */
export function staleChoiceLines(
  items: readonly Pick<MenuItem, "id" | "optionGroups">[],
  lines: readonly DraftLine[],
): string[] {
  return lines
    .filter((line) => {
      const item = items.find((candidate) => candidate.id === line.item);
      return item ? !checkPicks(item.optionGroups, line.choices).ok : false;
    })
    .map((line) => line.id);
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
 * What a tap on an item does: nothing while "soldOut" tonight or "noRoute"
 * when no department prepares it; "choose" with a choice that must be made,
 * which opens the item's choices (P6); otherwise "add", an item with only
 * optional choices added with none, which its line in the draft changes.
 */
export function pickState(
  item: Pick<MenuItem, "available" | "route" | "optionGroups">,
): "add" | "soldOut" | "noRoute" | "choose" {
  if (!item.available) return "soldOut";
  if (!item.route) return "noRoute";
  if (item.optionGroups.some((group) => group.min > 0)) return "choose";
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

/** Where a ticket is, as whoever sent it reads it. */
export type TicketStage = "held" | "sent" | "onScreen" | "ready" | "served";

/**
 * Where a ticket is, whatever is left of its lines: "held" waiting to be
 * called, "sent" and then "onScreen" once its department had it on a
 * screen, "ready", "served". Its badge and a line's sheet name it alike, so
 * one state has one name on the screen.
 */
export function ticketStage(ticket: {
  status: TicketStatus;
  kitchenSeenAt: string | null;
}): TicketStage {
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

/**
 * A ticket's state for whoever sent it, in words as well as colour: its
 * stage (`ticketStage`), or "none" when no line of it is live.
 */
export function ticketBadge(ticket: {
  status: TicketStatus;
  kitchenSeenAt: string | null;
  /** Its live lines. */
  lines: number;
}): TicketStage | "none" {
  if (ticket.lines === 0) return "none";
  return ticketStage(ticket);
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
 * The draft an order's sends go from (P5): its place's, or its takeaway's
 * own. The till reads the rounds of it still on their way, and waits for
 * them before a close, as the order's screen does.
 */
export function orderDraftKey(order: {
  id: string;
  place: { id: string } | null;
}): string {
  return order.place
    ? draftKey({ place: order.place.id })
    : draftKey({ takeaway: order.id });
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
