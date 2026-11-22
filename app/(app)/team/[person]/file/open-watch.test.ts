import { FILE_IDLE_MS, FILE_TOUCH_EVERY_MS } from "@domain/file-holders";
import { describe, expect, it, vi } from "vitest";
import type { FileTabNews, FileTabs } from "./file-tabs";
import type { KeepOpenAnswer } from "./holder-file-types";
import {
  KEEP_OPEN_WAIT_MS,
  lockAndDraw,
  type OpenFileMemory,
  type WatchedPage,
  type WatchedWindow,
  watchOpenFile,
} from "./open-watch";

/*
 * The open file's idle lock (profile H6a, plan §3.5), against a clock of
 * its own: 15 minutes from the last activity on any of the device's tabs,
 * failing closed when the server can't be asked or doesn't answer. A screen
 * Next hides and shows again (an <Activity>: its state kept, its effects
 * stopped and started again) heard nothing meanwhile, so it is held until
 * the server says the file is open, whatever its own clock says, and never
 * locks the device on it; its 15 minutes then start from the answer. A page
 * put away hides the file, and coming back asks the server at once, the
 * file hidden until it says the file is open, so a file locked in another
 * tab never shows again; another tab's lock closes it at once, and another
 * tab's activity keeps it open only as long as the server says so.
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
    // Answered: only the 15 minutes' timer is left.
    expect(clock.timers.size).toBe(1);
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
    await settle();
    clock.pass(10 * MINUTE);
    page.press();
    expect(keep).toHaveBeenCalledTimes(2);
    await settle();
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

  // A weak connection, or an answer lost: the file is never left hidden
  // with nothing said, and ends on "התיק נעול".
  it("fails closed when the server's answer doesn't come", async () => {
    const { clock, close, page, tabs, watch } = setup(
      () => new Promise(() => {}),
    );
    watch();
    clock.pass(KEEP_OPEN_WAIT_MS - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("failed");
    expect(page.listening).toBe(0);
    expect(tabs.heard).toBeNull();
    expect(clock.timers.size).toBe(0);
  });

  it("fails closed when the answer doesn't come on coming back, the file held till then", async () => {
    let asked = 0;
    const { clock, close, page, held, watch } = setup(() => {
      asked += 1;
      return asked === 1
        ? Promise.resolve({ open: true })
        : new Promise(() => {});
    });
    watch();
    await settle();
    page.set("hidden");
    page.set("visible");
    expect(held()).toBe(true);
    // A press while it waits asks nothing more within the minute.
    page.press();
    expect(asked).toBe(2);
    clock.pass(KEEP_OPEN_WAIT_MS);
    expect(close).toHaveBeenCalledExactlyOnceWith("failed");
    expect(held()).toBe(true);
  });

  // Next hides a screen it leaves (its effects stopped) and shows it again
  // on Back (started again). Meanwhile the person worked elsewhere, in this
  // tab or another, sliding the server's 15 minutes each minute: its own
  // clock heard none of that, so the server decides, and its 15 minutes
  // start again from the answer, as the server's did.
  it("starts the 15 minutes of a screen shown again from the server's answer: at 14 minutes, it doesn't lock a minute later", async () => {
    const { clock, keep, close, held, watch } = setup();
    const stop = watch();
    await settle();
    clock.pass(14 * MINUTE);
    stop();
    watch();
    expect(keep).toHaveBeenCalledTimes(2);
    expect(held()).toBe(true);
    await settle();
    expect(held()).toBe(false);
    clock.pass(2 * MINUTE);
    expect(close).not.toHaveBeenCalled();
    clock.pass(FILE_IDLE_MS - 2 * MINUTE - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
  });

  it("asks the server first for a screen shown again after its own 15 minutes, held and telling nothing until it answers open", async () => {
    let letGo: (answer: KeepOpenAnswer) => void = () => {};
    const { clock, keep, close, page, tabs, held, watch } = setup(
      () =>
        new Promise((resolve) => {
          letGo = resolve;
        }),
    );
    const stop = watch();
    letGo({ open: true });
    await settle();
    stop();
    // 20 minutes on another file, heard by none of this screen.
    clock.pass(20 * MINUTE);
    keep.mockClear();
    const told = tabs.told.length;
    watch();
    expect(close).not.toHaveBeenCalled();
    expect(keep).toHaveBeenCalledTimes(1);
    expect(held()).toBe(true);
    // Its own clock decides nothing: a press while it waits locks nothing.
    page.press();
    clock.pass(KEEP_OPEN_WAIT_MS / 2);
    expect(close).not.toHaveBeenCalled();
    expect(tabs.told).toHaveLength(told);
    letGo({ open: true });
    await settle();
    expect(held()).toBe(false);
    expect(close).not.toHaveBeenCalled();
    // The server slid its 15 minutes: the other tabs hear of it, never that
    // the files closed.
    expect(tabs.told.slice(told)).toEqual([{ kind: "active", at: clock.at }]);
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
  });

  it("closes a screen shown again after its own 15 minutes as the server says, telling the other tabs nothing", async () => {
    let open = true;
    const { clock, close, page, tabs, held, watch } = setup(async () => ({
      open,
    }));
    const stop = watch();
    await settle();
    stop();
    clock.pass(20 * MINUTE);
    open = false;
    const told = tabs.told.length;
    watch();
    expect(held()).toBe(true);
    await settle();
    // Closed as the server said, not "idle": nothing told, nothing locked.
    expect(close).toHaveBeenCalledExactlyOnceWith("closed");
    expect(tabs.told).toHaveLength(told);
    expect(held()).toBe(true);
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
  // any of them: one tab in use keeps the others open, as long as the
  // server says each is still open.
  it("starts the 15 minutes again on another tab's activity, asking the server once a minute, never later than now", async () => {
    const { clock, keep, close, tabs, watch } = setup();
    watch();
    await settle();
    clock.pass(10 * MINUTE);
    tabs.say({ kind: "active", at: clock.at });
    // The server decides each extension: asked once for the minute.
    expect(keep).toHaveBeenCalledTimes(2);
    await settle();
    clock.pass(FILE_TOUCH_EVERY_MS / 2);
    tabs.say({ kind: "active", at: clock.at });
    expect(keep).toHaveBeenCalledTimes(2);
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    // A moment before the last activity doesn't bring the lock nearer, nor
    // asks; one later than now counts as now.
    tabs.say({ kind: "active", at: clock.at - 20 * MINUTE });
    clock.pass(0);
    expect(close).not.toHaveBeenCalled();
    expect(keep).toHaveBeenCalledTimes(2);
    tabs.say({ kind: "active", at: clock.at + 60 * MINUTE });
    expect(keep).toHaveBeenCalledTimes(3);
    await settle();
    clock.pass(FILE_IDLE_MS - 1);
    expect(close).not.toHaveBeenCalled();
    clock.pass(1);
    expect(close).toHaveBeenCalledExactlyOnceWith("idle");
    // Heard, not done here: nothing told back.
    expect(tabs.told).toHaveLength(1);
  });

  // A shared computer: the file was left open in one window, its step-up
  // gone (signed out, or another person's or business's now), while someone
  // works on a file of their own in another.
  it("closes on another tab's activity when the server says this file is closed, telling nothing", async () => {
    let open = true;
    const { clock, close, page, tabs, watch } = setup(async () => ({ open }));
    watch();
    await settle();
    clock.pass(2 * MINUTE);
    open = false;
    tabs.say({ kind: "active", at: clock.at });
    await settle();
    expect(close).toHaveBeenCalledExactlyOnceWith("closed");
    expect(tabs.told).toEqual([{ kind: "active", at: clock.at - 2 * MINUTE }]);
    expect(page.listening).toBe(0);
    expect(clock.timers.size).toBe(0);
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
