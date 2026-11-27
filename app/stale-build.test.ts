import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  isStaleBuild,
  NOTE_FOR_MS,
  RELOAD_EVERY_MS,
  RELOADED_KEY,
  reloadForRelease,
  takeUpdatedNote,
  UPDATED_KEY,
  untilReloaded,
} from "./stale-build";

/*
 * A screen left open across a release (closing the pilot, PR 1a): the press
 * that meets a server action the server no longer has loads the page again,
 * once a minute at most, and the page loaded says the app was updated, once,
 * to the person who pressed. Over a tab's sessionStorage in memory, a window
 * whose reload is counted, and the very error Next.js throws
 * (`next/navigation`'s check is an `instanceof` on its class). No e2e: it
 * would take two builds of the app.
 */

/** A tab's sessionStorage, in memory, that can be made to refuse. */
function fakeStorage() {
  const map = new Map<string, string>();
  const refuse = { get: false, set: false, remove: false };
  const storage: Storage = {
    get length() {
      return map.size;
    },
    key: (index) => [...map.keys()][index] ?? null,
    getItem: (key) => {
      if (refuse.get) throw new DOMException("blocked", "SecurityError");
      return map.get(key) ?? null;
    },
    setItem: (key, value) => {
      if (refuse.set) throw new DOMException("full", "QuotaExceededError");
      map.set(key, String(value));
    },
    removeItem: (key) => {
      if (refuse.remove) throw new DOMException("blocked", "SecurityError");
      map.delete(key);
    },
    clear: () => map.clear(),
  };
  return { storage, map, refuse };
}

const stale = () =>
  new UnrecognizedActionError(
    'Server Action "00abc" was not found on the server.',
  );

/** The person who pressed, and the next one to sign in on that tab. */
const A = "6a000000-0000-4000-a000-00000000000a";
const B = "6b000000-0000-4000-a000-00000000000b";

let tab: ReturnType<typeof fakeStorage>;
let reload: ReturnType<typeof vi.fn>;
const START = Date.parse("2026-11-27T21:59:00Z");

