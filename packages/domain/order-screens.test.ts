import { describe, expect, it } from "vitest";
import {
  addToDraft,
  changeDraftLine,
  type DraftLine,
  draftCount,
  draftKey,
  draftRoutes,
  floorStatus,
  minutesSince,
  orderModeEntry,
  orderModeItems,
  pickState,
  placeState,
  placeTitleKind,
  putDraftLineBack,
  putRefusedBack,
  readyNews,
  refusalMark,
  removeDraftLine,
  roundLinesOf,
  roundOf,
  sendTarget,
  ticketAge,
  ticketBadge,
  withoutSent,
} from "./order-screens";
import type { MyOrders } from "./orders";

const HUMMUS = "00000000-0000-4000-8000-000000000001";
const LEMONADE = "00000000-0000-4000-8000-000000000002";
const KITCHEN = "00000000-0000-4000-8000-0000000000a1";
const BAR = "00000000-0000-4000-8000-0000000000a2";
const ORDER = "00000000-0000-4000-8000-0000000000b1";
const PLACE = "00000000-0000-4000-8000-0000000000c1";

let next = 0;
const newId = () => {
  next += 1;
  return `line-${next}`;
};

const line = (extra: Partial<DraftLine> = {}): DraftLine => ({
  id: newId(),
  item: HUMMUS,
  quantity: 1,
  note: null,
  allergy: false,
  held: false,
  choices: [],
  ...extra,
});

const NOW = Date.parse("2026-11-20T18:30:00Z");
const minutesAgo = (minutes: number) =>
  new Date(NOW - minutes * 60_000).toISOString();

