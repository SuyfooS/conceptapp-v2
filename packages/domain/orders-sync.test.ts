import { describe, expect, it } from "vitest";
import {
  laterServerTime,
  nextOrdersSyncDelay,
  nextOrdersSyncQuery,
  ORDERS_SYNC_MS,
  ordersSyncAnswer,
  ordersSyncHref,
  readOrdersSyncQuery,
  retriesSend,
  SEND_BODY_MAX,
  SEND_RETRY_MS,
  sendAnswer,
  sendBody,
  sendRetryDelay,
  syncedVersion,
} from "./orders-sync";

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const ITEM = "00000000-0000-4000-8000-000000000002";
const ORDER = "00000000-0000-4000-8000-000000000003";
const KEY = "00000000-0000-4000-8000-000000000004";

const read = (href: string) =>
  readOrdersSyncQuery(new URL(href, "http://localhost").searchParams);

describe("when the mode asks again", () => {
  it("asks every 15 seconds while visible, and not while hidden", () => {
    expect(nextOrdersSyncDelay({ visible: true, failures: 0 })).toBe(
      ORDERS_SYNC_MS,
    );
    expect(nextOrdersSyncDelay({ visible: false, failures: 0 })).toBeNull();
  });

  it("waits twice as long after each failure, up to a minute", () => {
    expect(nextOrdersSyncDelay({ visible: true, failures: 1 })).toBe(30_000);
    expect(nextOrdersSyncDelay({ visible: true, failures: 5 })).toBe(60_000);
    expect(nextOrdersSyncDelay({ visible: true, failures: Number.NaN })).toBe(
      ORDERS_SYNC_MS,
    );
  });
});

describe("what a sync asks", () => {
  it("reads back what the screen wrote", () => {
    const query = {
      business: BUSINESS,
      version: 1_779_000_000_000_000,
      menu: 12,
      floor: true,
      mine: true,
      prep: false,
      order: ORDER,
    };
    expect(read(ordersSyncHref(query))).toEqual(query);
    const first = {
      ...query,
      version: null,
      menu: "new" as const,
      order: null,
    };
    expect(read(ordersSyncHref(first))).toEqual(first);
    expect(ordersSyncHref(first)).toContain("m=");
  });

  it("refuses a question that isn't one", () => {
    expect(read("/orders-sync?f=1")).toBeNull();
    expect(read("/orders-sync?b=nope&f=1")).toBeNull();
    expect(read(`/orders-sync?b=${BUSINESS}`)).toBeNull();
    expect(read(`/orders-sync?b=${BUSINESS}&f=2`)).toBeNull();
    expect(read(`/orders-sync?b=${BUSINESS}&f=1&v=-1`)).toBeNull();
    expect(read(`/orders-sync?b=${BUSINESS}&f=1&v=1.5`)).toBeNull();
    expect(read(`/orders-sync?b=${BUSINESS}&f=1&m=x`)).toBeNull();
    expect(read(`/orders-sync?b=${BUSINESS}&f=1&o=x`)).toBeNull();
    expect(read(`/orders-sync?b=${BUSINESS}&p=1`)).toMatchObject({
      prep: true,
    });
  });

  describe("the mode's next question", () => {
    const held = {
      floor: { version: 7 },
      mine: { version: 5 },
      prep: { version: 9 },
      menu: { version: 2 },
      orders: {} as Record<string, number | null>,
    };
    const ask = (
      extra: Partial<Parameters<typeof nextOrdersSyncQuery>[0]> = {},
    ) =>
      nextOrdersSyncQuery({
        business: BUSINESS,
        takes: true,
        viewing: false,
        prepares: false,
        off: false,
        wants: [{ floor: true, prep: false, order: null }],
        held,
        ...extra,
      });

    it("asks from the oldest read it holds of what the screens want", () => {
      expect(ask()).toEqual({
        business: BUSINESS,
        version: 5,
        menu: 2,
        floor: true,
        mine: true,
        prep: false,
        order: null,
      });
      expect(ask({ held: { ...held, mine: null } }).version).toBeNull();
      expect(ask({ held: { ...held, menu: null } }).menu).toBe("new");
    });

    it("reads an order it wants whole once, whatever moved: the first send at a free place", () => {
      // The send's own sync brought the floor and mine at the new version,
      // and the floor named the order: it isn't held yet.
      const first = ask({
        wants: [
          { floor: true, prep: false, order: null },
          { floor: false, prep: false, order: ORDER },
        ],
      });
      expect(first).toMatchObject({ order: ORDER, version: null });
      // Once it is, at a version it knows (an order no longer to read is
      // held as none, at the version that said so), by version.
      expect(
        ask({
          wants: [{ floor: true, prep: false, order: ORDER }],
          held: { ...held, orders: { [ORDER]: 6 } },
        }),
      ).toMatchObject({ order: ORDER, version: 5 });
      // Drawn by the server at a version it doesn't know: whole again.
      expect(
        ask({
          wants: [{ floor: true, prep: false, order: ORDER }],
          held: { ...held, orders: { [ORDER]: null } },
        }),
      ).toMatchObject({ order: ORDER, version: null });
    });

    it("asks from the version an order was read at, when it is older than the rest", () => {
      // Table 4 was read at 3 and left for the floor, whose sync moved the
      // floor and mine on to 7 and 5 while another waiter added a round to
      // table 4. Back at table 4 (the phone's back), the order is asked from
      // 3: what moved since is read, the order whole with it.
      expect(
        ask({
          wants: [
            { floor: true, prep: false, order: null },
            { floor: false, prep: false, order: ORDER },
          ],
          held: { ...held, orders: { [ORDER]: 3 } },
        }),
      ).toMatchObject({ order: ORDER, version: 3 });
      // An order alone, with nothing else asked, is read whole each time.
      expect(
        ask({
          takes: false,
          wants: [{ floor: false, prep: false, order: ORDER }],
          held: { ...held, orders: { [ORDER]: 3 } },
        }),
      ).toMatchObject({ order: ORDER, version: null });
    });

    it("asks a taker off a shift for their own rounds whole, and nothing of the floor", () => {
      expect(
        ask({
          off: true,
          wants: [{ floor: true, prep: false, order: ORDER }],
        }),
      ).toMatchObject({
        version: null,
        floor: false,
        mine: true,
        order: null,
      });
    });

    it("asks the kitchen's tickets for whoever prepares, and nobody's own rounds while viewing", () => {
      const prep = [{ floor: false, prep: true, order: null }];
      expect(ask({ wants: prep, prepares: true })).toMatchObject({
        prep: true,
        floor: false,
        version: 5,
      });
      expect(ask({ wants: prep })).toMatchObject({ prep: false });
      expect(
        ask({ wants: prep, prepares: true, takes: false, viewing: true }),
      ).toMatchObject({ mine: false, prep: true, version: 9 });
    });

    it("asks only the menu where no screen wants anything, and that is a question", () => {
      const menuOnly = ask({ takes: false, wants: [] });
      expect(menuOnly).toMatchObject({
        floor: false,
        mine: false,
        prep: false,
        order: null,
        version: null,
        menu: 2,
      });
      expect(read(ordersSyncHref(menuOnly))).toEqual(menuOnly);
    });
  });

  it("answers with the smallest version of the reads it made, so nothing is missed", () => {
    expect(syncedVersion([5, undefined, 3])).toBe(3);
    expect(syncedVersion([undefined, null])).toBeNull();
  });

  it("keeps the mode's clock from the latest server time it heard, never an older one", () => {
    const t0 = "2026-11-20T18:00:00Z";
    const later = "2026-11-20T18:10:00Z";
    expect(laterServerTime(null, t0)).toBe(Date.parse(t0));
    expect(laterServerTime(Date.parse(t0), later)).toBe(Date.parse(later));
    // The floor drawn again with what the server said ten minutes ago.
    expect(laterServerTime(Date.parse(later), t0)).toBeNull();
    expect(laterServerTime(Date.parse(t0), t0)).toBeNull();
    expect(laterServerTime(null, undefined)).toBeNull();
    expect(laterServerTime(null, "nope")).toBeNull();
  });

  it("reads its answer as the routes write it", () => {
    expect(ordersSyncAnswer.safeParse({ version: 3 }).success).toBe(true);
    expect(
      ordersSyncAnswer.safeParse({ version: 3, order: null }).success,
    ).toBe(true);
    expect(ordersSyncAnswer.safeParse({ version: -1 }).success).toBe(false);
  });
});

