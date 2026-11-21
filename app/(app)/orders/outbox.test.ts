import type { DraftLine } from "@domain/order-screens";
import type { OutboxRow } from "@domain/orders-outbox";
import { readOrdersSyncQuery, SEND_BODY_MAX } from "@domain/orders-sync";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryOrdersDb, type OrdersDb } from "./orders-db";
import {
  createOutbox,
  type OutboxEvent,
  pendingSends,
  unsentOf,
} from "./outbox";

/*
 * The outbox's state machine (waiter mode P7, the design's §13.1), over the
 * phone's store in memory, a stand-in server and fake timers: a round is on
 * the disk before it says it waits, goes once the phone is online, tries
 * again at 1, 2, 5, 10 and 30 seconds, comes back to its draft refused,
 * once across tabs; asks after ten minutes unless it went already; goes
 * only as its own person in its own business; takes the person's rounds
 * off the phone when signed out or no longer a member; sends one last time
 * as the page hides; and expires what isn't one's own.
 */

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ITEM = "00000000-0000-4000-8000-000000000003";
const YOAV = "00000000-0000-4000-8000-000000000004";
const NOA = "00000000-0000-4000-8000-000000000005";
const ORDER = "00000000-0000-4000-8000-000000000006";
const PLACE = "00000000-0000-4000-8000-000000000007";
const DRAFT = `place:${PLACE}`;
const T0 = Date.UTC(2026, 10, 21, 18, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

let keys = 0;
const newKey = () => {
  keys += 1;
  return `00000000-0000-4000-a000-${String(keys).padStart(12, "0")}`;
};

const line = (id: string, note: string | null = null): DraftLine => ({
  id,
  item: ITEM,
  quantity: 1,
  note,
  allergy: false,
  held: false,
  choices: [],
});

function row(
  extra: Partial<OutboxRow> & { lines?: DraftLine[] } = {},
): OutboxRow {
  const key = extra.key ?? newKey();
  const user = extra.user ?? YOAV;
  const business = extra.business ?? BUSINESS;
  const lines = extra.lines ?? [line(`line-${key}`)];
  const at = extra.queuedAt ?? T0;
  return {
    key,
    user,
    business,
    draft: DRAFT,
    body: {
      business,
      user,
      key,
      target: { place: PLACE },
      lines: lines.map((l) => ({
        item: l.item,
        quantity: l.quantity,
        ...(l.note ? { note: l.note } : {}),
      })),
    },
    lines,
    where: { placeName: "6", takeaway: null },
    queuedAt: at,
    askFrom: extra.askFrom ?? at,
    ...extra,
  };
}

const sent = (key: string) =>
  Response.json({
    ok: true,
    round: {
      round: key,
      order: ORDER,
      sentAt: new Date(T0).toISOString(),
      first: true,
      place: PLACE,
      takeaway: null,
      tickets: [],
    },
  });
const refusal = (failure: string, status: number) =>
  Response.json({ ok: false, failure, items: [], order: null }, { status });
const mine = (ids: string[]) =>
  Response.json({
    version: 1,
    mine: {
      version: 1,
      now: new Date(T0).toISOString(),
      day: "2026-11-21",
      rounds: ids.map((id) => ({
        id,
        order: ORDER,
        placeName: "6",
        takeaway: null,
        orderStatus: "open",
        sentAt: new Date(T0).toISOString(),
        tickets: [],
      })),
    },
  });

type Call = {
  url: string;
  method: string;
  key: string | null;
  keepalive: boolean;
  at: number;
};

let db: ReturnType<typeof memoryOrdersDb>;
let calls: Call[];
let server: (call: Call) => Response | Promise<Response>;
let online: boolean;
let events: OutboxEvent[];
/** The durability each write asked for, in order. */
let durability: string[];
/** Holds strict writes until opened, to see a round before it is kept. */
let gate: Promise<void> | null;

function outbox(store: () => Promise<OrdersDb> = async () => tracked()) {
  const box = createOutbox({
    db: store,
    fetch: async (url, init) => {
      const body =
        typeof init?.body === "string"
          ? (JSON.parse(init.body) as { key?: string })
          : null;
      const call: Call = {
        url,
        method: init?.method ?? "GET",
        key: body?.key ?? null,
        keepalive: Boolean(init?.keepalive),
        at: Date.now(),
      };
      calls.push(call);
      return server(call);
    },
    now: () => Date.now(),
    setTimeout: (run, ms) => setTimeout(run, ms),
    clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    online: () => online,
    channel: { post: () => {}, listen: () => {} },
  });
  box.listen((event) => events.push(event));
  return box;
}

/** The store, with each write's durability noted and strict ones held at the gate. */
function tracked(): OrdersDb {
  return {
    run: async (stores, mode, work, wanted) => {
      if (mode === "readwrite") durability.push(wanted ?? "relaxed");
      if (wanted === "strict" && gate) await gate;
      return db.run(stores, mode, work, wanted);
    },
    close: () => {},
  };
}

async function keep(...rows: unknown[]) {
  await db.run(["rounds"], "readwrite", (tx) => {
    for (const one of rows) tx.put("rounds", one);
  });
}

/** Time passes, and everything it set off settles. */
async function elapse(ms = 0) {
  await vi.advanceTimersByTimeAsync(ms);
  for (let i = 0; i < 20; i += 1) await Promise.resolve();
}

const posts = () => calls.filter((call) => call.method === "POST");
const yoav = { user: YOAV, business: BUSINESS, viewing: false };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  db = memoryOrdersDb();
  calls = [];
  server = (call) => (call.key ? sent(call.key) : mine([]));
  online = true;
  events = [];
  durability = [];
  gate = null;
});

