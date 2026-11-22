import { FILE_IDLE_MS, FILE_TOUCH_EVERY_MS } from "@domain/file-holders";
import { describe, expect, it, vi } from "vitest";
import type { KeepOpenAnswer } from "./holder-file-types";
import {
  lockAndDraw,
  type OpenFileMemory,
  type WatchedPage,
  type WatchedWindow,
  watchOpenFile,
} from "./open-watch";

/*
 * The open file's idle lock (profile H6a, plan §3.5), against a clock of
 * its own: 15 minutes from the last activity, failing closed when the
 * server can't be asked, and the 15 minutes kept while Next hides the
 * screen and shows it again (an <Activity>: its state kept, its effects
 * stopped and started again), so a file left open on a screen kept for
 * later never comes back with a fresh quarter of an hour, nor is drawn at
 * all once it passed.
 */

const MINUTE = 60_000;

class Page extends EventTarget {
  visibilityState: DocumentVisibilityState = "visible";
  listening = 0;

  set(state: DocumentVisibilityState) {
    this.visibilityState = state;
    this.dispatchEvent(new Event("visibilitychange"));
  }

  press() {
    this.dispatchEvent(new Event("pointerdown"));
  }

  key() {
    this.dispatchEvent(new Event("keydown"));
  }

  override addEventListener(
    ...args: Parameters<EventTarget["addEventListener"]>
  ) {
    this.listening += 1;
    super.addEventListener(...args);
  }

  override removeEventListener(
    ...args: Parameters<EventTarget["removeEventListener"]>
  ) {
    this.listening -= 1;
    super.removeEventListener(...args);
  }
}

/** A clock and its timers: time passes with them, or with them held back (a phone asleep). */
class Clock {
  at = 1_700_000_000_000;
  next = 1;
  timers = new Map<number, { due: number; run: () => void }>();
  now = () => this.at;
  setTimeout = ((run: () => void, delay = 0) => {
    const id = this.next++;
    this.timers.set(id, { due: this.at + delay, run });
    return id;
  }) as unknown as Window["setTimeout"];
  clearTimeout = ((id: number) => {
    this.timers.delete(id);
  }) as unknown as Window["clearTimeout"];

  pass(ms: number) {
    this.at += ms;
    for (const [id, timer] of [...this.timers]) {
      if (timer.due <= this.at) {
        this.timers.delete(id);
        timer.run();
      }
    }
  }

  sleep(ms: number) {
    this.at += ms;
  }
}

