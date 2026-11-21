import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { memoryOrdersDb } from "./orders-db";

/*
 * A session's end on the phone (waiter mode P7): signing out says what
 * hasn't gone and clears the person's records, locking a station clears
 * everyone's, each with what expired and P4's leftovers in sessionStorage,
 * and nothing more is written in the page after. Over the store in memory,
 * as the outbox hands it over, and a tab's sessionStorage in memory.
 */

/** A tab's sessionStorage, in memory. */
function fakeStorage(entries: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(entries));
  return {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, String(value)),
    removeItem: (key) => void map.delete(key),
    clear: () => map.clear(),
  };
}

/** Blocked storage: every access throws. */
const blocked = new Proxy({} as Storage, {
  get() {
    throw new Error("SecurityError");
  },
});

const BUSINESS = "00000000-0000-4000-8000-000000000001";
const OTHER = "00000000-0000-4000-8000-000000000002";
const ITEM = "00000000-0000-4000-8000-000000000003";
const YOAV = "00000000-0000-4000-8000-000000000004";
const NOA = "00000000-0000-4000-8000-000000000005";
const HOUR = 3_600_000;

let key = 0;
function row(user: string, business: string, at: number, placeName: string) {
  key += 1;
  const id = `00000000-0000-4000-a000-${String(key).padStart(12, "0")}`;
  return {
    key: id,
    user,
    business,
    draft: "place:x",
    body: {
      business,
      user,
      key: id,
      target: { takeaway: true },
      lines: [{ item: ITEM, quantity: 1 }],
    },
    lines: [],
    where: { placeName, takeaway: null },
    queuedAt: at,
    askFrom: at,
  };
}

const draft = (user: string, business: string, at: number) => ({
  user,
  business,
  draft: "place:x",
  lines: [],
  refusal: null,
  at,
});

const menu = (user: string, business: string, at: number) => ({
  user,
  business,
  version: 1,
  menu: { version: 1, categories: [], items: [], places: [] },
  at,
});

/** The module afresh, its page's store the one given. */
async function load(db = memoryOrdersDb()) {
  vi.resetModules();
  const storage = await import("./orders-storage");
  storage.ordersOnPage(async () => db);
  return { ...storage, db };
}

async function fill(db: ReturnType<typeof memoryOrdersDb>) {
  const now = Date.now();
  await db.run(["rounds", "drafts", "menus"], "readwrite", (tx) => {
    tx.put("rounds", row(YOAV, BUSINESS, now - 2 * HOUR, "8"));
    tx.put("rounds", row(YOAV, OTHER, now - HOUR, "3"));
    tx.put("rounds", row(NOA, BUSINESS, now - HOUR, "4"));
    // Another person's, untouched for a day: expired.
    tx.put("rounds", row(NOA, BUSINESS, now - 24 * HOUR, "9"));
    tx.put("drafts", draft(YOAV, BUSINESS, now));
    tx.put("drafts", draft(NOA, BUSINESS, now));
    tx.put("drafts", draft(NOA, OTHER, now - 17 * HOUR));
    tx.put("menus", menu(YOAV, BUSINESS, now));
    tx.put("menus", menu(NOA, BUSINESS, now));
    tx.put("rounds", { key: "junk" });
  });
}

const users = (records: unknown[]) =>
  records.map((record) => (record as { user?: string }).user).sort();

describe("what a session's end does on the phone", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "sessionStorage",
      fakeStorage({
        [`orders:${YOAV}:${BUSINESS}`]: "{}",
        "chat:draft": "kept",
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("says what hasn't gone, the person's or everyone's, oldest first", async () => {
    const { db, unsentOnDevice } = await load();
    await fill(db);
    expect(await unsentOnDevice(YOAV)).toEqual({
      count: 2,
      places: [
        { placeName: "8", takeaway: null },
        { placeName: "3", takeaway: null },
      ],
    });
    // Everyone's, as the station's lock asks: what doesn't read is left out.
    expect((await unsentOnDevice()).count).toBe(4);
  });

  it("clears the person's records in every business as they sign out, and what expired", async () => {
    const { db, clearOrdersOnSignOut, ordersClosed } = await load();
    await fill(db);
    await clearOrdersOnSignOut(YOAV.toUpperCase());
    // Noa's waiting round stays for her; her expired one and her old draft go.
    expect(db.dump("rounds")).toEqual([
      expect.objectContaining({
        user: NOA,
        where: { placeName: "4", takeaway: null },
      }),
    ]);
    expect(users(db.dump("drafts"))).toEqual([NOA]);
    expect(users(db.dump("menus"))).toEqual([NOA]);
    expect(ordersClosed()).toBe(true);
    expect(sessionStorage.getItem(`orders:${YOAV}:${BUSINESS}`)).toBeNull();
    expect(sessionStorage.getItem("chat:draft")).toBe("kept");
  });

  it("clears only what expired when nobody is named", async () => {
    const { db, clearOrdersOnSignOut } = await load();
    await fill(db);
    await clearOrdersOnSignOut(null);
    expect(db.dump("rounds")).toHaveLength(3);
    expect(db.dump("drafts")).toHaveLength(2);
  });

  it("clears everyone's as the device locks into the clock station", async () => {
    const { db, clearAllOrders, ordersClosed } = await load();
    await fill(db);
    await clearAllOrders();
    expect(db.dump("rounds")).toEqual([]);
    expect(db.dump("drafts")).toEqual([]);
    expect(db.dump("menus")).toEqual([]);
    expect(ordersClosed()).toBe(true);
  });

  it("asks the sign-out about the rounds of whoever the server names, though no outbox started in the page", async () => {
    // A page where no outbox started (another business, the console): the
    // server's answer is all there is to go by.
    const { db, unsentToAsk } = await load();
    await fill(db);
    const who = vi.fn(async () => YOAV.toUpperCase());
    expect(await unsentToAsk(who)).toEqual({
      count: 2,
      places: [
        { placeName: "8", takeaway: null },
        { placeName: "3", takeaway: null },
      ],
    });
    // The cookie changed under the page: Noa's are asked about, not Yoav's.
    expect(await unsentToAsk(async () => NOA)).toEqual({
      count: 2,
      places: [
        { placeName: "9", takeaway: null },
        { placeName: "4", takeaway: null },
      ],
    });
    // Nobody signed in, or nothing of theirs: nothing to ask.
    expect(await unsentToAsk(async () => null)).toBeNull();
    expect(
      await unsentToAsk(async () => "00000000-0000-4000-8000-000000000009"),
    ).toBeNull();
  });

  it("asks the server nothing when the phone holds no round that hasn't gone", async () => {
    const { unsentToAsk } = await load();
    const who = vi.fn(async () => YOAV);
    expect(await unsentToAsk(who)).toBeNull();
    expect(who).not.toHaveBeenCalled();
  });

  it("throws nothing with storage blocked or no store kept", async () => {
    vi.stubGlobal("sessionStorage", blocked);
    vi.resetModules();
    // No outbox in this page, and no IndexedDB here: nothing to open.
    const storage = await import("./orders-storage");
    expect(await storage.unsentOnDevice()).toEqual({ count: 0, places: [] });
    await expect(storage.clearAllOrders()).resolves.toBeUndefined();
    await expect(storage.clearOrdersOnSignOut(YOAV)).resolves.toBeUndefined();
  });
});
