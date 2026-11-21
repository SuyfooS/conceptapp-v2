import { describe, expect, it } from "vitest";
import {
  askAge,
  draftRecordSchema,
  keepsRecord,
  menuRecordSchema,
  OUTBOX_ASK_MS,
  OUTBOX_KEEP_MS,
  type OutboxRow,
  outboxRowSchema,
  rowTurn,
  sendVerdict,
  sentAlready,
} from "./orders-outbox";

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const OTHER_BUSINESS = "00000000-0000-4000-8000-000000000002";
const ITEM = "00000000-0000-4000-8000-000000000003";
const KEY = "00000000-0000-4000-8000-000000000004";
const YOAV = "00000000-0000-4000-8000-000000000005";
const NOA = "00000000-0000-4000-8000-000000000006";
const ORDER = "00000000-0000-4000-8000-000000000007";

const T0 = Date.UTC(2026, 10, 21, 18, 0);
const MINUTE = 60_000;

const row = (extra: Partial<OutboxRow> = {}): OutboxRow => ({
  key: KEY,
  user: YOAV,
  business: BUSINESS,
  draft: "takeaway:new",
  body: {
    business: BUSINESS,
    user: YOAV,
    key: KEY,
    target: { takeaway: true },
    lines: [{ item: ITEM, quantity: 1 }],
  },
  lines: [
    {
      id: "line-1",
      item: ITEM,
      quantity: 1,
      note: null,
      allergy: false,
      held: false,
      choices: [],
    },
  ],
  where: { placeName: null, takeaway: null },
  queuedAt: T0,
  askFrom: T0,
  ...extra,
});

const yoav = { user: YOAV, business: BUSINESS, viewing: false };

describe("whose turn a kept round is", () => {
  it("goes for its own person in its own business only", () => {
    expect(rowTurn(row(), yoav, T0)).toBe("send");
    expect(rowTurn(row(), null, T0)).toBe("hold");
    expect(rowTurn(row(), { ...yoav, user: NOA }, T0)).toBe("hold");
    expect(rowTurn(row(), { ...yoav, business: OTHER_BUSINESS }, T0)).toBe(
      "hold",
    );
    expect(rowTurn(row(), { ...yoav, viewing: true }, T0)).toBe("hold");
    // Ids in another case are the same person.
    expect(rowTurn(row(), { ...yoav, user: YOAV.toUpperCase() }, T0)).toBe(
      "send",
    );
  });

  it("asks once it hasn't gone for ten minutes, from its last send", () => {
    expect(rowTurn(row(), yoav, T0 + 10 * MINUTE - 1000)).toBe("send");
    expect(rowTurn(row(), yoav, T0 + OUTBOX_ASK_MS)).toBe("ask");
    // "שליחה" counts from now.
    expect(
      rowTurn(row({ askFrom: T0 + 12 * MINUTE }), yoav, T0 + 13 * MINUTE),
    ).toBe("send");
    // The clock set back: fresh.
    expect(rowTurn(row(), yoav, T0 - 60 * MINUTE)).toBe("send");
  });

  it("says how long it hasn't gone, in minutes, then hours", () => {
    const age = (minutes: number) => askAge(row(), T0 + minutes * MINUTE);
    expect(age(10)).toEqual({ unit: "minutes", count: 10 });
    expect(age(59)).toEqual({ unit: "minutes", count: 59 });
    expect(age(60)).toEqual({ unit: "hours", count: 1 });
    expect(age(61)).toEqual({ unit: "hours", count: 1 });
    expect(age(180)).toEqual({ unit: "hours", count: 3 });
    expect(age(-5)).toEqual({ unit: "minutes", count: 0 });
  });
});

