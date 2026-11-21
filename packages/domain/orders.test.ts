import { describe, expect, it } from "vitest";
import {
  favouritesSchema,
  lineStateOf,
  myOrdersSchema,
  ORDER_CAPS,
  type OrderDetail,
  type OrderLine,
  orderDay,
  orderDetailSchema,
  orderFloorSchema,
  orderModeSchema,
  orderPrepSchema,
  orderTill,
  orderTillSchema,
  roundInput,
  roundLine,
  roundTarget,
  sentRoundSchema,
  takeBackOffered,
  takeBackState,
  ticketWait,
} from "./orders";

const ID = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const TZ = "Asia/Jerusalem";
const T = "2026-11-20T18:00:00.123456+00:00";

describe("a line as a send gives it", () => {
  const line = (extra: Record<string, unknown> = {}) =>
    roundLine.safeParse({ item: ID, quantity: 1, ...extra }).success;

  it("takes from 1 to 99 of an item", () => {
    expect(line({ quantity: 0 })).toBe(false);
    expect(line({ quantity: 1 })).toBe(true);
    expect(line({ quantity: 99 })).toBe(true);
    expect(line({ quantity: 100 })).toBe(false);
    expect(line({ quantity: 1.5 })).toBe(false);
    expect(roundLine.safeParse({ item: "x", quantity: 1 }).success).toBe(false);
  });

  it("keeps a note of one line, up to 120 characters, trimmed", () => {
    expect(line({ note: "א".repeat(ORDER_CAPS.note) })).toBe(true);
    expect(line({ note: "א".repeat(ORDER_CAPS.note + 1) })).toBe(false);
    expect(
      roundLine.parse({ item: ID, quantity: 1, note: " בלי שום " }).note,
    ).toBe("בלי שום");
    expect(line({ note: "שורה\u0007" })).toBe(false);
    expect(line({ note: "שורה\u2028שנייה" })).toBe(false);
    expect(line({ note: null })).toBe(true);
  });

  it("says what an allergy is in its note", () => {
    expect(line({ allergy: true })).toBe(false);
    expect(line({ allergy: true, note: null })).toBe(false);
    expect(line({ allergy: true, note: "בוטנים" })).toBe(true);
    expect(line({ allergy: false })).toBe(true);
  });

  it("takes choices by their ids, and nothing else", () => {
    expect(line({ choices: [{ group: "side", option: "salad" }] })).toBe(true);
    expect(line({ choices: [{ group: "side" }] })).toBe(false);
    expect(line({ choices: [{ group: "Side", option: "salad" }] })).toBe(false);
    expect(line({ held: true })).toBe(true);
    expect(line({ price: 100 })).toBe(false);
  });
});

describe("where a send goes", () => {
  it("is an order with the place it shows, a first send to a place, or a takeaway", () => {
    expect(roundTarget.safeParse({ order: ID }).success).toBe(true);
    expect(roundTarget.safeParse({ order: ID, place: OTHER }).success).toBe(
      true,
    );
    expect(roundTarget.safeParse({ place: OTHER }).success).toBe(true);
    expect(roundTarget.safeParse({ takeaway: true }).success).toBe(true);
    expect(
      roundTarget.safeParse({ takeaway: true, label: "חולצה אדומה" }).success,
    ).toBe(true);
    expect(
      roundTarget.safeParse({ takeaway: true, label: "א".repeat(21) }).success,
    ).toBe(false);
    expect(roundTarget.safeParse({ takeaway: false }).success).toBe(false);
    expect(roundTarget.safeParse({ place: OTHER, label: "x" }).success).toBe(
      false,
    );
    expect(roundTarget.safeParse({}).success).toBe(false);
  });

  it("holds from 1 to 40 lines in a round", () => {
    const round = (lines: number) =>
      roundInput.safeParse({
        key: ID,
        target: { place: OTHER },
        lines: Array.from({ length: lines }, () => ({ item: ID, quantity: 1 })),
      }).success;
    expect(round(0)).toBe(false);
    expect(round(1)).toBe(true);
    expect(round(40)).toBe(true);
    expect(round(41)).toBe(false);
  });
});

