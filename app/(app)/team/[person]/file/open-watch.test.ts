import { FILE_IDLE_MS, FILE_TOUCH_EVERY_MS } from "@domain/file-holders";
import { describe, expect, it, vi } from "vitest";
import type { FileTabNews, FileTabs } from "./file-tabs";
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
 * its own: 15 minutes from the last activity on any of the device's tabs,
 * failing closed when the server can't be asked, and the 15 minutes kept
 * while Next hides the screen and shows it again (an <Activity>: its state
 * kept, its effects stopped and started again), so a file left open on a
 * screen kept for later never comes back with a fresh quarter of an hour,
 * nor is drawn at all once it passed. A page put away hides the file, and
 * coming back asks the server at once, the file hidden until it says the
 * file is open, so a file locked in another tab never shows again; another
 * tab's lock closes it at once.
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

/** The device's other tabs: what this one told them, and their news to it. */
class Tabs implements FileTabs {
  told: FileTabNews[] = [];
  heard: ((news: FileTabNews) => void) | null = null;
  tell = (news: FileTabNews) => {
    this.told.push(news);
  };
  hear = (heard: (news: FileTabNews) => void) => {
    this.heard = heard;
    return () => {
      this.heard = null;
    };
  };
  say(news: FileTabNews) {
    this.heard?.(news);
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
  const tabs = new Tabs();
  const memory: OpenFileMemory = { lastActivity: null };
  const keep = vi.fn(keepOpen);
  const close = vi.fn();
  const hold = vi.fn();
  /** Whether the file is hidden now, by the last word the watch gave. */
  const held = () => hold.mock.lastCall?.[0] === true;
  const watch = () =>
    watchOpenFile({
      memory,
      keepOpen: keep,
      close,
      hold,
      page: page as unknown as WatchedPage,
      win: clock as unknown as WatchedWindow,
      tabs,
      now: clock.now,
    });
  return { page, clock, tabs, memory, keep, close, hold, held, watch };
}

describe("watchOpenFile", () => {
  it("tells the server as the file opens, and closes it 15 minutes after", async () => {
    const { clock, memory, keep, close, hold, page, watch } = setup();
    watch();
    expect(keep).toHaveBeenCalledTimes(1);
    expect(memory.lastActivity).toBe(clock.at);
    // Just opened from the server's own drawing: shown at once.
    expect(hold).not.toHaveBeenCalled();
    await settle();
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
    expect(page.listening).toBe(0);
  });

  it("starts the 15 minutes again on a press or a key, telling the server and the other tabs at most once a minute", async () => {
    const { clock, tabs, keep, close, page, watch } = setup();
    const opened = clock.at;
    watch();
    clock.pass(10 * MINUTE);
    page.press();
    expect(keep).toHaveBeenCalledTimes(2);
    clock.pass(FILE_TOUCH_EVERY_MS / 2);
    page.key();
    expect(keep).toHaveBeenCalledTimes(2);
    expect(tabs.told).toEqual([
      { kind: "active", at: opened },
      { kind: "active", at: opened + 10 * MINUTE },
    ]);
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
    const { clock, keep, close, page, tabs, watch } = setup();
    const stop = watch();
    stop();
    clock.pass(20 * MINUTE);
    keep.mockClear();
    watch();
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
    expect(keep).not.toHaveBeenCalled();
    expect(page.listening).toBe(0);
    expect(clock.timers.size).toBe(0);
    expect(tabs.heard).toBeNull();
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

  // Shown again by Next: the file may have been locked in another tab
  // meanwhile, where this screen, its effects stopped, heard nothing.
  it("hides a file shown again by Next until the server says it is open", async () => {
    let letGo: (answer: KeepOpenAnswer) => void = () => {};
    const { clock, keep, held, watch } = setup(
      () =>
        new Promise((resolve) => {
          letGo = resolve;
        }),
    );
    const stop = watch();
    letGo({ open: true });
    await settle();
    stop();
    // Within the minute: the server is asked all the same.
    clock.pass(FILE_TOUCH_EVERY_MS / 4);
    watch();
    expect(keep).toHaveBeenCalledTimes(2);
    expect(held()).toBe(true);
    letGo({ open: true });
    await settle();
    expect(held()).toBe(false);
  });

  it("hides the file as the page is put away, and asks the server at once as it comes back", async () => {
    let letGo: (answer: KeepOpenAnswer) => void = () => {};
    const { clock, keep, close, page, held, watch } = setup(
      () =>
        new Promise((resolve) => {
          letGo = resolve;
        }),
    );
    watch();
    letGo({ open: true });
    await settle();
    page.set("hidden");
    expect(held()).toBe(true);
    // Back within the minute that would hold a press's touch back.
    clock.pass(FILE_TOUCH_EVERY_MS / 4);
    page.set("visible");
    expect(keep).toHaveBeenCalledTimes(2);
    expect(held()).toBe(true);
    letGo({ open: true });
    await settle();
    expect(held()).toBe(false);
    expect(close).not.toHaveBeenCalled();
  });

  // The second review's case: "נעילת התיק" in one tab, and whoever comes to
  // the other sees nothing of the file.
  it("never shows again a file locked in another tab, as its page comes back", async () => {
    let locked = false;
    const { keep, close, page, held, watch } = setup(async () => ({
      open: !locked,
    }));
    watch();
    await settle();
    page.set("hidden");
    locked = true;
    page.set("visible");
    expect(held()).toBe(true);
    await settle();
    expect(keep).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledExactlyOnceWith("closed");
    expect(held()).toBe(true);
    expect(page.listening).toBe(0);
  });

  it("fails closed on coming back when the server can't be asked", async () => {
    let offline = false;
    const { close, page, held, watch } = setup(async () => {
      if (offline) throw new Error("offline");
      return { open: true };
    });
    watch();
    await settle();
    page.set("hidden");
    offline = true;
    page.set("visible");
    await settle();
    expect(close).toHaveBeenCalledExactlyOnceWith("failed");
    expect(held()).toBe(true);
  });

  it("shows the file only on the answer to the last coming back", async () => {
    const answers: ((answer: KeepOpenAnswer) => void)[] = [];
    const { page, held, watch } = setup(
      () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    );
    watch();
    answers[0]?.({ open: true });
    await settle();
    page.set("hidden");
    page.set("visible");
    page.set("hidden");
    // The first look answers while the page is away again: still hidden.
    answers[1]?.({ open: true });
    await settle();
    expect(held()).toBe(true);
    page.set("visible");
    answers[2]?.({ open: true });
    await settle();
    expect(held()).toBe(false);
  });

  it("holds a file that opens on a page put away, and asks as the page comes back", async () => {
    const { keep, page, held, watch } = setup();
    page.visibilityState = "hidden";
    watch();
    expect(keep).not.toHaveBeenCalled();
    expect(held()).toBe(true);
    page.set("visible");
    expect(keep).toHaveBeenCalledTimes(1);
    await settle();
    expect(held()).toBe(false);
  });

  it("closes as the page comes back after 15 minutes away, or on a press after them", () => {
    const away = setup();
    away.watch();
    away.page.set("hidden");
    // Asleep: the timer held back.
    away.clock.sleep(FILE_IDLE_MS + 1);
    expect(away.close).not.toHaveBeenCalled();
    away.keep.mockClear();
    away.page.set("visible");
    expect(away.close).toHaveBeenCalledExactlyOnceWith("idle");
    expect(away.keep).not.toHaveBeenCalled();

    const pressed = setup();
    pressed.watch();
    pressed.clock.sleep(FILE_IDLE_MS);
    pressed.keep.mockClear();
    pressed.page.press();
    expect(pressed.close).toHaveBeenCalledExactlyOnceWith("idle");
    expect(pressed.keep).not.toHaveBeenCalled();
  });

  it("closes at once when another tab locks the files, asking nothing", async () => {
    const { clock, keep, close, page, tabs, watch } = setup();
    watch();
    await settle();
    keep.mockClear();
    tabs.say({ kind: "closed" });
    expect(close).toHaveBeenCalledExactlyOnceWith("elsewhere");
    expect(keep).not.toHaveBeenCalled();
    expect(page.listening).toBe(0);
    expect(tabs.heard).toBeNull();
    expect(clock.timers.size).toBe(0);
  });

  // The device's files close together after 15 minutes with no activity on
  // any of them: one tab in use keeps the others open.
  it("starts the 15 minutes again on another tab's activity, never later than now", async () => {
    const { clock, keep, close, tabs, watch } = setup();
    watch();
    await settle();
    clock.pass(10 * MINUTE);
    tabs.say({ kind: "active", at: clock.at });
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    // A moment before the last activity doesn't bring the lock nearer; one
    // later than now counts as now.
    tabs.say({ kind: "active", at: clock.at - 20 * MINUTE });
    clock.pass(0);
    expect(close).not.toHaveBeenCalled();
    tabs.say({ kind: "active", at: clock.at + 60 * MINUTE });
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
    // Heard, not done here: nothing asked of the server, nothing told back.
    expect(keep).toHaveBeenCalledTimes(1);
    expect(tabs.told).toHaveLength(1);
  });

  it("listens no more once stopped", () => {
    const { clock, close, page, tabs, watch } = setup();
    const stop = watch();
    expect(page.listening).toBe(3);
    expect(tabs.heard).not.toBeNull();
    stop();
    expect(page.listening).toBe(0);
    expect(tabs.heard).toBeNull();
    expect(clock.timers.size).toBe(0);
    clock.pass(FILE_IDLE_MS);
    page.press();
    tabs.say({ kind: "closed" });
    expect(close).not.toHaveBeenCalled();
  });
});

describe("lockAndDraw", () => {
  const parts = (lock: () => Promise<{ ok: true }>) => {
    const tell = vi.fn();
    const draw = vi.fn();
    return { tell, lock: vi.fn(lock), draw };
  };

  it("tells the other tabs at once, locks the files, then draws the page again", async () => {
    let unlock: () => void = () => {};
    const { tell, lock, draw } = parts(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          unlock = () => resolve({ ok: true });
        }),
    );
    const done = lockAndDraw("idle", { tell, lock, draw });
    // Before the server answers.
    expect(tell).toHaveBeenCalledTimes(1);
    await settle();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(draw).not.toHaveBeenCalled();
    unlock();
    await done;
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("tells the other tabs whenever the files lock here", async () => {
    for (const why of ["idle", "failed", "pressed"] as const) {
      const { tell, lock, draw } = parts(async () => ({ ok: true }));
      await lockAndDraw(why, { tell, lock, draw });
      expect(tell, why).toHaveBeenCalledTimes(1);
    }
  });

  it("draws the page again even when the lock or the telling fails", async () => {
    for (const why of ["idle", "failed", "pressed", "elsewhere"] as const) {
      const draw = vi.fn();
      await lockAndDraw(why, {
        tell: () => {
          throw new Error("closed channel");
        },
        lock: () => Promise.reject(new Error("offline")),
        draw,
      });
      expect(draw, why).toHaveBeenCalledTimes(1);
      const thrown = vi.fn();
      await lockAndDraw(why, {
        tell: () => {},
        lock: () => {
          throw new Error("500");
        },
        draw: thrown,
      });
      expect(thrown, why).toHaveBeenCalledTimes(1);
    }
  });

  it("only draws when the server said the files are closed already", async () => {
    const { tell, lock, draw } = parts(async () => ({ ok: true }));
    await lockAndDraw("closed", { tell, lock, draw });
    expect(tell).not.toHaveBeenCalled();
    expect(lock).not.toHaveBeenCalled();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("locks here too when another tab locked, telling nobody back", async () => {
    const { tell, lock, draw } = parts(async () => ({ ok: true }));
    await lockAndDraw("elsewhere", { tell, lock, draw });
    expect(tell).not.toHaveBeenCalled();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(draw).toHaveBeenCalledTimes(1);
  });
});
