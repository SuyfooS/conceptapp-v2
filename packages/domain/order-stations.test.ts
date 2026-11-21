import { describe, expect, it } from "vitest";
import {
  freshTickets,
  lateNews,
  nextStationPoll,
  orderStationName,
  readStationQuery,
  STATION_FRESH_MS,
  STATION_TICKETS_PATH,
  stationAnswerSchema,
  stationConnection,
  stationGone,
  stationMenuSchema,
  stationNews,
  stationPrepSchema,
  stationQueryHref,
  stationTillSchema,
  stationWriteAnswer,
  stationWriteBody,
  writeKind,
} from "./order-stations";
import type { PrepTicket } from "./orders";

const ID = (n: number) =>
  `ea000000-0000-4000-a000-${String(n).padStart(12, "0")}`;
const AT = "2026-12-01T18:00:00.000Z";
const at = (minutes: number) =>
  new Date(Date.parse(AT) + minutes * 60_000).toISOString();

function ticket(
  n: number,
  change: Partial<PrepTicket> = {},
  lines: PrepTicket["lines"] = [line(n * 10)],
): PrepTicket {
  return {
    id: ID(n),
    order: ID(100 + n),
    department: ID(900),
    placeName: String(n),
    takeaway: null,
    status: "new",
    sentAt: AT,
    firedAt: null,
    readyAt: null,
    sentBy: ID(500),
    lines,
    ...change,
  };
}

function line(
  n: number,
  state: PrepTicket["lines"][number]["state"] = "live",
): PrepTicket["lines"][number] {
  return {
    id: ID(n),
    name: "חומוס",
    choices: [],
    quantity: 1,
    note: null,
    allergy: false,
    state,
  };
}

const prep = {
  version: 7,
  now: AT,
  lateAfterMinutes: 15,
  department: ID(900),
  departmentGone: false,
  departments: [{ id: ID(900), name: "מטבח", archived: false }],
  tickets: [ticket(1)],
};

const tillOrder = {
  id: ID(200),
  status: "open",
  place: { id: ID(300), name: "4" },
  takeaway: null,
  openedAt: AT,
  reopenedAt: null,
  closedAt: null,
  cancelledAt: null,
  cancelReason: null,
  closedHere: false,
  held: 0,
  ready: 1,
  unserved: [ID(900)],
  byItem: [
    {
      name: "חומוס",
      choices: [],
      unitAgorot: 3200,
      quantity: 2,
      comped: false,
    },
  ],
  byRound: [
    {
      id: ID(400),
      sentAt: AT,
      lines: [
        {
          name: "חומוס",
          choices: [],
          unitAgorot: 3200,
          quantity: 2,
          comped: false,
        },
      ],
    },
  ],
};

const till = {
  version: 7,
  now: AT,
  day: "2026-12-01",
  departments: [{ id: ID(900), name: "מטבח", archived: false }],
  orders: [tillOrder],
  closed: [],
};

describe("the poll's query", () => {
  it("reads what the station knows, each absent before its first read", () => {
    expect(readStationQuery(new URLSearchParams())).toEqual({
      version: null,
      menu: null,
    });
    expect(
      readStationQuery(new URLSearchParams("v=1732500000000000&m=3")),
    ).toEqual({ version: 1732500000000000, menu: 3 });
    expect(readStationQuery(new URLSearchParams("m=0"))).toEqual({
      version: null,
      menu: 0,
    });
  });

  it("refuses anything else", () => {
    for (const query of ["v=-1", "v=1.5", "v=x", "v=1&v=2", "w=1", "v="]) {
      expect(readStationQuery(new URLSearchParams(query)), query).toBeNull();
    }
  });

  it("is made back into the poll's address", () => {
    expect(stationQueryHref({ version: null, menu: null })).toBe(
      STATION_TICKETS_PATH,
    );
    expect(stationQueryHref({ version: 9, menu: 2 })).toBe(
      "/station/tickets?v=9&m=2",
    );
    const href = stationQueryHref({ version: 12, menu: null });
    expect(readStationQuery(new URL(href, "http://x").searchParams)).toEqual({
      version: 12,
      menu: null,
    });
  });
});