describe("the send", () => {
  const body = (extra: Record<string, unknown> = {}) => ({
    business: BUSINESS,
    key: KEY,
    target: { takeaway: true },
    lines: [{ item: ITEM, quantity: 1 }],
    ...extra,
  });

  it("names the business it was written for, and no more than 40 lines", () => {
    expect(sendBody.safeParse(body()).success).toBe(true);
    expect(sendBody.safeParse(body({ business: "x" })).success).toBe(false);
    expect(sendBody.safeParse({ ...body(), business: undefined }).success).toBe(
      false,
    );
    expect(
      sendBody.safeParse(
        body({
          lines: Array.from({ length: 41 }, () => ({
            item: ITEM,
            quantity: 1,
          })),
        }),
      ).success,
    ).toBe(false);
    expect(sendBody.safeParse(body({ extra: 1 })).success).toBe(false);
  });

  it("fits a full round in keepalive's limit", () => {
    const full = body({
      lines: Array.from({ length: 40 }, () => ({
        item: ITEM,
        quantity: 99,
        note: "א".repeat(120),
        allergy: true,
        held: true,
      })),
    });
    expect(sendBody.safeParse(full).success).toBe(true);
    expect(JSON.stringify(full).length).toBeLessThan(SEND_BODY_MAX);
  });

  it("tries again at 1, 2, 5, 10 and 30 seconds, then every 30", () => {
    expect(SEND_RETRY_MS.map((_, at) => sendRetryDelay(at))).toEqual([
      1000, 2000, 5000, 10_000, 30_000,
    ]);
    expect(sendRetryDelay(9)).toBe(30_000);
    expect(sendRetryDelay(-1)).toBe(1000);
  });

  it("tries again only when nothing came back or the server failed on its way", () => {
    for (const status of [null, 500, 502, 503, 504]) {
      expect(retriesSend(status)).toBe(true);
    }
    for (const status of [200, 400, 401, 403, 404, 409, 422, 429]) {
      expect(retriesSend(status)).toBe(false);
    }
  });

  it("reads its answer: the round, or the refusal with what it names", () => {
    expect(
      sendAnswer.safeParse({
        ok: true,
        round: {
          round: KEY,
          order: ORDER,
          sentAt: "2026-11-20T18:00:00Z",
          first: true,
          place: null,
          takeaway: 1,
          tickets: [],
        },
      }).success,
    ).toBe(true);
    expect(
      sendAnswer.parse({ ok: false, failure: "unavailable", items: [ITEM] }),
    ).toEqual({
      ok: false,
      failure: "unavailable",
      items: [ITEM],
      order: null,
    });
    expect(
      sendAnswer.safeParse({ ok: false, failure: "x".repeat(41) }).success,
    ).toBe(false);
  });
});