describe("the business day", () => {
  // 2026-11-20 is winter time in Israel: UTC+2.
  it("turns at dayEndsAt, not at midnight", () => {
    expect(orderDay(new Date("2026-11-20T21:59:00Z"), TZ, "05:00")).toBe(
      "2026-11-20",
    );
    expect(orderDay(new Date("2026-11-20T22:00:00Z"), TZ, "05:00")).toBe(
      "2026-11-20",
    );
    expect(orderDay(new Date("2026-11-21T02:59:00Z"), TZ, "05:00")).toBe(
      "2026-11-20",
    );
    expect(orderDay(new Date("2026-11-21T03:00:00Z"), TZ, "05:00")).toBe(
      "2026-11-21",
    );
  });

  it("is the calendar day when it ends at midnight", () => {
    expect(orderDay(new Date("2026-11-20T21:59:00Z"), TZ, "00:00")).toBe(
      "2026-11-20",
    );
    expect(orderDay(new Date("2026-11-20T22:00:00Z"), TZ, "00:00")).toBe(
      "2026-11-21",
    );
  });

  it("keeps the wall clock across a change of the clocks", () => {
    // 27 March 2026: 02:00 local becomes 03:00 (UTC+2 to UTC+3).
    expect(orderDay(new Date("2026-03-27T01:30:00Z"), TZ, "05:00")).toBe(
      "2026-03-26",
    );
    // 04:59 local, summer time.
    expect(orderDay(new Date("2026-03-27T01:59:00Z"), TZ, "05:00")).toBe(
      "2026-03-26",
    );
    expect(orderDay(new Date("2026-03-27T02:00:00Z"), TZ, "05:00")).toBe(
      "2026-03-27",
    );
    // 25 October 2026: 02:00 local becomes 01:00 again (UTC+3 to UTC+2).
    expect(orderDay(new Date("2026-10-24T23:30:00Z"), TZ, "05:00")).toBe(
      "2026-10-24",
    );
    expect(orderDay(new Date("2026-10-25T02:59:00Z"), TZ, "05:00")).toBe(
      "2026-10-24",
    );
    expect(orderDay(new Date("2026-10-25T03:00:00Z"), TZ, "05:00")).toBe(
      "2026-10-25",
    );
  });
});

describe("taking a line back", () => {
  const sentAt = new Date("2026-11-20T18:00:00Z");
  const at = (seconds: number) => new Date(sentAt.getTime() + seconds * 1000);
  const state = (
    extra: Partial<Parameters<typeof takeBackState>[0]> = {},
  ): ReturnType<typeof takeBackState> =>
    takeBackState({
      sentAt,
      now: at(60),
      minutes: 2,
      ticket: { status: "new", prepared: false },
      isSender: true,
      senderInDepartment: false,
      line: "live",
      ...extra,
    });

  it("is the sender's, within the minutes, to the second", () => {
    expect(state()).toBe("open");
    expect(state({ now: at(120) })).toBe("open");
    expect(state({ now: at(121) })).toBe("window");
    expect(state({ minutes: 5, now: at(240) })).toBe("open");
    expect(state({ minutes: 0, now: at(0) })).toBe("window");
    expect(state({ isSender: false })).toBe("notSender");
  });

  it("is a cancel with a reason once prepared, or for the department's own", () => {
    expect(state({ ticket: { status: "ready", prepared: true } })).toBe(
      "prepared",
    );
    // Marked ready, then put back to new: still prepared.
    expect(state({ ticket: { status: "new", prepared: true } })).toBe(
      "prepared",
    );
    expect(state({ ticket: { status: "held", prepared: false } })).toBe("open");
    expect(state({ senderInDepartment: true })).toBe("ownDepartment");
  });

  it("is done for a line no longer live", () => {
    expect(state({ line: "takenBack" })).toBe("done");
    expect(state({ line: "cancelled" })).toBe("done");
    expect(state({ line: "comped" })).toBe("done");
  });
});

describe("how long a ticket waited", () => {
  const since = new Date("2026-11-20T18:00:00Z");
  const waitedFor = (minutes: number) =>
    ticketWait(since, new Date(since.getTime() + minutes * 60_000), 15);

  it("is late from the business's minutes, and very late from twice them", () => {
    expect(waitedFor(0)).toBe("fresh");
    expect(waitedFor(14.99)).toBe("fresh");
    expect(waitedFor(15)).toBe("late");
    expect(waitedFor(29.99)).toBe("late");
    expect(waitedFor(30)).toBe("veryLate");
  });
});