/** The answers asked for so far, all in. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

function setup(
  keepOpen: () => Promise<KeepOpenAnswer> = async () => ({
    open: true,
  }),
) {
  const page = new Page();
  const clock = new Clock();
  const memory: OpenFileMemory = { lastActivity: null };
  const keep = vi.fn(keepOpen);
  const close = vi.fn();
  const watch = () =>
    watchOpenFile(
      memory,
      keep,
      close,
      page as unknown as WatchedPage,
      clock as unknown as WatchedWindow,
      clock.now,
    );
  return { page, clock, memory, keep, close, watch };
}

describe("watchOpenFile", () => {
  it("tells the server as the file opens, and closes it 15 minutes after", async () => {
    const { clock, memory, keep, close, page, watch } = setup();
    watch();
    expect(keep).toHaveBeenCalledTimes(1);
    expect(memory.lastActivity).toBe(clock.at);
    await settle();
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
    expect(page.listening).toBe(0);
  });

  it("starts the 15 minutes again on a press or a key, telling the server at most once a minute", async () => {
    const { clock, keep, close, page, watch } = setup();
    watch();
    clock.pass(10 * MINUTE);
    page.press();
    expect(keep).toHaveBeenCalledTimes(2);
    clock.pass(FILE_TOUCH_EVERY_MS / 2);
    page.key();
    expect(keep).toHaveBeenCalledTimes(2);
    await settle();
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
  });

  it("closes the file when the server says it is closed", async () => {
    const { close, page, watch } = setup(async () => ({ open: false }));
    watch();
    await settle();
    expect(close).toHaveBeenCalledExactlyOnceWith("closed");
    expect(page.listening).toBe(0);
  });

  // Offline, or the action failed: nobody knows the file is still open.
  it("fails closed when the server can't be asked", async () => {
    const failed = setup(() => Promise.reject(new Error("offline")));
    failed.watch();
    await settle();
    expect(failed.close).toHaveBeenCalledExactlyOnceWith("failed");
    expect(failed.page.listening).toBe(0);

    const thrown = setup(() => {
      throw new Error("500");
    });
    thrown.watch();
    await settle();
    expect(thrown.close).toHaveBeenCalledExactlyOnceWith("failed");
  });

  it("fails closed when a touch after a press can't reach the server", async () => {
    let offline = false;
    const { clock, close, page, watch } = setup(async () => {
      if (offline) throw new Error("offline");
      return { open: true };
    });
    watch();
    await settle();
    clock.pass(2 * MINUTE);
    offline = true;
    page.press();
    await settle();
    expect(close).toHaveBeenCalledExactlyOnceWith("failed");
  });

  // Next hides a screen it leaves (its effects stopped) and shows it again
  // on Back (started again): the 15 minutes run from the last activity.
  it("keeps the moment of the last activity while the screen is hidden and shown again", async () => {
    const { clock, close, watch } = setup();
    const stop = watch();
    clock.pass(5 * MINUTE);
    stop();
    clock.pass(5 * MINUTE);
    watch();
    await settle();
    clock.pass(5 * MINUTE - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
  });

  it("closes a file shown again after its 15 minutes before anything else, asking nothing", () => {
    const { clock, keep, close, page, watch } = setup();
    const stop = watch();
    stop();
    clock.pass(20 * MINUTE);
    keep.mockClear();
    watch();
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
    expect(keep).not.toHaveBeenCalled();
    expect(page.listening).toBe(0);
    expect(clock.timers.size).toBe(0);
  });

  it("asks again when shown, leaving an answer that came while hidden", async () => {
    let letGo: (answer: KeepOpenAnswer) => void = () => {};
    const { keep, close, watch } = setup(
      () =>
        new Promise((resolve) => {
          letGo = resolve;
        }),
    );
    const stop = watch();
    stop();
    letGo({ open: false });
    await settle();
    expect(close).not.toHaveBeenCalled();
    watch();
    expect(keep).toHaveBeenCalledTimes(2);
    letGo({ open: false });
    await settle();
    expect(close).toHaveBeenCalledExactlyOnceWith("closed");
  });

  it("closes as the page comes back after 15 minutes away, or on a press after them", () => {
    const away = setup();
    away.watch();
    away.page.set("hidden");
    // Asleep: the timer held back.
    away.clock.sleep(FILE_IDLE_MS + 1);
    expect(away.close).not.toHaveBeenCalled();
    away.page.set("visible");
    expect(away.close).toHaveBeenCalledExactlyOnceWith("idle");

    const pressed = setup();
    pressed.watch();
    pressed.clock.sleep(FILE_IDLE_MS);
    pressed.keep.mockClear();
    pressed.page.press();
    expect(pressed.close).toHaveBeenCalledExactlyOnceWith("idle");
    expect(pressed.keep).not.toHaveBeenCalled();
  });

  it("listens no more once stopped", () => {
    const { clock, close, page, watch } = setup();
    const stop = watch();
    expect(page.listening).toBe(3);
    stop();
    expect(page.listening).toBe(0);
    expect(clock.timers.size).toBe(0);
    clock.pass(FILE_IDLE_MS);
    page.press();
    expect(close).not.toHaveBeenCalled();
  });
});

describe("lockAndDraw", () => {
  it("locks the files, then draws the page again", async () => {
    let unlock: () => void = () => {};
    const lock = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          unlock = () => resolve({ ok: true });
        }),
    );
    const draw = vi.fn();
    const done = lockAndDraw("idle", lock, draw);
    await settle();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(draw).not.toHaveBeenCalled();
    unlock();
    await done;
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("draws the page again even when the lock fails", async () => {
    for (const why of ["idle", "failed", "pressed"] as const) {
      const draw = vi.fn();
      await lockAndDraw(why, () => Promise.reject(new Error("offline")), draw);
      expect(draw, why).toHaveBeenCalledTimes(1);
      const thrown = vi.fn();
      await lockAndDraw(
        why,
        () => {
          throw new Error("500");
        },
        thrown,
      );
      expect(thrown, why).toHaveBeenCalledTimes(1);
    }
  });

  it("only draws when the server said the files are closed already", async () => {
    const lock = vi.fn(async () => ({ ok: true as const }));
    const draw = vi.fn();
    await lockAndDraw("closed", lock, draw);
    expect(lock).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
  });
});