describe("what a station reads", () => {
  it("parses a prep screen's tickets, a menu and a till", () => {
    expect(stationPrepSchema.safeParse(prep).success).toBe(true);
    expect(
      stationMenuSchema.safeParse({
        version: 3,
        items: [
          {
            id: ID(1),
            name: "חומוס",
            category: { id: ID(2), name: "ראשונות" },
            available: true,
          },
        ],
      }).success,
    ).toBe(true);
    expect(stationTillSchema.safeParse(till).success).toBe(true);
  });

  it("refuses a price, a label or anything more that reached it", () => {
    const priced = {
      ...prep,
      tickets: [{ ...ticket(1), lines: [{ ...line(10), unitAgorot: 3200 }] }],
    };
    expect(stationPrepSchema.safeParse(priced).success).toBe(false);
    expect(
      stationPrepSchema.safeParse({
        ...prep,
        tickets: [{ ...ticket(1), label: "חולצה אדומה" }],
      }).success,
    ).toBe(false);
    expect(
      stationMenuSchema.safeParse({
        version: 3,
        items: [
          {
            id: ID(1),
            name: "חומוס",
            category: { id: ID(2), name: "ראשונות" },
            available: true,
            priceAgorot: 3200,
          },
        ],
      }).success,
    ).toBe(false);
    expect(
      stationTillSchema.safeParse({
        ...till,
        orders: [{ ...tillOrder, label: "חולצה אדומה" }],
      }).success,
    ).toBe(false);
    expect(
      stationTillSchema.safeParse({
        ...till,
        orders: [
          {
            ...tillOrder,
            byRound: [{ ...tillOrder.byRound[0], sentBy: ID(500) }],
          },
        ],
      }).success,
    ).toBe(false);
    expect(stationTillSchema.safeParse({ ...till, total: 6400 }).success).toBe(
      false,
    );
  });

  it("is answered as a prep screen's, a till's or a refusal", () => {
    expect(
      stationAnswerSchema.safeParse({
        ok: true,
        shows: "prep",
        prep,
        names: { [ID(500)]: "יואב" },
        menu: null,
      }).success,
    ).toBe(true);
    expect(
      stationAnswerSchema.safeParse({ ok: true, shows: "till", till: null })
        .success,
    ).toBe(true);
    expect(
      stationAnswerSchema.safeParse({ ok: false, failure: "notOrders" })
        .success,
    ).toBe(true);
    expect(
      stationAnswerSchema.safeParse({ ok: false, failure: "nobody" }).success,
    ).toBe(false);
    expect(
      stationAnswerSchema.safeParse({
        ok: true,
        shows: "prep",
        prep: null,
        names: { yoav: "יואב" },
        menu: null,
      }).success,
    ).toBe(false);
  });
});

describe("a station's write", () => {
  it("is one of five, each for its kind of station", () => {
    const writes = [
      { do: "ready", ticket: ID(1), ready: true },
      { do: "available", item: ID(2), available: false },
      { do: "close", order: ID(3) },
      { do: "reopen", order: ID(3) },
      { do: "undoClose", order: ID(3) },
    ];
    expect(
      writes.map((body) => writeKind(stationWriteBody.parse(body))),
    ).toEqual(["prep", "prep", "till", "till", "till"]);
  });

  it("refuses a wrong id, a missing field and anything more", () => {
    for (const body of [
      { do: "ready", ticket: "t-4", ready: true },
      { do: "ready", ticket: ID(1) },
      { do: "close", order: ID(3), actor: ID(4) },
      { do: "cancel", order: ID(3) },
      null,
    ]) {
      expect(stationWriteBody.safeParse(body).success).toBe(false);
    }
  });

  it("is answered done or refused in words the screen has", () => {
    expect(stationWriteAnswer.safeParse({ ok: true }).success).toBe(true);
    expect(
      stationWriteAnswer.safeParse({ ok: false, failure: "held" }).success,
    ).toBe(true);
    expect(
      stationWriteAnswer.safeParse({ ok: false, failure: "sender" }).success,
    ).toBe(false);
  });
});