afterEach(() => {
  vi.useRealTimers();
});

describe("a round on its way", () => {
  it("is on the disk before it says it waits, and goes once when the phone is online", async () => {
    online = false;
    const box = outbox();
    box.start(yoav);
    await elapse();
    let open = () => {};
    gate = new Promise((done) => {
      open = done;
    });
    const queued = vi.fn();
    const outcome = box.send(
      YOAV,
      BUSINESS,
      {
        draft: DRAFT,
        body: row({ key: "00000000-0000-4000-a000-0000000000aa" }).body,
        lines: [line("a")],
        where: { placeName: "6", takeaway: null },
      },
      { onQueued: queued },
    );
    await elapse();
    // Not on the disk yet: being sent, even offline.
    expect(queued).not.toHaveBeenCalled();
    expect(pendingSends(box.snapshot(YOAV, BUSINESS), DRAFT, T0)).toEqual([
      expect.objectContaining({ state: "sending" }),
    ]);
    open();
    await elapse();
    expect(durability).toContain("strict");
    expect(queued).toHaveBeenCalledTimes(1);
    expect(db.dump("rounds")).toHaveLength(1);
    expect(pendingSends(box.snapshot(YOAV, BUSINESS), DRAFT, T0)).toEqual([
      expect.objectContaining({ state: "waiting" }),
    ]);
    expect(unsentOf(box.snapshot(YOAV, BUSINESS))).toEqual({
      [DRAFT]: { count: 1, asks: 0 },
    });
    // Offline, nothing is tried.
    await elapse(60_000);
    expect(posts()).toEqual([]);

    online = true;
    box.flush();
    await elapse();
    expect(posts()).toHaveLength(1);
    expect(await outcome).toMatchObject({ ok: true });
    expect(db.dump("rounds")).toEqual([]);
    expect(box.snapshot(YOAV, BUSINESS).store.pending).toEqual({});
    expect(events).toEqual([
      expect.objectContaining({ kind: "sent", awaited: true, order: ORDER }),
    ]);
  });

  it("tries again at 1, 2, 5, 10 and 30 seconds, then every 30, with the same key", async () => {
    server = () => new Response(null, { status: 503 });
    const box = outbox();
    box.start(yoav);
    await elapse();
    const kept = row();
    void box.send(YOAV, BUSINESS, {
      draft: kept.draft,
      body: kept.body,
      lines: kept.lines,
      where: kept.where,
    });
    await elapse();
    for (const wait of [1000, 2000, 5000, 10_000, 30_000, 30_000]) {
      await elapse(wait);
    }
    const times = posts().map((call) => call.at);
    expect(times.slice(1).map((at, i) => at - (times[i] ?? 0))).toEqual([
      1000, 2000, 5000, 10_000, 30_000, 30_000,
    ]);
    expect(new Set(posts().map((call) => call.key))).toEqual(
      new Set([kept.key]),
    );
    expect(box.snapshot(YOAV, BUSINESS).retrying.has(kept.key)).toBe(true);
  });

  it("sends a round again with the same key when its success can't be read, never back in the draft", async () => {
    // The round went, but its answer was cut off: the database answers the
    // same key with the same round.
    let first = true;
    server = (call) => {
      if (!call.key) return mine([]);
      if (first) {
        first = false;
        return new Response("<html>", { status: 200 });
      }
      return sent(call.key);
    };
    const box = outbox();
    box.start(yoav);
    await elapse();
    const kept = row();
    const outcome = box.send(YOAV, BUSINESS, {
      draft: kept.draft,
      body: kept.body,
      lines: kept.lines,
      where: kept.where,
    });
    await elapse();
    await elapse(1000);
    expect(await outcome).toMatchObject({ ok: true });
    expect(posts().map((call) => call.key)).toEqual([kept.key, kept.key]);
    const held = box.snapshot(YOAV, BUSINESS);
    expect(held.store.drafts[DRAFT] ?? []).toEqual([]);
    expect(held.refusals[DRAFT]).toBeUndefined();
    expect(events).toEqual([expect.objectContaining({ kind: "sent" })]);
  });

  it("puts a refused round's lines at the front of its draft with the reason, kept, and says so with no screen waiting", async () => {
    const kept = row({ lines: [line("sent")] });
    await keep(kept);
    await db.run(["drafts"], "readwrite", (tx) =>
      tx.put("drafts", {
        user: YOAV,
        business: BUSINESS,
        draft: DRAFT,
        lines: [line("added")],
        refusal: null,
        at: T0,
      }),
    );
    server = () => refusal("choices", 422);
    const box = outbox();
    box.start(yoav);
    await elapse();
    const held = box.snapshot(YOAV, BUSINESS);
    expect(held.store.drafts[DRAFT]?.map((l) => l.id)).toEqual([
      "sent",
      "added",
    ]);
    expect(held.refusals[DRAFT]).toMatchObject({
      failure: "choices",
      seen: false,
    });
    expect(db.dump("rounds")).toEqual([]);
    expect(db.dump("drafts")).toEqual([
      expect.objectContaining({
        lines: [
          expect.objectContaining({ id: "sent" }),
          expect.objectContaining({ id: "added" }),
        ],
        refusal: expect.objectContaining({ failure: "choices", seen: false }),
      }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({ kind: "refused", awaited: false }),
    ]);
    // Its screen drew it.
    box.seeRefusal(YOAV, BUSINESS, DRAFT);
    await elapse();
    expect(db.dump("drafts")).toEqual([
      expect.objectContaining({
        refusal: expect.objectContaining({ seen: true }),
      }),
    ]);
  });

  it("changes nothing for a refusal whose round another tab settled first, and reads the draft again", async () => {
    const kept = row({ lines: [line("sent")] });
    await keep(kept);
    server = async () => {
      // The other tab had the same answer first, and put the lines back.
      await db.run(["rounds", "drafts"], "readwrite", (tx) => {
        tx.delete("rounds", kept.key);
        tx.put("drafts", {
          user: YOAV,
          business: BUSINESS,
          draft: DRAFT,
          lines: [line("sent")],
          refusal: {
            ok: false,
            failure: "choices",
            items: [],
            order: null,
            target: { place: PLACE },
            seen: false,
          },
          at: T0,
        });
      });
      return refusal("choices", 422);
    };
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(events).toEqual([]);
    const held = box.snapshot(YOAV, BUSINESS);
    // Once: as the other tab put them back.
    expect(held.store.drafts[DRAFT]?.map((l) => l.id)).toEqual(["sent"]);
    expect(held.refusals[DRAFT]).toMatchObject({ failure: "choices" });
    expect(held.store.pending).toEqual({});
  });
});

describe("after ten minutes", () => {
  it("stops, checks one's own rounds, and asks once", async () => {
    const kept = row({ queuedAt: T0 - 9 * MINUTE });
    await keep(kept);
    server = (call) =>
      call.method === "POST" ? new Response(null, { status: 503 }) : mine([]);
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(posts()).toHaveLength(1);
    await elapse(2 * MINUTE);
    const tries = posts().length;
    expect(box.snapshot(YOAV, BUSINESS).asking.has(kept.key)).toBe(true);
    const syncs = calls.filter((call) => call.url.startsWith("/orders-sync"));
    expect(syncs.length).toBeGreaterThan(0);
    // One's own rounds, read with nothing showing them (from Home or the
    // schedule too): what turned ready stays unread, for its push (P8b).
    for (const call of syncs) {
      const query = readOrdersSyncQuery(
        new URL(call.url, "http://localhost").searchParams,
      );
      expect(query).toMatchObject({ mine: true, shown: false });
    }
    expect(events.filter((event) => event.kind === "asks")).toHaveLength(1);
    expect(
      pendingSends(box.snapshot(YOAV, BUSINESS), DRAFT, Date.now()),
    ).toEqual([
      expect.objectContaining({
        state: "ask",
        age: { unit: "minutes", count: 11 },
      }),
    ]);
    // It waits for the person now: nothing more goes, and it asks no more.
    await elapse(10 * MINUTE);
    box.flush();
    await elapse();
    expect(posts()).toHaveLength(tries);
    expect(events.filter((event) => event.kind === "asks")).toHaveLength(1);
  });

  it('goes again on "שליחה", its ten minutes from now', async () => {
    const kept = row({ queuedAt: T0 - 11 * MINUTE });
    await keep(kept);
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(posts()).toEqual([]);
    expect(box.snapshot(YOAV, BUSINESS).asking.has(kept.key)).toBe(true);
    server = (call) =>
      call.method === "POST" ? new Response(null, { status: 503 }) : mine([]);
    box.answer(YOAV, BUSINESS, kept.key);
    await elapse();
    expect(posts()).toHaveLength(1);
    expect(box.snapshot(YOAV, BUSINESS).asking.has(kept.key)).toBe(false);
    expect(db.dump("rounds")).toEqual([
      expect.objectContaining({ askFrom: T0 }),
    ]);
  });

  it('goes from the phone on "הסרה מהטלפון", and comes back asking on its undo', async () => {
    const kept = row({ queuedAt: T0 - 11 * MINUTE });
    await keep(kept);
    const box = outbox();
    box.start(yoav);
    await elapse();
    const removed = box.remove(YOAV, BUSINESS, kept.key);
    await elapse();
    expect(removed?.key).toBe(kept.key);
    expect(db.dump("rounds")).toEqual([]);
    expect(box.snapshot(YOAV, BUSINESS).store.pending).toEqual({});
    if (removed) box.restore(removed);
    await elapse();
    expect(db.dump("rounds")).toHaveLength(1);
    expect(durability.at(-1)).toBe("strict");
    const held = box.snapshot(YOAV, BUSINESS);
    expect(held.asking.has(kept.key)).toBe(true);
    expect(held.kept.has(kept.key)).toBe(true);
    expect(posts()).toEqual([]);
  });

  it("settles as sent a round that went already, and never asks about it", async () => {
    const kept = row({ queuedAt: T0 - 11 * MINUTE });
    await keep(kept);
    server = (call) => (call.key ? sent(call.key) : mine([kept.key]));
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(posts()).toEqual([]);
    expect(events).toEqual([
      expect.objectContaining({ kind: "sent", awaited: false }),
    ]);
    expect(db.dump("rounds")).toEqual([]);
  });
});

describe("never as the wrong person", () => {
  it("leaves another person's rounds unread and unsent", async () => {
    const noas = row({ user: NOA });
    await keep(noas);
    const box = outbox();
    box.start(yoav);
    await elapse(MINUTE);
    expect(box.snapshot(YOAV, BUSINESS).store.pending).toEqual({});
    expect(posts()).toEqual([]);
    expect(db.dump("rounds")).toHaveLength(1);
  });

  it("sends nothing as the next person once the session switched during a wait", async () => {
    const kept = row();
    await keep(kept);
    server = () => new Response(null, { status: 503 });
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(posts()).toHaveLength(1);
    box.start({ user: NOA, business: BUSINESS, viewing: false });
    await elapse(5 * MINUTE);
    expect(posts()).toHaveLength(1);
    expect(db.dump("rounds")).toHaveLength(1);
  });

  it("holds the person's rounds when the cookie is another's, and says so", async () => {
    const kept = row();
    await keep(kept);
    server = () => refusal("person", 409);
    const box = outbox();
    box.start(yoav);
    await elapse(5 * MINUTE);
    expect(posts()).toHaveLength(1);
    expect(events).toEqual([{ kind: "person", user: YOAV }]);
    expect(db.dump("rounds")).toHaveLength(1);
  });

  it("sends nothing while viewing", async () => {
    await keep(row());
    const box = outbox();
    box.start({ ...yoav, viewing: true });
    await elapse(MINUTE);
    expect(posts()).toEqual([]);
  });
});

describe("taken off the phone", () => {
  async function evening() {
    const here = row();
    const elsewhere = row({ business: OTHER });
    const noas = row({ user: NOA });
    await keep(here, elsewhere, noas);
    await db.run(["drafts", "menus"], "readwrite", (tx) => {
      tx.put("drafts", {
        user: YOAV,
        business: BUSINESS,
        draft: DRAFT,
        lines: [line("kept")],
        refusal: null,
        at: T0,
      });
      for (const business of [BUSINESS, OTHER]) {
        tx.put("menus", {
          user: YOAV,
          business,
          version: 1,
          menu: { version: 1, categories: [], items: [], places: [] },
          at: T0,
        });
      }
    });
    return { here, elsewhere, noas };
  }

  it("signed out: the person's rounds go in every business, with their menus; drafts and others' stay", async () => {
    const { noas } = await evening();
    server = () => refusal("signedOut", 401);
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(db.dump("rounds")).toEqual([
      expect.objectContaining({ key: noas.key }),
    ]);
    expect(db.dump("menus")).toEqual([]);
    expect(db.dump("drafts")).toHaveLength(1);
    const lost = events.filter((event) => event.kind === "lost");
    expect(lost).toEqual([
      expect.objectContaining({ why: "signedOut", user: YOAV }),
    ]);
    expect(lost[0]?.kind === "lost" && lost[0].rows).toHaveLength(2);
  });

  it("no longer a member: only that business's rounds and menu go", async () => {
    const { elsewhere, noas } = await evening();
    server = () => refusal("notMember", 403);
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(
      db
        .dump("rounds")
        .map((one) => (one as OutboxRow).key)
        .sort(),
    ).toEqual([elsewhere.key, noas.key].sort());
    expect(db.dump("menus")).toEqual([
      expect.objectContaining({ business: OTHER }),
    ]);
    expect(events).toEqual([
      expect.objectContaining({ kind: "lost", why: "notMember" }),
    ]);
  });
});

describe("as the page hides", () => {
  it("sends each young round of the session's once with keepalive, under 64 KB", async () => {
    online = false;
    // Ten full rounds, about 8 KB each: only so many fit in keepalive's 64.
    const notes = Array.from({ length: 40 }, (_, i) =>
      line(`n${i}`, "x".repeat(120)),
    );
    const full = Array.from({ length: 10 }, () => row({ lines: notes }));
    const fit = Math.floor(
      SEND_BODY_MAX / JSON.stringify(full[0]?.body).length,
    );
    expect(fit).toBeLessThan(10);
    const asking = row({ queuedAt: T0 - 11 * MINUTE });
    const elsewhere = row({ business: OTHER });
    const noas = row({ user: NOA });
    await keep(...full, asking, elsewhere, noas);
    server = (call) => (call.key ? sent(call.key) : mine([]));
    const box = outbox();
    box.start(yoav);
    await elapse();
    box.hide();
    await elapse();
    const sentOnHide = posts();
    expect(sentOnHide).toHaveLength(fit);
    expect(sentOnHide.every((call) => call.keepalive)).toBe(true);
    const fullKeys = new Set(full.map((one) => one.key));
    expect(sentOnHide.every((call) => fullKeys.has(call.key ?? ""))).toBe(true);
    // Once per hide.
    box.hide();
    await elapse();
    expect(posts()).toHaveLength(fit);
  });
});

describe("what the phone keeps", () => {
  it("drops another person's rounds and every draft and menu untouched for 16 hours, and what doesn't read", async () => {
    const old = row({ user: NOA, queuedAt: T0 - 17 * HOUR });
    const young = row({ user: NOA, queuedAt: T0 - HOUR });
    const own = row({ queuedAt: T0 - 20 * HOUR });
    await keep(old, young, own, { key: "junk" });
    await db.run(["drafts", "menus"], "readwrite", (tx) => {
      tx.put("drafts", {
        user: YOAV,
        business: BUSINESS,
        draft: DRAFT,
        lines: [line("old")],
        refusal: null,
        at: T0 - 17 * HOUR,
      });
      tx.put("menus", {
        user: NOA,
        business: BUSINESS,
        version: 1,
        menu: { version: 1, categories: [], items: [], places: [] },
        at: T0 - 17 * HOUR,
      });
    });
    online = false;
    const box = outbox();
    box.start(yoav);
    await elapse();
    expect(
      db
        .dump("rounds")
        .map((one) => (one as OutboxRow).key)
        .sort(),
    ).toEqual([young.key, own.key].sort());
    expect(db.dump("drafts")).toEqual([]);
    expect(db.dump("menus")).toEqual([]);
  });

  it("reads an owner again when another tab says it changed", async () => {
    const box = outbox();
    box.start(yoav);
    await elapse();
    await db.run(["drafts"], "readwrite", (tx) =>
      tx.put("drafts", {
        user: YOAV,
        business: BUSINESS,
        draft: DRAFT,
        lines: [line("from-the-other-tab")],
        refusal: null,
        at: T0,
      }),
    );
    expect(box.snapshot(YOAV, BUSINESS).store.drafts[DRAFT]).toBeUndefined();
    box.heard({ user: YOAV, business: BUSINESS });
    await elapse();
    expect(
      box.snapshot(YOAV, BUSINESS).store.drafts[DRAFT]?.map((l) => l.id),
    ).toEqual(["from-the-other-tab"]);
  });

  it("keeps a change made before the first read, over what was kept", async () => {
    await db.run(["drafts"], "readwrite", (tx) =>
      tx.put("drafts", {
        user: YOAV,
        business: BUSINESS,
        draft: DRAFT,
        lines: [line("kept")],
        refusal: null,
        at: T0,
      }),
    );
    const box = outbox();
    box.change(YOAV, BUSINESS, (was) => ({
      ...was,
      drafts: {
        ...was.drafts,
        [DRAFT]: [...(was.drafts[DRAFT] ?? []), line("tapped")],
      },
    }));
    box.start(yoav);
    await elapse();
    expect(
      box.snapshot(YOAV, BUSINESS).store.drafts[DRAFT]?.map((l) => l.id),
    ).toEqual(["kept", "tapped"]);
    expect(db.dump("drafts")).toEqual([
      expect.objectContaining({
        lines: [
          expect.objectContaining({ id: "kept" }),
          expect.objectContaining({ id: "tapped" }),
        ],
      }),
    ]);
  });

  it("keeps the newest menu only, and opens with it", async () => {
    const box = outbox();
    const menu = (version: number) => ({
      version,
      categories: [],
      items: [],
      places: [],
    });
    box.saveMenu(YOAV, BUSINESS, menu(3));
    box.saveMenu(YOAV, BUSINESS, menu(2));
    await elapse();
    expect((await box.menu(YOAV, BUSINESS))?.version).toBe(3);
    expect(await box.menu(NOA, BUSINESS)).toBeNull();
  });

  it("sends all the same where the phone's store won't open", async () => {
    const box = outbox(() => Promise.reject(new Error("blocked")));
    box.start(yoav);
    await elapse();
    const kept = row();
    const outcome = await box.send(YOAV, BUSINESS, {
      draft: kept.draft,
      body: kept.body,
      lines: kept.lines,
      where: kept.where,
    });
    expect(outcome).toMatchObject({ ok: true });
    expect(posts()).toHaveLength(1);
  });
});