beforeEach(() => {
  tab = fakeStorage();
  reload = vi.fn();
  vi.stubGlobal("sessionStorage", tab.storage);
  vi.stubGlobal("window", { location: { reload } });
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** The page as it loads again: a fresh tab of the same session. */
function loadAgain() {
  reload.mockClear();
}

/** Storage that refuses to keep this one mark, and keeps the other. */
function refusing(refused: string) {
  const setItem = tab.storage.setItem;
  tab.storage.setItem = (key, value) => {
    if (key === refused) {
      throw new DOMException("full", "QuotaExceededError");
    }
    setItem(key, value);
  };
  return () => {
    tab.storage.setItem = setItem;
  };
}

describe("a press on a page from an earlier release", () => {
  it("is told by Next.js's own error, and nothing else", () => {
    expect(isStaleBuild(stale())).toBe(true);
    for (const other of [
      new Error("UnrecognizedActionError"),
      new TypeError("Failed to fetch"),
      Object.assign(new Error("x"), { name: "UnrecognizedActionError" }),
      { name: "UnrecognizedActionError", message: "x" },
      "UnrecognizedActionError",
      null,
      undefined,
    ]) {
      expect(isStaleBuild(other), String(other)).toBe(false);
    }
  });

  it("loads the page again, and leaves the note for it, for whoever pressed", () => {
    expect(reloadForRelease(stale(), A)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tab.map.get(RELOADED_KEY)).toBe(String(START));
    expect(tab.map.get(UPDATED_KEY)).toBe(`${START} ${A}`);
  });

  it("leaves any other failure to the press, loading nothing", () => {
    for (const other of [new TypeError("Failed to fetch"), new Error("500")]) {
      expect(reloadForRelease(other, A)).toBe(false);
    }
    expect(reload).not.toHaveBeenCalled();
    expect(tab.map.size).toBe(0);
  });

  it("loads again once a minute at most: a page still old says the failure", () => {
    expect(reloadForRelease(stale(), A)).toBe(true);
    loadAgain();
    expect(takeUpdatedNote(A)).toBe(true);
    // Pressed again on a page still from the release before.
    vi.advanceTimersByTime(RELOAD_EVERY_MS - 1);
    expect(reloadForRelease(stale(), A)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
    // A minute on, once more.
    vi.advanceTimersByTime(1);
    expect(reloadForRelease(stale(), A)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("isn't held back by a time after now, the phone's clock moved back", () => {
    tab.map.set(RELOADED_KEY, String(START + 3_600_000));
    expect(reloadForRelease(stale(), A)).toBe(true);
    expect(tab.map.get(RELOADED_KEY)).toBe(String(START));
  });

  it("isn't held back by a guard that doesn't read as a time", () => {
    for (const kept of ["", "soon", "-5", "1.5", "NaN", "Infinity"]) {
      tab.map.set(RELOADED_KEY, kept);
      reload.mockClear();
      expect(reloadForRelease(stale(), A), kept).toBe(true);
      expect(reload).toHaveBeenCalledTimes(1);
    }
  });

  it("loads nothing when storage can't be read: no guard, so no loop", () => {
    tab.refuse.get = true;
    expect(reloadForRelease(stale(), A)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
  });

  it("loads nothing when storage can't keep the marks, and keeps neither halfway", () => {
    tab.refuse.set = true;
    expect(reloadForRelease(stale(), A)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(tab.map.size).toBe(0);
    tab.refuse.set = false;

    // The note kept, the guard refused: the note is taken away again.
    let keep = refusing(RELOADED_KEY);
    expect(reloadForRelease(stale(), A)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(tab.map.size).toBe(0);
    keep();

    // The note refused: no guard is left either, so with storage working
    // again the next press loads the page, a minute or not.
    keep = refusing(UPDATED_KEY);
    expect(reloadForRelease(stale(), A)).toBe(false);
    expect(reload).not.toHaveBeenCalled();
    expect(tab.map.size).toBe(0);
    keep();
    expect(reloadForRelease(stale(), A)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("takes away an earlier note it can't follow with the guard", () => {
    // Left by a reload that went to the door, nobody's clock opened since.
    tab.map.set(UPDATED_KEY, `${START - 90_000} ${A}`);
    refusing(RELOADED_KEY);
    expect(reloadForRelease(stale(), A)).toBe(false);
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
  });

  it("waits, never answering, while the page goes", async () => {
    const settled = vi.fn();
    void untilReloaded().then(settled, settled);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(settled).not.toHaveBeenCalled();
  });
});

describe("the page loaded again", () => {
  it("says the app was updated once", () => {
    reloadForRelease(stale(), A);
    loadAgain();
    vi.advanceTimersByTime(3_000);
    expect(takeUpdatedNote(A)).toBe(true);
    expect(takeUpdatedNote(A)).toBe(false);
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
    // The guard stays, for the minute.
    expect(tab.map.get(RELOADED_KEY)).toBe(String(START));
  });

  it("says nothing to someone else signed in on that tab, and lets the note go", () => {
    // A's session ended with the old clock open, so the reload went to the
    // door; B signed in on the same tab and opened the clock.
    reloadForRelease(stale(), A);
    loadAgain();
    vi.advanceTimersByTime(60_000);
    expect(takeUpdatedNote(B)).toBe(false);
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
    // Nor to A, signing in again after: the note went with B's look.
    expect(takeUpdatedNote(A)).toBe(false);
  });

  it("says nothing without a note, as on any page loaded", () => {
    expect(takeUpdatedNote(A)).toBe(false);
  });

  it("says nothing of a note left too long ago, and lets it go", () => {
    reloadForRelease(stale(), A);
    vi.advanceTimersByTime(NOTE_FOR_MS);
    expect(takeUpdatedNote(A)).toBe(false);
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
  });

  it("still says a note left just within its time", () => {
    reloadForRelease(stale(), A);
    vi.advanceTimersByTime(NOTE_FOR_MS - 1);
    expect(takeUpdatedNote(A)).toBe(true);
  });

  it("says nothing of a note that doesn't read, names nobody, or is from after now", () => {
    for (const kept of [
      "yes",
      "",
      String(START),
      `${START} `,
      ` ${A}`,
      `soon ${A}`,
      `${START} ${A} `,
      `${START} ${A}${B}`,
      `${START + 60_000} ${A}`,
    ]) {
      tab.map.set(UPDATED_KEY, kept);
      expect(takeUpdatedNote(A), kept).toBe(false);
      expect(tab.map.has(UPDATED_KEY)).toBe(false);
    }
  });

  it("says nothing when storage can't be read, or the note can't be taken away", () => {
    tab.map.set(UPDATED_KEY, `${START} ${A}`);
    tab.refuse.get = true;
    expect(takeUpdatedNote(A)).toBe(false);
    tab.refuse.get = false;
    tab.refuse.remove = true;
    // Kept, it would say so at every look.
    expect(takeUpdatedNote(A)).toBe(false);
  });

  it("says the press wasn't recorded, then what to do, as the clock's other failures do", async () => {
    // After the reload the clock still shows the shift open: the words say
    // what didn't happen, so nobody takes the note for "נרשמה יציאה".
    const he = (await import("@/messages/he.json")).default;
    const en = (await import("@/messages/en.json")).default;
    expect(he.app.updated.toast).toBe(
      "האפליקציה התעדכנה, והלחיצה לא נרשמה. לוחצים שוב.",
    );
    expect(en.app.updated.toast).toBe(
      "The app was updated, and your press wasn't recorded. Press again.",
    );
  });
});
