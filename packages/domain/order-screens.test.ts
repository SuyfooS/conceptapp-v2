import { describe, expect, it } from "vitest";
import {
  addChoiceLine,
  addToDraft,
  changeDraftChoices,
  changeDraftLine,
  choiceNames,
  closedToday,
  closeState,
  type DraftLine,
  draftCount,
  draftKey,
  draftRoutes,
  floorStatus,
  freePlaces,
  groupFull,
  keepPicks,
  lineFixes,
  minutesSince,
  missingGroups,
  orderDraftKey,
  orderedPicks,
  orderModeEntry,
  orderModeItems,
  pickState,
  picksAgorot,
  placeState,
  placeTitleKind,
  putDraftLineBack,
  putRefusedBack,
  readyNews,
  refusalMark,
  removeDraftLine,
  reopenState,
  roundLinesOf,
  roundOf,
  samePicks,
  sendTarget,
  staleChoiceLines,
  ticketAge,
  ticketBadge,
  ticketStage,
  toggleChoice,
  withoutSent,
} from "./order-screens";
import { checkPicks, type OptionGroup, unitAgorot } from "./order-taking";
import type { MyOrders, OrderDetail, OrderFloor } from "./orders";

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

  it("finds the draft an order's sends go from: its place's, or its takeaway's", () => {
    expect(orderDraftKey({ id: ORDER, place: { id: PLACE } })).toBe(
      draftKey({ place: PLACE }),
    );
    expect(orderDraftKey({ id: ORDER, place: null })).toBe(
      draftKey({ takeaway: ORDER }),
    );
    // Never the new takeaway's: an order has its own.
    expect(orderDraftKey({ id: ORDER, place: null })).not.toBe(
      draftKey({ takeaway: null }),
    );
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

  it("refuses one sold out and one going nowhere, and opens the choices of one with a choice to make", () => {
    expect(item({ available: false })).toBe("soldOut");
    expect(item({ route: null })).toBe("noRoute");
    expect(item({ optionGroups: [group(1)] })).toBe("choose");
  });
});

// The demo restaurant's burger and salad (P6's seed): a required doneness,
// up to two extras; and only optional extras.
const doneness: OptionGroup = {
  id: "doneness",
  name: "מידת עשייה",
  min: 1,
  max: 1,
  options: [
    { id: "mr", name: "מדיום רייר", priceAgorot: 0 },
    { id: "m", name: "מדיום", priceAgorot: 0 },
    { id: "mw", name: "מדיום וול", priceAgorot: 0 },
    { id: "wd", name: "וול דאן", priceAgorot: 0 },
  ],
};
const extras: OptionGroup = {
  id: "extras",
  name: "תוספות",
  min: 0,
  max: 2,
  options: [
    { id: "egg", name: "ביצה", priceAgorot: 600 },
    { id: "cheese", name: "גבינה", priceAgorot: 600 },
  ],
};
const BURGER = "00000000-0000-4000-8000-000000000003";
const SALAD = "00000000-0000-4000-8000-000000000004";
const burger = {
  id: BURGER,
  priceAgorot: 6800,
  optionGroups: [doneness, extras],
};
const saladExtras: OptionGroup = {
  id: "extras",
  name: "תוספות",
  min: 0,
  max: 2,
  options: [
    { id: "feta", name: "פטה", priceAgorot: 600 },
    { id: "egg", name: "ביצה קשה", priceAgorot: 500 },
  ],
};
const salad = { id: SALAD, priceAgorot: 3600, optionGroups: [saladExtras] };
const pick = (group: string, option: string) => ({ group, option });
const medium = pick("doneness", "m");
const cheese = pick("extras", "cheese");
const egg = pick("extras", "egg");
const withBacon: OptionGroup = {
  ...extras,
  options: [
    ...extras.options,
    { id: "bacon", name: "בייקון", priceAgorot: 900 },
  ],
};

