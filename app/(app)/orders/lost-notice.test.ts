import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  forgetLostNotice,
  keepLostNotice,
  keptLostNotice,
  LOST_KEY,
  lostNoticeOf,
  onLostNotice,
} from "./lost-notice";

/*
 * The notice of rounds taken off the phone (waiter mode P7): kept as they
 * go, and heard by what draws it in the same page, since the refresh that
 * follows keeps the app's frame and its notice drawn already. Over a tab's
 * sessionStorage in memory and a window that only carries events.
 */

/** A tab's sessionStorage, in memory. */
function fakeStorage(): Storage {
  const map = new Map<string, string>();
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

const at = (placeName: string) => ({
  where: { placeName, takeaway: null },
});
const title = (where: { placeName: string | null }) =>
  `table ${where.placeName}`;

describe("the notice of rounds taken off the phone", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", fakeStorage());
    vi.stubGlobal("window", new EventTarget());
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("tells what draws it in this page as it is kept, so a frame the refresh kept shows it", () => {
    const heard = vi.fn();
    const stop = onLostNotice(heard);
    // Drawn already, before anything was kept: nothing to show.
    expect(lostNoticeOf(keptLostNotice())).toBeNull();
    keepLostNotice([at("6")], "notMember", title);
    expect(heard).toHaveBeenCalledTimes(1);
    expect(lostNoticeOf(keptLostNotice())).toEqual({
      count: 1,
      places: ["table 6"],
      why: "notMember",
    });
    stop();
    keepLostNotice([at("6"), at("2")], "signedOut", title);
    expect(heard).toHaveBeenCalledTimes(1);
  });

  it("adds to one not yet seen, each place once", () => {
    keepLostNotice([at("6")], "notMember", title);
    keepLostNotice([at("6"), at("2")], "signedOut", title);
    expect(lostNoticeOf(keptLostNotice())).toEqual({
      count: 3,
      places: ["table 6", "table 2"],
      why: "signedOut",
    });
  });

  it("goes everywhere it is drawn on 'הבנתי'", () => {
    keepLostNotice([at("6")], "signedOut", title);
    const heard = vi.fn();
    onLostNotice(heard);
    forgetLostNotice();
    expect(heard).toHaveBeenCalledTimes(1);
    expect(keptLostNotice()).toBeNull();
  });

  it("keeps nothing for no rounds, and reads nothing that doesn't parse", () => {
    const heard = vi.fn();
    onLostNotice(heard);
    keepLostNotice([], "signedOut", title);
    expect(heard).not.toHaveBeenCalled();
    expect(keptLostNotice()).toBeNull();
    sessionStorage.setItem(LOST_KEY, "{not json");
    expect(lostNoticeOf(keptLostNotice())).toBeNull();
    sessionStorage.setItem(LOST_KEY, JSON.stringify({ count: 0, places: [] }));
    expect(lostNoticeOf(keptLostNotice())).toBeNull();
  });

  it("throws nothing with storage blocked", () => {
    vi.stubGlobal(
      "sessionStorage",
      new Proxy({} as Storage, {
        get() {
          throw new Error("SecurityError");
        },
      }),
    );
    const heard = vi.fn();
    onLostNotice(heard);
    expect(() => keepLostNotice([at("6")], "signedOut", title)).not.toThrow();
    expect(heard).not.toHaveBeenCalled();
    expect(keptLostNotice()).toBeNull();
    expect(() => forgetLostNotice()).not.toThrow();
  });
});