describe("the reads", () => {
  const floor = {
    version: 1_779_000_000_000_000,
    now: T,
    day: "2026-11-20",
    runs: false,
    orders: [
      {
        id: ID,
        place: OTHER,
        placeName: "4",
        takeaway: null,
        label: null,
        openedAt: T,
        openedBy: OTHER,
        movedAt: null,
        lastSentAt: T,
        rounds: 1,
        tickets: { held: 0, new: 1, ready: 0, served: 0 },
        waitingSince: T,
        unseen: true,
      },
    ],
    closed: [
      {
        id: OTHER,
        placeName: null,
        takeaway: 1,
        status: "closed",
        closedAt: T,
      },
    ],
    fixes: null,
  };
  const line = {
    id: ID,
    name: "חומוס",
    choices: [],
    quantity: 1,
    note: "בלי שום",
    allergy: true,
    state: "live",
  };
  const prep = {
    version: 2,
    now: T,
    departments: [OTHER],
    tickets: [
      {
        id: ID,
        order: OTHER,
        department: OTHER,
        placeName: "4",
        takeaway: null,
        status: "new",
        sentAt: T,
        firedAt: null,
        readyAt: null,
        sentBy: null,
        lines: [line],
      },
    ],
  };

  it("read the floor, the send's answer and the favourites as the database writes them", () => {
    expect(orderFloorSchema.safeParse(floor).success).toBe(true);
    expect(
      orderFloorSchema.safeParse({
        ...floor,
        fixes: { takenBack: 1, cancelled: 2, comped: 0 },
      }).success,
    ).toBe(true);
    expect(
      sentRoundSchema.safeParse({
        round: ID,
        order: OTHER,
        sentAt: T,
        first: true,
        place: OTHER,
        takeaway: null,
        tickets: [{ id: ID, department: OTHER, held: false }],
      }).success,
    ).toBe(true);
    expect(favouritesSchema.safeParse({ items: [ID, OTHER] }).success).toBe(
      true,
    );
    expect(
      favouritesSchema.safeParse({ items: Array.from({ length: 9 }, () => ID) })
        .success,
    ).toBe(false);
  });

  it("read an order, its till and one's own rounds", () => {
    expect(
      orderDetailSchema.safeParse({
        id: ID,
        status: "open",
        day: "2026-11-20",
        place: { id: OTHER, name: "4" },
        takeaway: null,
        openedAt: T,
        openedBy: OTHER,
        closedAt: null,
        closedBy: null,
        reopenedAt: null,
        reopenedBy: null,
        movedAt: null,
        movedBy: null,
        movedFrom: null,
        cancelledAt: null,
        cancelledBy: null,
        cancelReason: null,
        now: T,
        takeBackMinutes: 2,
        rounds: [
          {
            id: ID,
            sentAt: T,
            sentBy: OTHER,
            tickets: [
              {
                id: ID,
                department: OTHER,
                status: "new",
                held: false,
                firedAt: null,
                kitchenSeenAt: null,
                readyAt: null,
                servedAt: null,
                prepared: false,
                lines: [
                  {
                    id: ID,
                    item: OTHER,
                    name: "שניצל",
                    choices: [
                      { group: "תוספת", option: "סלט", priceAgorot: 500 },
                    ],
                    quantity: 2,
                    note: null,
                    allergy: false,
                    unitAgorot: 6700,
                    takenBackAt: null,
                    cancelledAt: T,
                    cancelReason: "guest",
                    compedAt: null,
                    compReason: null,
                  },
                ],
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      orderTillSchema.safeParse({
        id: ID,
        status: "closed",
        place: null,
        takeaway: { number: 3, label: "חולצה אדומה" },
        byItem: [
          {
            name: "קפה",
            choices: [],
            unitAgorot: 1200,
            quantity: 3,
            comped: false,
          },
        ],
        byRound: [
          {
            id: ID,
            sentAt: T,
            sentBy: null,
            lines: [
              {
                name: "קפה",
                choices: [],
                quantity: 2,
                unitAgorot: 1200,
                comped: false,
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      myOrdersSchema.safeParse({
        version: 3,
        now: T,
        day: "2026-11-20",
        rounds: [
          {
            id: ID,
            order: OTHER,
            placeName: null,
            takeaway: 1,
            orderStatus: "open",
            sentAt: T,
            tickets: [
              {
                id: ID,
                department: OTHER,
                status: "ready",
                held: false,
                kitchenSeenAt: T,
                readyAt: T,
                servedAt: null,
                lines: 2,
              },
            ],
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("read the kitchen's tickets, and refuse a price that reached them", () => {
    expect(orderPrepSchema.safeParse(prep).success).toBe(true);
    const priced = structuredClone(prep);
    Object.assign(priced.tickets[0]?.lines[0] ?? {}, { unitAgorot: 3200 });
    expect(orderPrepSchema.safeParse(priced).success).toBe(false);
    const pricedTicket = structuredClone(prep);
    Object.assign(pricedTicket.tickets[0] ?? {}, { priceAgorot: 3200 });
    expect(orderPrepSchema.safeParse(pricedTicket).success).toBe(false);
  });
});

describe("the mode's reads (P4)", () => {
  const mode = {
    version: 7,
    takes: true,
    runs: false,
    viewing: false,
    clock: "stale_shift",
    departments: [OTHER],
    ready: 1,
    making: 2,
    waiting: [{ department: OTHER, count: 2 }],
    soldOut: 1,
  };

  it("read where the person stands in the mode, the clock's words as the app's", () => {
    expect(orderModeSchema.parse(mode).clock).toBe("staleShift");
    expect(orderModeSchema.parse({ ...mode, clock: "clock" }).clock).toBe(
      "clock",
    );
    expect(orderModeSchema.parse({ ...mode, clock: null }).clock).toBeNull();
    // Strict: a person or a price that reached it fails.
    expect(orderModeSchema.safeParse({ ...mode, person: ID }).success).toBe(
      false,
    );
    expect(
      orderModeSchema.safeParse({
        ...mode,
        waiting: [{ department: OTHER, count: 1, unitAgorot: 100 }],
      }).success,
    ).toBe(false);
  });

  const ticket = {
    id: ID,
    department: OTHER,
    status: "ready",
    held: false,
    kitchenSeenAt: T,
    readyAt: T,
    servedAt: null,
    lines: 1,
  };
  const mine = (tickets: unknown[]) => ({
    version: 3,
    now: T,
    day: "2026-11-20",
    rounds: [
      {
        id: ID,
        order: OTHER,
        placeName: "4",
        takeaway: null,
        orderStatus: "open",
        sentAt: T,
        tickets,
      },
    ],
  });
  const item = {
    id: ID,
    name: "חומוס",
    choices: ["גדול"],
    quantity: 1,
    note: null,
    allergy: false,
    state: "live",
  };

  it("read one's own tickets with their lines, none before the migration, never a price", () => {
    expect(
      myOrdersSchema.parse(mine([ticket])).rounds[0]?.tickets[0]?.items,
    ).toEqual([]);
    expect(
      myOrdersSchema.parse(mine([{ ...ticket, items: [item] }])).rounds[0]
        ?.tickets[0]?.items,
    ).toEqual([item]);
    expect(
      myOrdersSchema.safeParse(
        mine([{ ...ticket, items: [{ ...item, unitAgorot: 3200 }] }]),
      ).success,
    ).toBe(false);
  });

  const floor = {
    version: 1,
    now: T,
    day: "2026-11-20",
    runs: false,
    orders: [],
    closed: [],
    fixes: null,
  };
  const ready = {
    ticket: ID,
    order: OTHER,
    department: OTHER,
    placeName: "4",
    takeaway: null,
    readyAt: T,
    sentBy: null,
    lines: [
      {
        id: ID,
        name: "חומוס",
        choices: [],
        quantity: 2,
        note: "בלי שום",
        allergy: false,
      },
    ],
  };

  it("read what is ready to serve on the floor, none before the migration, never a price", () => {
    expect(orderFloorSchema.parse(floor).ready).toEqual([]);
    expect(orderFloorSchema.parse({ ...floor, ready: [ready] }).ready).toEqual([
      ready,
    ]);
    expect(
      orderFloorSchema.safeParse({
        ...floor,
        ready: [{ ...ready, lines: [{ ...ready.lines[0], unitAgorot: 3200 }] }],
      }).success,
    ).toBe(false);
  });
});

describe("offering a take-back (P4)", () => {
  const sentAt = new Date("2026-11-20T18:00:00Z");
  const state = (seconds: number) => ({
    sentAt,
    now: new Date(sentAt.getTime() + seconds * 1000),
    minutes: 2,
    ticket: { status: "new" as const, prepared: false },
    isSender: true,
    senderInDepartment: false,
    line: "live" as const,
  });

  it("offers it only while the held write still lands in the window", () => {
    expect(takeBackOffered(state(0), 8000)).toBe(true);
    expect(takeBackOffered(state(112), 8000)).toBe(true);
    expect(takeBackOffered(state(113), 8000)).toBe(false);
    expect(takeBackOffered({ ...state(0), isSender: false }, 8000)).toBe(false);
    expect(takeBackOffered({ ...state(0), minutes: 0 }, 8000)).toBe(false);
  });
});

describe("the till, from the order whole (P5)", () => {
  const LINE = "00000000-0000-4000-8000-0000000000";
  let next = 10;
  const line = (extra: Partial<OrderLine> = {}): OrderLine => {
    next += 1;
    return {
      id: `${LINE}${next}`,
      item: ID,
      name: "לימונדה",
      choices: [],
      quantity: 1,
      note: null,
      allergy: false,
      unitAgorot: 1600,
      takenBackAt: null,
      cancelledAt: null,
      cancelReason: null,
      compedAt: null,
      compReason: null,
      ...extra,
    };
  };
  const ticket = (lines: OrderLine[], department = ID) => ({
    id: lines[0]?.id ?? ID,
    department,
    status: "new" as const,
    held: false,
    firedAt: null,
    kitchenSeenAt: null,
    readyAt: null,
    servedAt: null,
    prepared: false,
    lines,
  });
  const order = (rounds: OrderDetail["rounds"]): OrderDetail => ({
    id: ID,
    status: "open",
    day: "2026-11-20",
    place: { id: OTHER, name: "4" },
    takeaway: null,
    openedAt: T,
    openedBy: OTHER,
    closedAt: null,
    closedBy: null,
    reopenedAt: null,
    reopenedBy: null,
    movedAt: null,
    movedBy: null,
    movedFrom: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
    now: T,
    takeBackMinutes: 2,
    rounds,
  });
  const large = { group: "גודל", option: "גדול", priceAgorot: 300 };
  const detail = order([
    {
      id: ID,
      sentAt: T,
      sentBy: OTHER,
      tickets: [
        ticket([
          line({ quantity: 2 }),
          line({
            name: "בירה מהחבית",
            unitAgorot: 2800,
            compedAt: T,
            compReason: "make_good",
          }),
        ]),
        ticket(
          [
            line({
              name: "חומוס",
              unitAgorot: 3200,
              cancelledAt: T,
              cancelReason: "guest",
            }),
          ],
          OTHER,
        ),
      ],
    },
    {
      id: OTHER,
      sentAt: "2026-11-20T18:20:00Z",
      sentBy: null,
      tickets: [
        ticket([
          line(),
          line({ choices: [large], unitAgorot: 1900 }),
          line({ name: "בירה מהחבית", unitAgorot: 2800 }),
          line({ takenBackAt: T }),
        ]),
      ],
    },
    {
      id: "00000000-0000-4000-8000-000000000003",
      sentAt: "2026-11-20T18:30:00Z",
      sentBy: OTHER,
      tickets: [ticket([line({ takenBackAt: T })])],
    },
  ]);

  it("adds identical lines across rounds, and keeps another choice, price or comp apart", () => {
    expect(orderTill(detail).byItem).toEqual([
      {
        name: "לימונדה",
        choices: [],
        unitAgorot: 1600,
        quantity: 3,
        comped: false,
      },
      {
        name: "בירה מהחבית",
        choices: [],
        unitAgorot: 2800,
        quantity: 1,
        comped: true,
      },
      {
        name: "לימונדה",
        choices: ["גדול"],
        unitAgorot: 1900,
        quantity: 1,
        comped: false,
      },
      {
        name: "בירה מהחבית",
        choices: [],
        unitAgorot: 2800,
        quantity: 1,
        comped: false,
      },
    ]);
  });

  it("gives each round its lines still sent, and keeps a round left with none", () => {
    const till = orderTill(detail);
    expect(till.byRound.map((round) => round.lines.length)).toEqual([2, 3, 0]);
    expect(till.byRound[0]?.lines.map((l) => l.name)).toEqual([
      "לימונדה",
      "בירה מהחבית",
    ]);
    expect(till.byRound[1]).toMatchObject({ id: OTHER, sentBy: null });
  });

  it("adds no total, and reads as public.order_till answers", () => {
    const till = orderTill(detail);
    for (const row of [
      ...till.byItem,
      ...till.byRound.flatMap((r) => r.lines),
    ]) {
      expect(Object.keys(row).sort()).toEqual([
        "choices",
        "comped",
        "name",
        "quantity",
        "unitAgorot",
      ]);
    }
    expect(Object.keys(till).sort()).toEqual([
      "byItem",
      "byRound",
      "id",
      "place",
      "status",
      "takeaway",
    ]);
    expect(orderTillSchema.safeParse(till).success).toBe(true);
  });

  it("says where a line is, taken back before anything else", () => {
    expect(lineStateOf(line())).toBe("live");
    expect(lineStateOf(line({ compedAt: T }))).toBe("comped");
    expect(lineStateOf(line({ cancelledAt: T }))).toBe("cancelled");
    expect(lineStateOf(line({ takenBackAt: T, cancelledAt: T }))).toBe(
      "takenBack",
    );
  });
});