describe("the draft", () => {
  it("adds one more of a plain line on a second tap, else a new line", () => {
    const one = addToDraft([], HUMMUS, newId);
    expect(one).toHaveLength(1);
    const two = addToDraft(one, HUMMUS, newId);
    expect(two).toEqual([{ ...one[0], quantity: 2 }]);
    // A line with a note, an allergy or a hold is its own: a new one comes.
    for (const own of [
      { note: "בלי שום" },
      { note: "בוטנים", allergy: true },
      { held: true },
    ]) {
      const noted = [line(own)];
      expect(addToDraft(noted, HUMMUS, newId)).toHaveLength(2);
    }
    expect(draftCount(addToDraft(two, LEMONADE, newId))).toBe(3);
  });

  it("stops at a line's 99 and a round's 40 lines, as the send takes them", () => {
    const full = [line({ quantity: 99 })];
    expect(addToDraft(full, HUMMUS, newId)).toEqual(full);
    const forty = Array.from({ length: 40 }, () => line({ held: true }));
    expect(addToDraft(forty, LEMONADE, newId)).toHaveLength(40);
  });

  it("changes a line's quantity only from 1 to 99", () => {
    const lines = [line()];
    const id = lines[0]?.id ?? "";
    expect(changeDraftLine(lines, id, { quantity: 5 })[0]?.quantity).toBe(5);
    expect(changeDraftLine(lines, id, { quantity: 0 })).toEqual(lines);
    expect(changeDraftLine(lines, id, { quantity: 100 })).toEqual(lines);
    expect(changeDraftLine(lines, id, { quantity: 1.5 })).toEqual(lines);
    expect(changeDraftLine(lines, id, { held: true })[0]?.held).toBe(true);
  });

  it("takes a line off and puts it back where it was, for the undo", () => {
    const lines = [line(), line({ item: LEMONADE }), line()];
    const taken = removeDraftLine(lines, lines[1]?.id ?? "");
    expect(taken.lines).toHaveLength(2);
    expect(taken.removed?.index).toBe(1);
    const back = taken.removed
      ? putDraftLineBack(taken.lines, taken.removed.line, taken.removed.index)
      : [];
    expect(back).toEqual(lines);
    expect(removeDraftLine(lines, "none").removed).toBeNull();
  });

  it("sends 40 lines at most and keeps the rest of the draft for the next send", () => {
    // A 30-line round refused while 15 lines were added: 45 in the draft.
    const refused = Array.from({ length: 30 }, () => line({ held: true }));
    const added = Array.from({ length: 15 }, () => line({ item: LEMONADE }));
    const draft = putRefusedBack(added, refused);
    expect(draft).toHaveLength(45);
    expect(draft.slice(0, 30)).toEqual(refused);
    const round = roundOf(draft);
    expect(round).toHaveLength(40);
    const left = withoutSent(draft, round);
    expect(left).toEqual(added.slice(10));
    // The next send takes what was left, and nothing is lost on the way.
    expect(withoutSent(left, roundOf(left))).toEqual([]);
  });

  it("puts a refused round back in front, never a line twice", () => {
    const sent = [line(), line({ item: LEMONADE })];
    const meanwhile = [line()];
    expect(putRefusedBack(meanwhile, sent)).toEqual([...sent, ...meanwhile]);
    expect(putRefusedBack([...sent, ...meanwhile], sent)).toEqual([
      ...sent,
      ...meanwhile,
    ]);
    // Only what was sent leaves: a line added while it went stays.
    expect(withoutSent([...sent, ...meanwhile], sent)).toEqual(meanwhile);
  });

  it("marks a refused line by why: sold out, or no department, else nothing", () => {
    expect(refusalMark("unavailable")).toBe("soldOut");
    expect(refusalMark("route")).toBe("noRoute");
    for (const other of ["taken", "closed", "clock", "failed", "place"]) {
      expect(refusalMark(other)).toBeNull();
    }
  });

  it("says where its items go, in the business's order of departments", () => {
    const items = [
      { id: HUMMUS, route: KITCHEN },
      { id: LEMONADE, route: BAR },
      { id: "gone", route: null },
    ];
    const lines = [
      line({ item: LEMONADE, quantity: 2 }),
      line({ quantity: 3 }),
      line({ item: "gone" }),
    ];
    expect(draftRoutes(items, lines, [KITCHEN, BAR])).toEqual([
      { department: KITCHEN, count: 3 },
      { department: BAR, count: 2 },
    ]);
  });

  it("sends a note trimmed, an allergy only with its words, and a hold", () => {
    expect(
      roundLinesOf([
        line({ note: "  בלי שום  " }),
        line({ note: "  ", allergy: true }),
        line({ note: "בוטנים", allergy: true, held: true, quantity: 2 }),
      ]),
    ).toEqual([
      { item: HUMMUS, quantity: 1, note: "בלי שום" },
      { item: HUMMUS, quantity: 1 },
      { item: HUMMUS, quantity: 2, note: "בוטנים", allergy: true, held: true },
    ]);
  });

  it("keys each draft by where it waits", () => {
    expect(draftKey({ place: PLACE })).toBe(`place:${PLACE}`);
    expect(draftKey({ takeaway: null })).toBe("takeaway:new");
    expect(draftKey({ takeaway: ORDER })).toBe(`takeaway:${ORDER}`);
  });

  it("sends to the open order with its place, a first send to the place, or a takeaway", () => {
    expect(sendTarget({ order: ORDER, place: PLACE })).toEqual({
      order: ORDER,
      place: PLACE,
    });
    expect(sendTarget({ order: ORDER, place: null })).toEqual({ order: ORDER });
    expect(sendTarget({ order: null, place: PLACE })).toEqual({ place: PLACE });
    expect(sendTarget({ order: null, place: null, label: " דנה " })).toEqual({
      takeaway: true,
      label: "דנה",
    });
    expect(sendTarget({ order: null, place: null, label: " " })).toEqual({
      takeaway: true,
    });
  });
});

describe("picking an item", () => {
  const item = (extra: Partial<Parameters<typeof pickState>[0]> = {}) =>
    pickState({ available: true, route: KITCHEN, optionGroups: [], ...extra });
  const group = (min: number) => ({
    id: "side",
    name: "תוספת",
    min,
    max: 1,
    options: [{ id: "fries", name: "צ'יפס", priceAgorot: 0 }],
  });

  it("adds a plain item, and one with only optional choices, with one tap", () => {
    expect(item()).toBe("add");
    expect(item({ optionGroups: [group(0)] })).toBe("add");
  });

  it("refuses one sold out, one going nowhere, and one with a choice to make", () => {
    expect(item({ available: false })).toBe("soldOut");
    expect(item({ route: null })).toBe("noRoute");
    expect(item({ optionGroups: [group(1)] })).toBe("needsChoice");
  });
});

