import { UnrecognizedActionError } from "next/dist/client/components/unrecognized-action-error";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RELOAD_WAIT_MS, RELOADED_KEY, UPDATED_KEY } from "@/app/stale-build";
import { reloadOnRelease } from "./release-writes";

/*
 * Waiter mode's writes on a page from the release before (closing the
 * pilot, PR 1b, known issue 37): each loads the page again for the person
 * signed in, waits for it to go, and only then fails as before, so the
 * screen that pressed says its own failure should the page stay; nothing is
 * sent again. Over a tab's sessionStorage in memory and a window whose
 * reload is counted, as app/stale-build.test.ts has them.
 */

const PERSON = "6a000000-0000-4000-a000-00000000000a";
const START = Date.parse("2026-11-28T20:30:00Z");

let storage: Map<string, string>;
let reload: ReturnType<typeof vi.fn>;

beforeEach(() => {
  storage = new Map();
  reload = vi.fn();
  vi.stubGlobal("sessionStorage", {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    removeItem: (key: string) => storage.delete(key),
  });
  vi.stubGlobal(
    "window",
    Object.assign(new EventTarget(), { location: { reload } }),
  );
  vi.useFakeTimers({ now: START });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const stale = () =>
  new UnrecognizedActionError('Server Action "00abc" was not found.');

/** Two of the mode's writes, as the layout binds them: each counted. */
function modeWrites(fails: () => unknown = () => null) {
  const serve = vi.fn(async (ticket: string, served: boolean) => {
    const failure = fails();
    if (failure) throw failure;
    return { ok: true as const, value: `${ticket} ${served}` };
  });
  const close = vi.fn(async (order: string) => {
    const failure = fails();
    if (failure) throw failure;
    return { ok: true as const, value: order };
  });
  return { serve, close };
}

describe("waiter mode's writes across a release", () => {
  it("answer as they did, each with its own arguments, sent once", async () => {
    const writes = modeWrites();
    const kept = reloadOnRelease(writes, PERSON);
    expect(Object.keys(kept)).toEqual(["serve", "close"]);
    await expect(kept.serve("t-1", true)).resolves.toEqual({
      ok: true,
      value: "t-1 true",
    });
    await expect(kept.close("o-1")).resolves.toEqual({
      ok: true,
      value: "o-1",
    });
    expect(writes.serve).toHaveBeenCalledTimes(1);
    expect(writes.serve).toHaveBeenCalledWith("t-1", true);
    expect(writes.close).toHaveBeenCalledWith("o-1");
    expect(reload).not.toHaveBeenCalled();
  });

  it("fail at once as they did on any other failure, loading nothing", async () => {
    const offline = new TypeError("Failed to fetch");
    const kept = reloadOnRelease(
      modeWrites(() => offline),
      PERSON,
    );
    await expect(kept.serve("t-1", true)).rejects.toBe(offline);
    expect(reload).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
  });

  it("load the page again for the person who pressed, and fail only once it stays", async () => {
    const writes = modeWrites(stale);
    const kept = reloadOnRelease(writes, PERSON);
    const failed = vi.fn();
    void kept.serve("t-1", true).catch(failed);
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(storage.get(UPDATED_KEY)).toBe(`${START} ${PERSON}`);
    // The screen's button stays busy while the page goes.
    await vi.advanceTimersByTimeAsync(RELOAD_WAIT_MS - 1);
    expect(failed).not.toHaveBeenCalled();
    // Stayed (the reload stopped): the screen says its own failure.
    await vi.advanceTimersByTimeAsync(1);
    expect(failed).toHaveBeenCalledTimes(1);
    expect(failed.mock.calls[0]?.[0]).toBeInstanceOf(UnrecognizedActionError);
    // Never sent again by itself.
    expect(writes.serve).toHaveBeenCalledTimes(1);
  });

  it("fail at once within the minute after a reload, as a page still old", async () => {
    storage.set(RELOADED_KEY, String(START - 30_000));
    const kept = reloadOnRelease(modeWrites(stale), PERSON);
    await expect(kept.close("o-1")).rejects.toBeInstanceOf(
      UnrecognizedActionError,
    );
    expect(reload).not.toHaveBeenCalled();
  });

  it("load nothing with nobody signed in to tell", async () => {
    const kept = reloadOnRelease(modeWrites(stale), null);
    await expect(kept.serve("t-1", false)).rejects.toBeInstanceOf(
      UnrecognizedActionError,
    );
    expect(reload).not.toHaveBeenCalled();
  });
});
