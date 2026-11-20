import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

const NOA = "orders:noa:business-1";
const SHIRAN = "orders:shiran:business-1";

/** The module afresh: what one page holds, from the start. */
const load = async () => {
  vi.resetModules();
  return await import("./orders-storage");
};

describe("what waiter mode keeps in the tab", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "sessionStorage",
      fakeStorage({
        [NOA]: JSON.stringify({ drafts: {}, pending: {} }),
        [SHIRAN]: JSON.stringify({ drafts: { a: [] }, pending: {} }),
        "chat:draft": "kept",
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads one person's entry, and drops another person's as they open the mode", async () => {
    const { readKept, storeKeyOf } = await load();
    expect(storeKeyOf("noa", "business-1")).toBe(NOA);
    expect(readKept(NOA, "noa")).toEqual({ drafts: {}, pending: {} });
    expect(sessionStorage.getItem(SHIRAN)).toBeNull();
    // What isn't the mode's stays.
    expect(sessionStorage.getItem("chat:draft")).toBe("kept");
  });

  it("clears everyone's entries as a session ends here, and writes nothing after", async () => {
    const { clearOrdersStorage, keep } = await load();
    clearOrdersStorage();
    expect(sessionStorage.getItem(NOA)).toBeNull();
    expect(sessionStorage.getItem(SHIRAN)).toBeNull();
    expect(sessionStorage.getItem("chat:draft")).toBe("kept");
    // A send that settles on its way to the door puts nothing back.
    keep(NOA, JSON.stringify({ drafts: { a: [] }, pending: {} }));
    expect(sessionStorage.getItem(NOA)).toBeNull();
  });

  it("keeps and removes an entry", async () => {
    const { keep } = await load();
    keep(NOA, "{}");
    expect(sessionStorage.getItem(NOA)).toBe("{}");
    keep(NOA, null);
    expect(sessionStorage.getItem(NOA)).toBeNull();
  });

  it("lives in memory alone where storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", blocked);
    const { clearOrdersStorage, keep, readKept } = await load();
    expect(readKept(NOA, "noa")).toBeNull();
    expect(() => keep(NOA, "{}")).not.toThrow();
    expect(() => clearOrdersStorage()).not.toThrow();
  });

  it("reads nothing for an entry that isn't JSON", async () => {
    vi.stubGlobal("sessionStorage", fakeStorage({ [NOA]: "{nope" }));
    const { readKept } = await load();
    expect(readKept(NOA, "noa")).toBeNull();
  });
});