describe("a place on the floor", () => {
  const order = (
    extra: Partial<Parameters<typeof placeState>[0] & object> = {},
  ) => ({
    tickets: { held: 0, new: 1, ready: 0, served: 0 },
    waitingSince: minutesAgo(5),
    lastSentAt: minutesAgo(5),
    openedAt: minutesAgo(10),
    ...extra,
  });

  it("is free with no order, ready first, then waiting past the late mark, then open", () => {
    expect(placeState(null, NOW, 15)).toEqual({ kind: "free" });
    expect(
      placeState(
        order({ tickets: { held: 0, new: 1, ready: 2, served: 0 } }),
        NOW,
        15,
      ),
    ).toEqual({ kind: "ready", count: 2 });
    expect(
      placeState(order({ waitingSince: minutesAgo(15) }), NOW, 15),
    ).toEqual({
      kind: "late",
      minutes: 15,
    });
    expect(
      placeState(order({ waitingSince: minutesAgo(14) }), NOW, 15),
    ).toEqual({
      kind: "open",
      minutes: 5,
    });
    expect(
      placeState(order({ waitingSince: null, lastSentAt: null }), NOW, 15),
    ).toEqual({ kind: "open", minutes: 10 });
  });

  it("counts the floor's status line: ready, waiting, and every place not free", () => {
    expect(
      floorStatus([
        { kind: "free" },
        { kind: "ready", count: 1 },
        { kind: "late", minutes: 20 },
        { kind: "open", minutes: 3 },
        { kind: "open", minutes: 4 },
      ]),
    ).toEqual({ ready: 1, late: 1, open: 4 });
  });

  it("takes the word for a number, and stands alone with a name", () => {
    expect(placeTitleKind("4")).toBe("numbered");
    expect(placeTitleKind(" 12א")).toBe("numbered");
    expect(placeTitleKind("בר 3")).toBe("named");
    expect(placeTitleKind("מרפסת")).toBe("named");
  });

  it("counts whole minutes, never below none", () => {
    expect(minutesSince(minutesAgo(6.9), NOW)).toBe(6);
    expect(minutesSince(new Date(NOW + 60_000).toISOString(), NOW)).toBe(0);
  });
});

describe("a ticket", () => {
  it("says where it is for whoever sent it, and nothing once no line is live", () => {
    const at = (status: "held" | "new" | "ready" | "served", seen = false) =>
      ticketBadge({
        status,
        kitchenSeenAt: seen ? minutesAgo(1) : null,
        lines: 1,
      });
    expect(at("held")).toBe("held");
    expect(at("new")).toBe("sent");
    expect(at("new", true)).toBe("onScreen");
    expect(at("ready")).toBe("ready");
    expect(at("served")).toBe("served");
    expect(ticketBadge({ status: "new", kitchenSeenAt: null, lines: 0 })).toBe(
      "none",
    );
  });

  it("is calm, late from the late mark, and overdue from twice it", () => {
    expect(ticketAge(minutesAgo(14), NOW, 15)).toEqual({
      minutes: 14,
      tone: "calm",
    });
    expect(ticketAge(minutesAgo(15), NOW, 15)).toEqual({
      minutes: 15,
      tone: "late",
    });
    expect(ticketAge(minutesAgo(30), NOW, 15)).toEqual({
      minutes: 30,
      tone: "overdue",
    });
  });
});

