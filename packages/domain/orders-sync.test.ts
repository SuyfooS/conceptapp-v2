import { describe, expect, it } from "vitest";
import {
  nextOrdersSyncDelay,
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

  it("answers with the smallest version of the reads it made, so nothing is missed", () => {
    expect(syncedVersion([5, undefined, 3])).toBe(3);
    expect(syncedVersion([undefined, null])).toBeNull();
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