describe("what the kitchen's screen tells", () => {
  it("tells nothing on the first read after opening", () => {
    expect(stationNews(null, [ticket(1)])).toEqual({ arrived: [], struck: [] });
  });

  it("tells a new ticket, and a held block called", () => {
    const held = ticket(2, { status: "held" });
    const news = stationNews(
      [ticket(1), held],
      [ticket(1), { ...held, status: "new", firedAt: at(5) }, ticket(3)],
    );
    expect(news.arrived).toEqual([ID(2), ID(3)]);
    expect(news.struck).toEqual([]);
  });

  it("never tells a ticket that went, or one put back from ready", () => {
    const ready = ticket(2, { status: "ready", readyAt: at(1) });
    expect(
      stationNews([ticket(1), ready], [{ ...ready, status: "new" }]),
    ).toEqual({ arrived: [], struck: [] });
  });

  it("tells a line struck on a ticket still shown, and a ticket struck whole", () => {
    const two = ticket(4, {}, [line(41), line(42)]);
    const news = stationNews(
      [two, ticket(5)],
      [
        { ...two, lines: [line(41), line(42, "cancelled")] },
        { ...ticket(5), lines: [line(50, "takenBack")] },
      ],
    );
    expect(news.struck).toEqual([
      { ticket: ID(4), line: ID(42) },
      { ticket: ID(5), line: ID(50) },
    ]);
    expect(stationGone({ ...ticket(5), lines: [line(50, "takenBack")] })).toBe(
      true,
    );
    expect(stationGone(two)).toBe(false);
    expect(stationGone({ ...ticket(6, { status: "held" }), lines: [] })).toBe(
      false,
    );
  });

  it("reminds of a ticket waiting too long once, not again once reminded", () => {
    // Sent half an hour ago, but called five minutes in: it waits from then.
    const fired = ticket(2, { sentAt: at(-30), firedAt: at(5) });
    const tickets = [ticket(1), fired, ticket(3, { status: "ready" })];
    const now = Date.parse(at(15));
    expect(lateNews(tickets, now, 15, new Set())).toEqual([ID(1)]);
    expect(lateNews(tickets, now, 15, new Set([ID(1)]))).toEqual([]);
    expect(lateNews(tickets, Date.parse(at(10)), 15, new Set())).toEqual([]);
    // A ticket with nothing left to make is never late.
    expect(
      lateNews(
        [{ ...ticket(1), lines: [line(10, "cancelled")] }],
        now,
        15,
        new Set(),
      ),
    ).toEqual([]);
  });

  it("keeps a ticket that arrived fresh for half a minute", () => {
    const arrived = new Map([
      [ID(1), 0],
      [ID(2), 10_000],
    ]);
    expect(STATION_FRESH_MS).toBe(30_000);
    expect([...freshTickets(arrived, 29_999)]).toEqual([ID(1), ID(2)]);
    expect([...freshTickets(arrived, 30_000)]).toEqual([ID(2)]);
  });
});

describe("a station's connection", () => {
  it("is down offline or after two failed asks in a row", () => {
    expect(stationConnection(0, true)).toBe("ok");
    expect(stationConnection(1, true)).toBe("ok");
    expect(stationConnection(2, true)).toBe("down");
    expect(stationConnection(0, false)).toBe("down");
  });

  it("asks every 5 seconds, doubling on each failure up to half a minute, and not while hidden", () => {
    expect([0, 1, 2, 3, 4].map((n) => nextStationPoll(n, true))).toEqual([
      5_000, 10_000, 20_000, 30_000, 30_000,
    ]);
    expect(nextStationPoll(0, false)).toBeNull();
  });
});

describe("a new screen's name", () => {
  const numbered = (n: number) => `Kitchen ${n}`;

  it("is the department's, numbered from 2 when taken", () => {
    expect(orderStationName("Kitchen", [], numbered)).toBe("Kitchen");
    expect(orderStationName("Kitchen", ["Till"], numbered)).toBe("Kitchen");
    expect(orderStationName("Kitchen", [" Kitchen "], numbered)).toBe(
      "Kitchen 2",
    );
    expect(
      orderStationName("Kitchen", ["Kitchen", "Kitchen 2"], numbered),
    ).toBe("Kitchen 3");
  });
});
