import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  forgetOthersKept,
  isStaleBuild,
  KEPT_KEY,
  type KeepForPage,
  NOTE_FOR_MS,
  RELEASE_WORDS,
  RELOAD_EVERY_MS,
  RELOAD_WAIT_MS,
  RELOADED_KEY,
  reloadForRelease,
  reloadKeepingWords,
  takeKept,
  takeKeptWords,
  takeUpdatedNote,
  UPDATED_KEY,
  untilReloaded,
} from "./stale-build";

/*
 * A screen left open across a release (closing the pilot, PRs 1a and 1b):
 * the press that meets a server action the server no longer has loads the
 * page again, once a minute at most, and the page loaded says the app was
 * updated, once, to the person who pressed, in the words of the screen
 * whose writing the press kept for it, if any, which that screen alone
 * takes back; a chat's send never loads it by itself, and its "טעינה מחדש"
 * keeps what is written, and its switch, for that person's chat.
 * Over a tab's sessionStorage in memory, a window whose reload is counted,
 * and the very error Next.js throws (`next/navigation`'s check is an
 * `instanceof` on its class). The presses themselves, in the built app with
 * Next.js's own answer, are e2e/clock-release.spec.ts's and
 * e2e/release.spec.ts's: one build is enough, an action id the server
 * doesn't know standing for a page from the release before.
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
/** The window, for its events (shown again, a step in its history) and its address. */
let page: EventTarget & { location: { reload: unknown; pathname: string } };
/** A conversation's address, where a chat's words are kept. */
const CHAT = "/chat/c0000000-0000-4000-a000-000000000001";
const START = Date.parse("2026-11-27T21:59:00Z");