describe("what a send's answer means", () => {
  const round = {
    round: KEY,
    order: ORDER,
    sentAt: "2026-11-21T18:00:00Z",
    first: true,
    place: null,
    takeaway: 3,
    tickets: [],
  };
  const refusal = (failure: string, order: string | null = null) => ({
    ok: false,
    failure,
    items: [],
    order,
  });

  it("is the round once it went", () => {
    expect(sendVerdict(200, { ok: true, round })).toEqual({
      kind: "sent",
      round,
    });
  });

  it("refuses by the body's reason, with what it names", () => {
    expect(sendVerdict(422, refusal("choices"))).toEqual({
      kind: "refused",
      failure: "choices",
      items: [],
      order: null,
    });
    expect(sendVerdict(409, refusal("taken", ORDER))).toMatchObject({
      kind: "refused",
      failure: "taken",
      order: ORDER,
    });
    expect(sendVerdict(404, refusal("gone"))).toMatchObject({
      failure: "gone",
    });
    // A reason the phone doesn't know stays as it came.
    expect(sendVerdict(409, refusal("somethingNew"))).toMatchObject({
      kind: "refused",
      failure: "somethingNew",
    });
  });

  it("refuses by the status when the body says nothing", () => {
    expect(sendVerdict(409, "junk")).toMatchObject({
      kind: "refused",
      failure: "failed",
    });
    expect(sendVerdict(403, null)).toMatchObject({ failure: "noAccess" });
    expect(sendVerdict(429, null)).toMatchObject({ failure: "tooMany" });
  });

  it("loses the person's rounds signed out or no longer a member, and holds them for another person", () => {
    expect(sendVerdict(401, refusal("signedOut"))).toEqual({
      kind: "lost",
      why: "signedOut",
    });
    expect(sendVerdict(401, null)).toEqual({ kind: "lost", why: "signedOut" });
    expect(sendVerdict(403, refusal("notMember"))).toEqual({
      kind: "lost",
      why: "notMember",
    });
    expect(sendVerdict(409, refusal("person"))).toEqual({ kind: "person" });
  });

  it("tries again when nothing came back or the server failed on its way", () => {
    for (const status of [null, 500, 502, 503, 504]) {
      expect(sendVerdict(status, null)).toEqual({ kind: "retry" });
    }
  });

  it("tries again, with the same key, a success whose round can't be read", () => {
    // The round may have been written: never a refusal that puts its lines
    // back in the draft, to go again under a new key.
    expect(sendVerdict(200, null)).toEqual({ kind: "retry" });
    expect(sendVerdict(200, "<html>")).toEqual({ kind: "retry" });
    expect(sendVerdict(200, { ok: true, round: { id: "x" } })).toEqual({
      kind: "retry",
    });
    expect(sendVerdict(204, null)).toEqual({ kind: "retry" });
    expect(sendVerdict(200, refusal("taken"))).toEqual({ kind: "retry" });
  });
});

describe("what the phone keeps", () => {
  it("reads a round back only as its body's", () => {
    expect(outboxRowSchema.safeParse(row()).success).toBe(true);
    expect(
      outboxRowSchema.safeParse({
        ...row(),
        key: "00000000-0000-4000-8000-0000000000aa",
      }).success,
    ).toBe(false);
    expect(outboxRowSchema.safeParse({ ...row(), user: NOA }).success).toBe(
      false,
    );
    expect(
      outboxRowSchema.safeParse({ ...row(), business: OTHER_BUSINESS }).success,
    ).toBe(false);
    expect(outboxRowSchema.safeParse("junk").success).toBe(false);
    expect(
      outboxRowSchema.safeParse({ ...row(), lines: [{ id: "x" }] }).success,
    ).toBe(false);
  });

  it("reads a draft with its refusal, and a menu at its version", () => {
    const draft = {
      user: YOAV,
      business: BUSINESS,
      draft: "takeaway:new",
      lines: row().lines,
      refusal: {
        ok: false,
        failure: "choices",
        items: [],
        order: null,
        target: { takeaway: true },
        seen: false,
      },
      at: T0,
    };
    expect(draftRecordSchema.safeParse(draft).success).toBe(true);
    expect(
      draftRecordSchema.safeParse({ ...draft, refusal: { seen: true } })
        .success,
    ).toBe(false);
    const menu = { version: 4, categories: [], items: [], places: [] };
    const record = { user: YOAV, business: BUSINESS, version: 4, menu, at: T0 };
    expect(menuRecordSchema.safeParse(record).success).toBe(true);
    expect(menuRecordSchema.safeParse({ ...record, version: 5 }).success).toBe(
      false,
    );
  });

  it("keeps one's own rounds, and drops the rest after 16 hours untouched", () => {
    const old = { user: NOA, at: T0 };
    const later = (hours: number) => T0 + hours * 3_600_000;
    expect(keepsRecord("row", old, yoav, later(15))).toBe(true);
    expect(keepsRecord("row", old, yoav, T0 + OUTBOX_KEEP_MS)).toBe(false);
    expect(keepsRecord("row", { user: YOAV, at: T0 }, yoav, later(20))).toBe(
      true,
    );
    // With nobody signed in here, nobody's are their own.
    expect(keepsRecord("row", { user: YOAV, at: T0 }, null, later(20))).toBe(
      false,
    );
    for (const kind of ["draft", "menu"] as const) {
      expect(keepsRecord(kind, { user: YOAV, at: T0 }, yoav, later(15))).toBe(
        true,
      );
      expect(keepsRecord(kind, { user: YOAV, at: T0 }, yoav, later(16))).toBe(
        false,
      );
    }
  });

  it("finds the rounds that went already among one's own", () => {
    const other = row({ key: "00000000-0000-4000-8000-0000000000bb" });
    const mine = {
      rounds: [{ id: KEY.toUpperCase(), order: ORDER, takeaway: 3 }],
    };
    expect(sentAlready([row(), other], mine)).toEqual([
      { row: row(), order: ORDER, takeaway: 3 },
    ]);
    expect(sentAlready([other], { rounds: [] })).toEqual([]);
  });
});
