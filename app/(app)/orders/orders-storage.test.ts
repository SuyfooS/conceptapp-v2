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
    const { claim, clearOrdersStorage, keep } = await load();
    const mode = {};
    claim(NOA, mode);
    clearOrdersStorage();
    expect(sessionStorage.getItem(NOA)).toBeNull();
    expect(sessionStorage.getItem(SHIRAN)).toBeNull();
    expect(sessionStorage.getItem("chat:draft")).toBe("kept");
    // A send that settles on its way to the door puts nothing back.
    keep(NOA, JSON.stringify({ drafts: { a: [] }, pending: {} }), mode);
    expect(sessionStorage.getItem(NOA)).toBeNull();
  });

  it("keeps and removes an entry for the mode that read it", async () => {
    const { claim, keep } = await load();
    const mode = {};
    // Not read yet: nothing is written over what the tab holds.
    keep(NOA, "{}", mode);
    expect(sessionStorage.getItem(NOA)).toBe(
      JSON.stringify({ drafts: {}, pending: {} }),
    );
    claim(NOA, mode);
    keep(NOA, "{}", mode);
    expect(sessionStorage.getItem(NOA)).toBe("{}");
    keep(NOA, null, mode);
    expect(sessionStorage.getItem(NOA)).toBeNull();
  });

  it("lets only the mode that read an entry last write it", async () => {
    const { claim, keep } = await load();
    // The mode Next dropped from its cache, with a send still on its way.
    const dropped = {};
    claim(NOA, dropped);
    keep(NOA, JSON.stringify({ pending: { r: {} } }), dropped);
    // The mode opened again reads the entry, sends it and takes a new draft.
    const reopened = {};
    claim(NOA, reopened);
    const draft = JSON.stringify({ drafts: { "place:6": [{}] }, pending: {} });
    keep(NOA, draft, reopened);
    // The dropped one hears its old answer last: it settles in its memory.
    keep(NOA, null, dropped);
    keep(NOA, JSON.stringify({ drafts: {}, pending: {} }), dropped);
    expect(sessionStorage.getItem(NOA)).toBe(draft);
    // Another entry is its own: whoever read it writes it.
    claim(SHIRAN, dropped);
    keep(SHIRAN, "{}", dropped);
    expect(sessionStorage.getItem(SHIRAN)).toBe("{}");
  });

  it("lives in memory alone where storage is blocked", async () => {
    vi.stubGlobal("sessionStorage", blocked);
    const { claim, clearOrdersStorage, keep, readKept } = await load();
    const mode = {};
    claim(NOA, mode);
    expect(readKept(NOA, "noa")).toBeNull();
    expect(() => keep(NOA, "{}", mode)).not.toThrow();
    expect(() => clearOrdersStorage()).not.toThrow();
  });

  it("reads nothing for an entry that isn't JSON", async () => {
    vi.stubGlobal("sessionStorage", fakeStorage({ [NOA]: "{nope" }));
    const { readKept } = await load();
    expect(readKept(NOA, "noa")).toBeNull();
  });
});