beforeEach(() => {
  tab = fakeStorage();
  reload = vi.fn();
  vi.stubGlobal("sessionStorage", tab.storage);
  page = Object.assign(new EventTarget(), {
    location: { reload, pathname: CHAT },
  });
  vi.stubGlobal("window", page);
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** `pageshow`: from the browser's keeping (`persisted`), or as it first loads. */
const shown = (persisted: boolean) =>
  Object.assign(new Event("pageshow"), { persisted });

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

  it("loads nothing for a press outside a frame, with nobody to tell", () => {
    // The /design gallery draws screens with no frame: no person, so no
    // page loaded again could say the note, and the press says its failure.
    for (const nobody of [null, ""]) {
      expect(reloadForRelease(stale(), nobody)).toBe(false);
    }
    expect(reload).not.toHaveBeenCalled();
    expect(tab.map.size).toBe(0);
    // Not even the minute's guard: the frame's next press loads the page.
    expect(reloadForRelease(stale(), A)).toBe(true);
  });

  it("loads again once a minute at most: a page still old says the failure", () => {
    expect(reloadForRelease(stale(), A)).toBe(true);
    loadAgain();
    expect(takeUpdatedNote(A)).toBe("toast");
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

  it("waits while the page goes, and gives the press back once it stays", async () => {
    expect(reloadForRelease(stale(), A)).toBe(true);
    const settled = vi.fn();
    void untilReloaded().then(settled, settled);
    await vi.advanceTimersByTimeAsync(RELOAD_WAIT_MS - 1);
    expect(settled).not.toHaveBeenCalled();
    expect(tab.map.has(UPDATED_KEY)).toBe(true);
    // The reload stopped: the press goes on to say it failed, and React's
    // transition it was on ends with it.
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(settled).toHaveBeenCalledWith(undefined);
    // No page loaded again to say the note; the guard stays, so the next
    // press within the minute says the failure rather than loading again.
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
    expect(tab.map.get(RELOADED_KEY)).toBe(String(START));
    expect(reloadForRelease(stale(), A)).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("gives the press back at once when the page is shown again, or steps in its history", async () => {
    for (const event of [shown(true), new Event("popstate")]) {
      tab.map.set(UPDATED_KEY, `${START} ${A}`);
      const settled = vi.fn();
      void untilReloaded().then(settled, settled);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled, event.type).not.toHaveBeenCalled();
      page.dispatchEvent(event);
      await vi.advanceTimersByTimeAsync(0);
      expect(settled, event.type).toHaveBeenCalledTimes(1);
      expect(tab.map.has(UPDATED_KEY), event.type).toBe(false);
    }
  });

  it("isn't given back by a page shown as it first loads", async () => {
    const settled = vi.fn();
    void untilReloaded().then(settled, settled);
    page.dispatchEvent(shown(false));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).not.toHaveBeenCalled();
  });

  it("lets go of its time and its events once given back", async () => {
    const settled = vi.fn();
    void untilReloaded().then(settled, settled);
    page.dispatchEvent(new Event("popstate"));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    // A note left by a later press stays for its own page: nothing of this
    // wait takes it away.
    tab.map.set(UPDATED_KEY, `${START} ${A}`);
    page.dispatchEvent(new Event("popstate"));
    page.dispatchEvent(shown(true));
    await vi.advanceTimersByTimeAsync(RELOAD_WAIT_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(tab.map.get(UPDATED_KEY)).toBe(`${START} ${A}`);
  });

  it("gives the press back even when the note can't be taken away", async () => {
    tab.map.set(UPDATED_KEY, `${START} ${A}`);
    tab.refuse.remove = true;
    const settled = vi.fn();
    void untilReloaded().then(settled, settled);
    await vi.advanceTimersByTimeAsync(RELOAD_WAIT_MS);
    expect(settled).toHaveBeenCalledTimes(1);
    // And the note, never taken away, says nothing either.
    expect(takeUpdatedNote(A)).toBeNull();
  });
});

describe("the page loaded again", () => {
  it("says the app was updated once, in the press's own words", () => {
    reloadForRelease(stale(), A);
    loadAgain();
    vi.advanceTimersByTime(3_000);
    expect(takeUpdatedNote(A)).toBe("toast");
    expect(takeUpdatedNote(A)).toBeNull();
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
    expect(takeUpdatedNote(B)).toBeNull();
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
    // Nor to A, signing in again after: the note went with B's look.
    expect(takeUpdatedNote(A)).toBeNull();
  });

  it("says nothing without a note, as on any page loaded", () => {
    expect(takeUpdatedNote(A)).toBeNull();
  });

  it("says nothing of a note left too long ago, and lets it go", () => {
    reloadForRelease(stale(), A);
    vi.advanceTimersByTime(NOTE_FOR_MS);
    expect(takeUpdatedNote(A)).toBeNull();
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
  });

  it("still says a note left just within its time", () => {
    reloadForRelease(stale(), A);
    vi.advanceTimersByTime(NOTE_FOR_MS - 1);
    expect(takeUpdatedNote(A)).toBe("toast");
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
      expect(takeUpdatedNote(A), kept).toBeNull();
      expect(tab.map.has(UPDATED_KEY)).toBe(false);
    }
  });

  it("says nothing when storage can't be read, or the note can't be taken away", () => {
    tab.map.set(UPDATED_KEY, `${START} ${A}`);
    tab.refuse.get = true;
    expect(takeUpdatedNote(A)).toBeNull();
    tab.refuse.get = false;
    tab.refuse.remove = true;
    // Kept, it would say so at every look.
    expect(takeUpdatedNote(A)).toBeNull();
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

describe("what a press keeps for the page loaded again", () => {
  const WEEK = "/schedule/availability";
  const Week = z.object({ week: z.string(), note: z.string() });
  const week: KeepForPage = {
    of: "availability",
    value: { week: "2026-11-29", note: "רק בבוקר" },
    words: "availability",
  };

  beforeEach(() => {
    page.location.pathname = WEEK;
  });

  it("keeps it with the note, whose words are the screen's", () => {
    expect(reloadForRelease(stale(), A, week)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tab.map.get(UPDATED_KEY)).toBe(`${START} ${A} availability`);
    expect(JSON.parse(tab.map.get(KEPT_KEY) ?? "")).toEqual({
      at: START,
      person: A,
      where: WEEK,
      of: "availability",
      value: { week: "2026-11-29", note: "רק בבוקר" },
    });
    loadAgain();
    expect(takeUpdatedNote(A)).toBe("availability");
  });

  it("gives it back once, to that person's screen at that address, as its schema reads it", () => {
    reloadForRelease(stale(), A, week);
    loadAgain();
    vi.advanceTimersByTime(2_000);
    // Another screen's name, or another address: kept for that one.
    expect(takeKept(A, "list", Week)).toBeNull();
    page.location.pathname = "/lists/l1";
    expect(takeKept(A, "availability", Week)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(true);
    page.location.pathname = WEEK;
    expect(takeKept(A, "availability", Week)).toEqual({
      week: "2026-11-29",
      note: "רק בבוקר",
    });
    expect(takeKept(A, "availability", Week)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(false);
  });

  it("gives nothing to someone else, nor once too old or unread by the screen, and lets it go", () => {
    reloadForRelease(stale(), A, week);
    expect(takeKept(B, "availability", Week)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(false);

    tab.map.clear();
    reloadForRelease(stale(), A, week);
    vi.advanceTimersByTime(NOTE_FOR_MS);
    expect(takeKept(A, "availability", Week)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(false);

    tab.map.clear();
    vi.advanceTimersByTime(RELOAD_EVERY_MS);
    reloadForRelease(stale(), A, { ...week, value: { week: 5 } });
    expect(takeKept(A, "availability", Week)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(false);
  });

  it("keeps nothing within the minute, nor halfway when storage refuses", () => {
    reloadForRelease(stale(), A);
    reload.mockClear();
    // Within the minute: the page stays, with what is written on it.
    expect(reloadForRelease(stale(), A, week)).toBe(false);
    expect(tab.map.has(KEPT_KEY)).toBe(false);

    tab.map.clear();
    for (const refused of [KEPT_KEY, UPDATED_KEY, RELOADED_KEY]) {
      const keep = refusing(refused);
      expect(reloadForRelease(stale(), A, week), refused).toBe(false);
      expect(tab.map.size, refused).toBe(0);
      keep();
    }
    expect(reload).not.toHaveBeenCalled();
  });

  it("lets go of what the press kept when the page stays, and of nothing kept before it", async () => {
    // Kept earlier for another screen, at another address.
    tab.map.set(
      KEPT_KEY,
      JSON.stringify({
        at: START - 90_000,
        person: A,
        where: "/lists/l1",
        of: "list",
        value: {},
      }),
    );
    reloadForRelease(stale(), A);
    const settled = vi.fn();
    void untilReloaded().then(settled, settled);
    page.dispatchEvent(new Event("popstate"));
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toHaveBeenCalledTimes(1);
    expect(tab.map.has(KEPT_KEY)).toBe(true);

    // This press's own, its time the note's.
    tab.map.clear();
    vi.advanceTimersByTime(RELOAD_EVERY_MS);
    reloadForRelease(stale(), A, week);
    void untilReloaded();
    await vi.advanceTimersByTimeAsync(RELOAD_WAIT_MS);
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
    expect(tab.map.has(KEPT_KEY)).toBe(false);
  });

  it("says the press's own words for a note with none, as the release before left it, or with words it doesn't know", () => {
    expect(RELEASE_WORDS).toEqual(["toast", "availability", "typed"]);
    for (const [kept, words] of [
      [`${START} ${A}`, "toast"],
      [`${START} ${A} toast`, "toast"],
      [`${START} ${A} typed`, "typed"],
      [`${START} ${A} later`, "toast"],
      [`${START} ${A} typed more`, null],
    ] as const) {
      tab.map.set(UPDATED_KEY, kept);
      expect(takeUpdatedNote(A), kept).toBe(words);
      expect(tab.map.has(UPDATED_KEY)).toBe(false);
    }
  });

  it("says the availability wasn't sent and what was marked stays, or what was typed is back", async () => {
    const he = (await import("@/messages/he.json")).default;
    const en = (await import("@/messages/en.json")).default;
    expect(he.app.updated.availability).toBe(
      "האפליקציה התעדכנה, והזמינות לא נשלחה. מה שסימנתם נשאר כאן: לוחצים שוב על שליחת הזמינות.",
    );
    expect(he.app.updated.typed).toBe(
      "האפליקציה התעדכנה, ומה שכתבתם לא נשמר. הוא חזר למקום שבו כתבתם, ואפשר לשמור אותו שוב.",
    );
    expect(en.app.updated.availability).toBe(
      "The app was updated, and your availability wasn't sent. What you marked is still here: press Send availability again.",
    );
    expect(en.app.updated.typed).toBe(
      "The app was updated, and what you typed wasn't saved. It's back where you typed it, to save again.",
    );
    // Its button's own name, as the availability screen says it.
    expect(he.app.updated.availability).toContain(he.app.availability.submit);
  });
});

describe("a chat's send on a page from an earlier release", () => {
  const kept = (at: number, person: string, where: string, words: string) =>
    JSON.stringify({ at, person, where, of: "chat", value: { words } });
  /** The words given back, as an ordinary message. */
  const plain = (words: string) => ({ words, announce: false });

  it("keeps what is written for the page loaded, and loads it as pressed", () => {
    reloadKeepingWords(A, "נגמר החלב\nבמקרר השני");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(JSON.parse(tab.map.get(KEPT_KEY) ?? "")).toEqual({
      at: START,
      person: A,
      where: CHAT,
      of: "chat",
      value: { words: "נגמר החלב\nבמקרר השני" },
    });
    // Pressed, never by itself: no note for the frame, no minute's guard.
    expect(tab.map.has(UPDATED_KEY)).toBe(false);
    expect(tab.map.has(RELOADED_KEY)).toBe(false);
  });

  it("keeps an announcement's switch with its words, and gives it back", () => {
    reloadKeepingWords(A, "סגור מחר", true);
    expect(JSON.parse(tab.map.get(KEPT_KEY) ?? "").value).toEqual({
      words: "סגור מחר",
      announce: true,
    });
    loadAgain();
    expect(takeKeptWords(A)).toEqual({ words: "סגור מחר", announce: true });
    // An ordinary message keeps none.
    reloadKeepingWords(A, "סגור מחר", false);
    expect(JSON.parse(tab.map.get(KEPT_KEY) ?? "").value).toEqual({
      words: "סגור מחר",
    });
    expect(takeKeptWords(A)).toEqual(plain("סגור מחר"));
  });

  it("gives the words back once, to that person's chat at that address", () => {
    reloadKeepingWords(A, "נגמר החלב");
    loadAgain();
    vi.advanceTimersByTime(2_000);
    expect(takeKeptWords(A)).toEqual(plain("נגמר החלב"));
    expect(takeKeptWords(A)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(false);
  });

  it("still gives back words kept just within their time", () => {
    reloadKeepingWords(A, "נגמר החלב");
    vi.advanceTimersByTime(NOTE_FOR_MS - 1);
    expect(takeKeptWords(A)).toEqual(plain("נגמר החלב"));
  });

  it("keeps another chat's words for that chat", () => {
    reloadKeepingWords(A, "נגמר החלב");
    // Signed in again after the door, the person opened another chat first.
    page.location.pathname = "/chat/c0000000-0000-4000-a000-000000000002";
    expect(takeKeptWords(A)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(true);
    page.location.pathname = CHAT;
    expect(takeKeptWords(A)).toEqual(plain("נגמר החלב"));
  });

  it("gives nothing to someone else signed in on that tab, and lets the words go", () => {
    reloadKeepingWords(A, "נגמר החלב");
    loadAgain();
    expect(takeKeptWords(B)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(false);
    expect(takeKeptWords(A)).toBeNull();
  });

  it("gives nothing of words kept too long ago, and lets them go", () => {
    reloadKeepingWords(A, "נגמר החלב");
    vi.advanceTimersByTime(NOTE_FOR_MS);
    expect(takeKeptWords(A)).toBeNull();
    expect(tab.map.has(KEPT_KEY)).toBe(false);
  });

  it("gives nothing of words that don't read, or are from after now, and lets them go", () => {
    // As written by the chat, they would be given back.
    tab.map.set(KEPT_KEY, kept(START, A, CHAT, "x"));
    expect(takeKeptWords(A)).toEqual(plain("x"));
    for (const odd of [
      "yes",
      "{}",
      kept(START, A, CHAT, ""),
      kept(START, "", CHAT, "x"),
      kept(START, A, "chat", "x"),
      kept(-1, A, CHAT, "x"),
      kept(Date.now() + 60_000, A, CHAT, "x"),
      JSON.stringify({ at: START, person: A, where: CHAT, words: "x" }),
      JSON.stringify({ at: START, person: A, where: CHAT, of: "chat" }),
      JSON.stringify({
        at: START,
        person: A,
        where: CHAT,
        of: "chat",
        value: { words: 5 },
      }),
    ]) {
      tab.map.set(KEPT_KEY, odd);
      expect(takeKeptWords(A), odd).toBeNull();
      expect(tab.map.has(KEPT_KEY), odd).toBe(false);
    }
  });

  it("keeps nothing when nothing is written, or nobody signed in is known, and loads all the same", () => {
    for (const [person, words] of [
      [A, ""],
      [A, "  \n "],
      [null, "נגמר החלב"],
      ["", "נגמר החלב"],
    ] as const) {
      // What an earlier press kept goes too: this page's field is the one.
      tab.map.set(KEPT_KEY, kept(Date.now(), A, CHAT, "ישן"));
      reload.mockClear();
      reloadKeepingWords(person, words);
      expect(reload).toHaveBeenCalledTimes(1);
      expect(tab.map.has(KEPT_KEY)).toBe(false);
    }
  });

  it("loads the page all the same when storage can't keep the words", () => {
    tab.refuse.set = true;
    reloadKeepingWords(A, "נגמר החלב");
    expect(reload).toHaveBeenCalledTimes(1);
    expect(tab.map.has(KEPT_KEY)).toBe(false);
    tab.refuse.set = false;
    tab.refuse.remove = true;
    reload.mockClear();
    reloadKeepingWords(A, "נגמר החלב");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("gives nothing when storage can't be read, or the words can't be let go", () => {
    tab.map.set(KEPT_KEY, kept(START, A, CHAT, "נגמר החלב"));
    tab.refuse.get = true;
    expect(takeKeptWords(A)).toBeNull();
    tab.refuse.get = false;
    tab.refuse.remove = true;
    // Kept, they would come back at every look.
    expect(takeKeptWords(A)).toBeNull();
  });

  it("lets go of anything kept for anyone else as the frame opens, and keeps the person's own", () => {
    tab.map.set(KEPT_KEY, kept(START, A, CHAT, "נגמר החלב"));
    forgetOthersKept(A);
    expect(tab.map.has(KEPT_KEY)).toBe(true);
    forgetOthersKept(B);
    expect(tab.map.has(KEPT_KEY)).toBe(false);
    // Too old, or not words at all: gone for the person too.
    tab.map.set(KEPT_KEY, kept(START - NOTE_FOR_MS, A, CHAT, "נגמר החלב"));
    forgetOthersKept(A);
    expect(tab.map.has(KEPT_KEY)).toBe(false);
    tab.map.set(KEPT_KEY, "yes");
    forgetOthersKept(A);
    expect(tab.map.has(KEPT_KEY)).toBe(false);
    // Storage refused: nothing it can do, and nothing thrown.
    tab.map.set(KEPT_KEY, kept(START, A, CHAT, "נגמר החלב"));
    tab.refuse.get = true;
    expect(() => forgetOthersKept(B)).not.toThrow();
  });

  it("says the message wasn't sent, then what to do, and that it waits in the field", async () => {
    const he = (await import("@/messages/he.json")).default;
    const en = (await import("@/messages/en.json")).default;
    expect(he.app.updated.chat).toBe(
      "האפליקציה התעדכנה, וההודעה לא נשלחה. טוענים מחדש, וההודעה מחכה בשדה.",
    );
    expect(he.app.updated.reload).toBe("טעינה מחדש");
    expect(en.app.updated.chat).toBe(
      "The app was updated, and your message wasn't sent. Reload, and your message waits in the field.",
    );
    expect(en.app.updated.reload).toBe("Reload");
  });
});