describe("choosing (P6)", () => {
  it("puts picks in the item's order, its groups' then their options'", () => {
    expect(orderedPicks(burger, [cheese, egg, medium])).toEqual([
      medium,
      egg,
      cheese,
    ]);
    // What the item doesn't have goes last, as it was.
    expect(orderedPicks(burger, [pick("size", "x"), cheese, medium])).toEqual([
      medium,
      cheese,
      pick("size", "x"),
    ]);
    expect(samePicks([cheese, medium], [medium, cheese])).toBe(true);
    expect(samePicks([cheese, medium], [medium])).toBe(false);
    expect(samePicks([cheese, cheese], [cheese, medium])).toBe(false);
  });

  it("keeps only the picks the item still has, each once", () => {
    expect(
      keepPicks(burger, [medium, pick("doneness", "gone"), medium, cheese]),
    ).toEqual([medium, cheese]);
    expect(keepPicks({ optionGroups: [] }, [medium])).toEqual([]);
  });

  it("replaces a pick of one, and takes picks of more up to the most", () => {
    const rare = pick("doneness", "mr");
    expect(toggleChoice(doneness, [rare, cheese], "m", true)).toEqual([
      cheese,
      medium,
    ]);
    expect(toggleChoice(doneness, [medium], "m", false)).toEqual([]);
    const two = toggleChoice(extras, [egg], "cheese", true);
    expect(two).toEqual([egg, cheese]);
    // At two, a third changes nothing until one goes.
    expect(toggleChoice(withBacon, two, "bacon", true)).toEqual(two);
    expect(toggleChoice(withBacon, two, "egg", false)).toEqual([cheese]);
    // A group of up to one, not required, replaces too.
    const one: OptionGroup = { ...extras, max: 1 };
    expect(toggleChoice(one, [egg], "cheese", true)).toEqual([cheese]);
  });

  it("says the rest wait only while an option is left to switch on", () => {
    // The burger's extras, both on: there is no other to choose.
    expect(groupFull(extras, [egg, cheese])).toBe(false);
    expect(groupFull(saladExtras, [pick("extras", "feta"), egg])).toBe(false);
    // With bacon a third, at two the bacon waits.
    expect(groupFull(withBacon, [egg, cheese])).toBe(true);
    expect(groupFull(withBacon, [egg])).toBe(false);
    // A pick the group no longer has, or one twice, doesn't count.
    expect(groupFull(withBacon, [egg, pick("extras", "gone")])).toBe(false);
    expect(groupFull(withBacon, [egg, egg])).toBe(false);
    // Another group's picks don't either.
    expect(groupFull(withBacon, [egg, medium])).toBe(false);
    // A group of up to one replaces its pick instead.
    expect(groupFull({ ...withBacon, max: 1 }, [egg])).toBe(false);
  });

  it("names the groups still to choose, and the price with what is picked", () => {
    expect(missingGroups(burger, [])).toEqual([doneness]);
    expect(missingGroups(burger, [cheese])).toEqual([doneness]);
    expect(missingGroups(burger, [medium])).toEqual([]);
    expect(missingGroups(burger, [pick("doneness", "gone")])).toEqual([
      doneness,
    ]);
    expect(picksAgorot(burger, [])).toBe(6800);
    expect(picksAgorot(burger, [cheese])).toBe(7400);
    for (const picks of [
      [medium],
      [medium, cheese],
      [cheese, egg, pick("doneness", "wd")],
    ]) {
      expect(picksAgorot(burger, picks)).toBe(unitAgorot(burger, picks));
    }
    expect(
      picksAgorot(salad, [pick("extras", "feta"), pick("extras", "egg")]),
    ).toBe(4700);
  });

  it("names the choices in the item's order", () => {
    expect(choiceNames(burger, [cheese, medium])).toEqual(["מדיום", "גבינה"]);
    expect(choiceNames(burger, [pick("doneness", "gone"), egg])).toEqual([
      "ביצה",
    ]);
    expect(choiceNames(salad, [])).toEqual([]);
  });

  it("adds more of a plain line with the same picks, else a line of its own", () => {
    const one = addChoiceLine([], burger, [cheese, medium], 2, newId);
    expect(one).toHaveLength(1);
    expect(one[0]).toMatchObject({
      item: BURGER,
      quantity: 2,
      choices: [medium, cheese],
    });
    // The same picks in another order: the same line.
    const two = addChoiceLine(one, burger, [medium, cheese], 1, newId);
    expect(two).toEqual([{ ...one[0], quantity: 3 }]);
    // Other picks: a line of their own.
    const other = addChoiceLine(
      two,
      burger,
      [pick("doneness", "wd")],
      1,
      newId,
    );
    expect(other).toHaveLength(2);
    // Never into a line with a note, an allergy or a hold.
    for (const own of [
      { note: "בלי בצל" },
      { note: "שומשום", allergy: true },
      { held: true },
    ]) {
      const noted = [line({ item: BURGER, choices: [medium], ...own })];
      expect(addChoiceLine(noted, burger, [medium], 1, newId)).toHaveLength(2);
    }
    // No picks: more of the plain line one tap added.
    const tapped = addToDraft([], SALAD, newId);
    expect(addChoiceLine(tapped, salad, [], 1, newId)).toEqual([
      { ...tapped[0], quantity: 2 },
    ]);
  });

  it("stops at a line's 99 and a round's 40", () => {
    const full = [line({ item: BURGER, choices: [medium], quantity: 99 })];
    expect(addChoiceLine(full, burger, [medium], 1, newId)).toEqual(full);
    const near = [line({ item: BURGER, choices: [medium], quantity: 98 })];
    expect(addChoiceLine(near, burger, [medium], 5, newId)[0]?.quantity).toBe(
      99,
    );
    const forty = Array.from({ length: 40 }, () => line());
    expect(addChoiceLine(forty, burger, [medium], 1, newId)).toHaveLength(40);
    expect(addChoiceLine([], burger, [medium], 250, newId)[0]?.quantity).toBe(
      99,
    );
  });

  it("changes a line's picks and nothing else", () => {
    const lines = [
      line({ item: BURGER, choices: [medium], note: "בלי בצל" }),
      line({ item: BURGER, choices: [medium] }),
    ];
    const id = lines[0]?.id ?? "";
    const changed = changeDraftChoices(lines, id, [pick("doneness", "wd")]);
    expect(changed[0]).toEqual({
      ...lines[0],
      choices: [pick("doneness", "wd")],
    });
    // No merge: two lines still.
    expect(changed[1]).toBe(lines[1]);
  });

  it("marks the lines whose picks no longer fit the menu", () => {
    const fits = line({ item: BURGER, choices: [medium, cheese] });
    const gone = line({ item: BURGER, choices: [pick("doneness", "mw")] });
    const plainSalad = line({ item: SALAD });
    const unknownItem = line({ item: LEMONADE, choices: [medium] });
    const withoutMw = {
      ...burger,
      optionGroups: [
        {
          ...doneness,
          options: doneness.options.filter((o) => o.id !== "mw"),
        },
        extras,
      ],
    };
    expect(
      staleChoiceLines(
        [withoutMw, salad],
        [fits, gone, plainSalad, unknownItem],
      ),
    ).toEqual([gone.id]);
    // A group made required: the plain line has none of it.
    const required = { ...salad, optionGroups: [{ ...saladExtras, min: 1 }] };
    expect(staleChoiceLines([required], [plainSalad])).toEqual([plainSalad.id]);
    // A group gone: its picks no longer fit.
    expect(
      staleChoiceLines([{ ...burger, optionGroups: [doneness] }], [fits]),
    ).toEqual([fits.id]);
    expect(staleChoiceLines([burger, salad], [fits, plainSalad])).toEqual([]);
  });

  it("checks the seeded burger's picks as the send does", () => {
    const groups = burger.optionGroups;
    expect(checkPicks(groups, [])).toMatchObject({
      ok: false,
      problem: "required",
      group: "doneness",
    });
    expect(checkPicks(groups, [medium, pick("doneness", "wd")])).toMatchObject({
      ok: false,
      problem: "tooMany",
      group: "doneness",
    });
    expect(
      checkPicks(
        [doneness, withBacon],
        [medium, egg, cheese, pick("extras", "bacon")],
      ),
    ).toMatchObject({ ok: false, problem: "tooMany", group: "extras" });
    expect(checkPicks(groups, [medium, pick("extras", "x")])).toMatchObject({
      ok: false,
      problem: "unknown",
    });
    expect(checkPicks(groups, [medium, egg, egg])).toMatchObject({
      ok: false,
      problem: "repeated",
    });
    expect(checkPicks(groups, [cheese, medium])).toEqual({ ok: true });
  });

  it("marks the lines of a choices refusal, and sends picks as they are kept", () => {
    expect(refusalMark("choices")).toBe("choices");
    const lines = addChoiceLine([], burger, [cheese, medium], 1, newId);
    expect(roundLinesOf(lines)[0]?.choices).toEqual([medium, cheese]);
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

  it("has its stage for a line's sheet, the badge's, even once no line of it is live", () => {
    for (const status of ["held", "new", "ready", "served"] as const) {
      for (const kitchenSeenAt of [null, minutesAgo(1)]) {
        expect(ticketStage({ status, kitchenSeenAt })).toBe(
          ticketBadge({ status, kitchenSeenAt, lines: 2 }),
        );
      }
    }
    // A ticket whose one line was cancelled: no badge, and still "sent".
    expect(ticketStage({ status: "new", kitchenSeenAt: null })).toBe("sent");
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

describe("fixing a sent line (P5)", () => {
  const fixes = (
    status: "held" | "new" | "ready" | "served",
    line: "live" | "takenBack" | "cancelled" | "comped",
    runs: boolean,
    more: { order?: "open" | "closed" | "cancelled"; viewing?: boolean } = {},
  ) =>
    lineFixes({
      order: { status: more.order ?? "open" },
      ticket: { status },
      line,
      runs,
      viewing: more.viewing ?? false,
    });

  it("lets a taker cancel what isn't ready yet, and says why not once it is", () => {
    for (const status of ["held", "new"] as const) {
      expect(fixes(status, "live", false)).toEqual({
        fixes: ["cancel"],
        readyLocked: false,
      });
      expect(fixes(status, "cancelled", false)).toEqual({
        fixes: ["restore"],
        readyLocked: false,
      });
    }
    for (const status of ["ready", "served"] as const) {
      expect(fixes(status, "live", false)).toEqual({
        fixes: [],
        readyLocked: true,
      });
      expect(fixes(status, "cancelled", false)).toEqual({
        fixes: [],
        readyLocked: true,
      });
    }
  });

  it("lets whoever runs orders cancel, put back and give on the house at any point", () => {
    for (const status of ["held", "new", "ready", "served"] as const) {
      expect(fixes(status, "live", true)).toEqual({
        fixes: ["cancel", "comp"],
        readyLocked: false,
      });
      expect(fixes(status, "cancelled", true).fixes).toEqual(["restore"]);
      expect(fixes(status, "comped", true).fixes).toEqual(["uncomp"]);
      expect(fixes(status, "comped", false).fixes).toEqual([]);
    }
  });

  it("offers nothing for a line taken back, an order no longer open, or while viewing", () => {
    expect(fixes("new", "takenBack", true).fixes).toEqual([]);
    expect(fixes("new", "live", true, { order: "closed" }).fixes).toEqual([]);
    expect(fixes("new", "live", true, { order: "cancelled" }).fixes).toEqual(
      [],
    );
    expect(fixes("ready", "live", false, { viewing: true })).toEqual({
      fixes: [],
      readyLocked: false,
    });
  });
});

describe("the order whole (P5)", () => {
  const sent: Record<
    "takenBackAt" | "cancelledAt" | "compedAt",
    string | null
  > = { takenBackAt: null, cancelledAt: null, compedAt: null };
  const ticket = (
    department: string,
    status: "held" | "new" | "ready" | "served",
    lines: Partial<typeof sent>[] = [{}],
  ) => ({ department, status, lines: lines.map((l) => ({ ...sent, ...l })) });
  const rounds = (
    ...tickets: ReturnType<typeof ticket>[]
  ): Pick<OrderDetail, "rounds"> =>
    ({
      rounds: [{ id: ORDER, sentAt: NOW_ISO, sentBy: null, tickets }],
    }) as unknown as Pick<OrderDetail, "rounds">;
  const NOW_ISO = new Date(NOW).toISOString();

  it("refuses a close while a held block has a line still sent", () => {
    expect(closeState(rounds(ticket(KITCHEN, "held"))).held).toBe(true);
    // On the house is still sent, and waits to be called.
    expect(
      closeState(rounds(ticket(KITCHEN, "held", [{ compedAt: NOW_ISO }]))).held,
    ).toBe(true);
    expect(
      closeState(
        rounds(
          ticket(KITCHEN, "held", [
            { cancelledAt: NOW_ISO },
            { takenBackAt: NOW_ISO },
          ]),
        ),
      ).held,
    ).toBe(false);
  });

  it("names what isn't served yet, once each, in the business's order", () => {
    const state = closeState(
      rounds(
        ticket(KITCHEN, "new"),
        ticket(BAR, "ready"),
        ticket(KITCHEN, "ready"),
        ticket(PLACE, "served"),
        ticket(ORDER, "new", [{ cancelledAt: NOW_ISO }]),
      ),
      [BAR, KITCHEN],
    );
    expect(state).toEqual({ held: false, unserved: [BAR, KITCHEN] });
    expect(closeState(rounds(ticket(KITCHEN, "served"))).unserved).toEqual([]);
  });

  const floor = (
    orders: { id: string; place: string | null }[],
    day = "2026-11-20",
  ): Pick<OrderFloor, "day" | "orders"> =>
    ({ day, orders }) as unknown as Pick<OrderFloor, "day" | "orders">;
  const closed = {
    id: ORDER,
    status: "closed" as const,
    day: "2026-11-20",
    place: { id: PLACE, name: "4" },
  };

  it("opens a closed order again the same day, while its place is free", () => {
    expect(reopenState(closed, floor([]))).toBe("ok");
    expect(reopenState({ ...closed, status: "open" }, floor([]))).toBe("open");
    expect(reopenState({ ...closed, status: "cancelled" }, floor([]))).toBe(
      "cancelled",
    );
    expect(reopenState(closed, floor([], "2026-11-21"))).toBe("dayOver");
    expect(reopenState(closed, floor([{ id: HUMMUS, place: PLACE }]))).toBe(
      "taken",
    );
    // A takeaway has no place to be taken.
    expect(
      reopenState(
        { ...closed, place: null },
        floor([{ id: HUMMUS, place: null }]),
      ),
    ).toBe("ok");
  });

  it("moves to the live places with no open order, in their order", () => {
    const places = [
      { id: PLACE, name: "4" },
      { id: KITCHEN, name: "7" },
      { id: BAR, name: "11" },
    ];
    expect(
      freePlaces(
        places,
        floor([
          { id: ORDER, place: PLACE },
          { id: HUMMUS, place: KITCHEN },
          { id: LEMONADE, place: null },
        ]),
        PLACE,
      ).map((p) => p.name),
    ).toEqual(["11"]);
    expect(freePlaces(places, floor([]), PLACE).map((p) => p.name)).toEqual([
      "7",
      "11",
    ]);
  });

  it("shows the newest five closed today, the rest a tap away", () => {
    const list = Array.from({ length: 7 }, (_, n) => n);
    expect(closedToday(list)).toEqual({
      rows: [0, 1, 2, 3, 4],
      rest: [5, 6],
    });
    expect(closedToday(list.slice(0, 3))).toEqual({
      rows: [0, 1, 2],
      rest: [],
    });
  });
});