describe("what turned ready", () => {
  const mine = (
    tickets: {
      id: string;
      status: "new" | "ready" | "served";
      lines?: number;
      readyAt?: string;
    }[],
  ): MyOrders => ({
    version: 1,
    now: minutesAgo(0),
    day: "2026-11-20",
    rounds: [
      {
        id: "round",
        order: ORDER,
        placeName: "4",
        takeaway: null,
        orderStatus: "open",
        sentAt: minutesAgo(10),
        tickets: tickets.map((ticket) => ({
          id: ticket.id,
          department: KITCHEN,
          status: ticket.status,
          held: false,
          kitchenSeenAt: null,
          readyAt:
            ticket.status === "new" ? null : (ticket.readyAt ?? minutesAgo(1)),
          servedAt: ticket.status === "served" ? minutesAgo(0) : null,
          lines: ticket.lines ?? 1,
          items: [],
        })),
      },
    ],
  });

  it("is nothing on the first answer: what was ready is on the screen already", () => {
    expect(readyNews(null, mine([{ id: "a", status: "ready" }]))).toEqual([]);
  });

  it("is each ticket newly ready with a live line, newest first", () => {
    const before = mine([
      { id: "a", status: "new" },
      { id: "b", status: "ready" },
      { id: "c", status: "new" },
      { id: "d", status: "new" },
    ]);
    const after = mine([
      { id: "a", status: "ready", readyAt: minutesAgo(2) },
      { id: "b", status: "ready" },
      { id: "c", status: "ready", readyAt: minutesAgo(1), lines: 0 },
      { id: "d", status: "ready", readyAt: minutesAgo(0) },
    ]);
    expect(readyNews(before, after).map((news) => news.ticket)).toEqual([
      "d",
      "a",
    ]);
    expect(readyNews(after, mine([{ id: "a", status: "served" }]))).toEqual([]);
  });

  it("leaves out what was marked ready on this phone: its own toast said it", () => {
    // A barista who takes orders sent to the bar, then pressed "מוכן" on
    // its ticket: the sync's answer is no news to them.
    const before = mine([
      { id: "a", status: "new" },
      { id: "d", status: "new" },
    ]);
    const after = mine([
      { id: "a", status: "ready", readyAt: minutesAgo(0) },
      { id: "d", status: "ready", readyAt: minutesAgo(2) },
    ]);
    expect(
      readyNews(before, after, new Set(["a"])).map((news) => news.ticket),
    ).toEqual(["d"]);
    // Put back on this phone, and made ready again elsewhere: news again.
    expect(
      readyNews(before, after, new Set()).map((news) => news.ticket),
    ).toEqual(["a", "d"]);
  });

  it("is no news when a serve's ביטול makes it ready again, but is when it was served new", () => {
    // Bar ticket "a" was ready at 3 minutes ago and served: its "ביטול"
    // puts it back to ready, with the time it was ready at.
    const readyAt = minutesAgo(3);
    expect(
      readyNews(
        mine([{ id: "a", status: "served", readyAt }]),
        mine([{ id: "a", status: "ready", readyAt }]),
      ),
    ).toEqual([]);
    // "b" was served before anyone marked it ready (its time the serve's),
    // its "ביטול" put it back to new, and the bar has marked it ready since.
    expect(
      readyNews(
        mine([{ id: "b", status: "served", readyAt: minutesAgo(3) }]),
        mine([{ id: "b", status: "ready", readyAt: minutesAgo(1) }]),
      ).map((news) => news.ticket),
    ).toEqual(["b"]);
  });
});

describe("the mode's items", () => {
  it("gives a taker the places and their orders, a preparer preparing and the menu", () => {
    expect(
      orderModeItems({ takes: true, runs: false, departments: [] }),
    ).toEqual(["places", "mine"]);
    expect(
      orderModeItems({ takes: false, runs: false, departments: [KITCHEN] }),
    ).toEqual(["prep", "menu"]);
    expect(
      orderModeItems({ takes: true, runs: true, departments: [KITCHEN, BAR] }),
    ).toEqual(["places", "mine", "prep", "menu"]);
    expect(
      orderModeItems({ takes: true, runs: true, departments: [] }),
    ).toEqual(["places", "mine", "menu"]);
    expect(
      orderModeItems({ takes: false, runs: false, departments: [] }),
    ).toEqual([]);
  });

  it("leads a preparer alone to preparing", () => {
    expect(orderModeEntry({ takes: true })).toBe("places");
    expect(orderModeEntry({ takes: false })).toBe("prep");
  });
});
