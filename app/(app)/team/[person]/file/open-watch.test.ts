import {
  FILE_IDLE_MS,
  FILE_TOUCH_EVERY_MS,
  stepUpLeft,
} from "@domain/file-holders";
import { describe, expect, it, vi } from "vitest";
import type { FileTabNews, FileTabs } from "./file-tabs";
import type { KeepOpenAnswer, LockAnswer } from "./holder-file-types";
import {
  closeAndDraw,
  KEEP_OPEN_WAIT_MS,
  type OpenFileMemory,
  type WatchClose,
  type WatchedPage,
  type WatchedWindow,
  watchOpenFile,
} from "./open-watch";

/*
 * How long an open hiring file shows in a tab (profile H6a, plan §3.5), on a
 * device of tabs and a stand-in for the server's one step-up, against a
 * clock of their own: the rule's six points, one test each (the rule is in
 * ./open-watch), then the three cases the final check found, then tabs left
 * alone, which never keep each other open, then the screen's own mechanics
 * and `closeAndDraw`.
 */

const MINUTE = 60_000;
/**
 * How long the server takes to answer here. Its moment comes before its
 * answer, as a real server's does, so a tab's 15 minutes, counted from the
 * answer, end after the server's.
 */
const TRIP_MS = 100;

/** An answer that the file is open, with its 15 minutes just slid. */
const OPEN: KeepOpenAnswer = { open: true, leftMs: FILE_IDLE_MS };

/** What waits on promises, done. */
const settle = () => new Promise((resolve) => setImmediate(resolve));

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

type Timer = { due: number; run: () => void; owner: Timers };

/** A tab's timers, or the server's: held back while the tab sleeps (a phone's background tab). */
class Timers {
  asleep = false;
  constructor(private readonly clock: Clock) {}
  setTimeout = ((run: () => void, delay = 0) =>
    this.clock.add(this, run, delay)) as unknown as Window["setTimeout"];
  clearTimeout = ((id?: number) => {
    if (id !== undefined) this.clock.remove(id);
  }) as unknown as Window["clearTimeout"];
  /** How many of its timers wait. */
  pending(): number {
    return this.clock.pending(this);
  }
}

/** The device's clock: time passes, each timer due runs at its moment, and what it set off settles before the next. */
class Clock {
  at = 1_700_000_000_000;
  private next = 1;
  private readonly timers = new Map<number, Timer>();
  /** The server's, for its answers' trips. */
  readonly server = new Timers(this);
  now = () => this.at;

  add(owner: Timers, run: () => void, delay: number): number {
    const id = this.next++;
    this.timers.set(id, { due: this.at + delay, run, owner });
    return id;
  }

  remove(id: number) {
    this.timers.delete(id);
  }

  pending(owner: Timers): number {
    let count = 0;
    for (const timer of this.timers.values()) {
      if (timer.owner === owner) count += 1;
    }
    return count;
  }

  async pass(ms: number) {
    const end = this.at + ms;
    await settle();
    for (;;) {
      let first: [number, Timer] | undefined;
      for (const entry of this.timers) {
        const timer = entry[1];
        if (timer.owner.asleep || timer.due > end) continue;
        if (!first || timer.due < first[1].due) first = entry;
      }
      if (!first) break;
      const [id, timer] = first;
      this.timers.delete(id);
      this.at = Math.max(this.at, timer.due);
      timer.run();
      await settle();
    }
    this.at = end;
    await settle();
  }

  /** Time passes until `at`. */
  async to(at: number) {
    if (at < this.at) throw new Error("the clock only runs forward");
    await this.pass(at - this.at);
  }
}

/**
 * The device's one step-up on the server (the cookie), as
 * `keepFileOpenAction` keeps it: whose files it opens (a business and a
 * holder), and its moment, fresh for 15 minutes. A check for activity
 * (`slide`) that finds it so slides it, and says 15 minutes are left; any
 * other check only reads how long is.
 */
class Server {
  stepUp: { whose: string; at: number } | null;
  /** The moments a check slid the step-up. */
  readonly slid: number[] = [];
  readonly lock = vi.fn(async (): Promise<LockAnswer> => {
    this.stepUp = null;
    return { ok: true };
  });

  constructor(private readonly clock: Clock) {
    this.stepUp = { whose: "b1", at: clock.now() };
  }

  /** A right code: the step-up is `whose` now, and only theirs. */
  open(whose: string) {
    this.stepUp = { whose, at: this.clock.now() };
  }

  /** A tab's check on `whose` file, answered a trip later. */
  keepOpenFor(whose: string): (slide: boolean) => Promise<KeepOpenAnswer> {
    return (slide) => {
      const at = this.clock.now();
      const step = this.stepUp;
      const left =
        step !== null && step.whose === whose ? stepUpLeft(step.at, at) : null;
      let answer: KeepOpenAnswer = { open: false };
      if (left !== null && slide) {
        this.stepUp = { whose, at };
        this.slid.push(at);
        answer = { open: true, leftMs: FILE_IDLE_MS };
      } else if (left !== null) {
        answer = { open: true, leftMs: left };
      }
      return new Promise((resolve) => {
        this.clock.server.setTimeout(() => resolve(answer), TRIP_MS);
      });
    };
  }
}

/** The device's tabs: what one tells reaches every other a moment later; one asleep hears it as it wakes. */
class Device {
  readonly lines = new Set<Line>();

  line(win: Timers): Line {
    const line = new Line(this, win);
    this.lines.add(line);
    return line;
  }
}

class Line implements FileTabs {
  told: FileTabNews[] = [];
  private heard: ((news: FileTabNews) => void) | null = null;
  private readonly queued: FileTabNews[] = [];

  constructor(
    private readonly device: Device,
    private readonly win: Timers,
  ) {}

  tell = (news: FileTabNews) => {
    this.told.push(news);
    for (const other of this.device.lines) {
      if (other !== this) queueMicrotask(() => other.take(news));
    }
  };

  hear = (heard: (news: FileTabNews) => void) => {
    this.heard = heard;
    return () => {
      this.heard = null;
    };
  };

  get hearing(): boolean {
    return this.heard !== null;
  }

  take(news: FileTabNews) {
    if (this.win.asleep) this.queued.push(news);
    else this.heard?.(news);
  }

  /** Awake: what it was told while asleep, heard now. */
  wake() {
    for (const news of this.queued.splice(0)) this.heard?.(news);
  }
}

/**
 * One tab of the device with a file open for `whose`, closing as the
 * screen does (`closeAndDraw`); `keepOpen` stands in for its checks.
 * `apart`, its channel is blocked: it hears no other tab, and none hears it.
 */
function tabOf(
  device: Device,
  clock: Clock,
  server: Server,
  {
    whose = "b1",
    keepOpen,
    apart = false,
  }: {
    whose?: string;
    keepOpen?: (slide: boolean) => Promise<KeepOpenAnswer>;
    apart?: boolean;
  } = {},
) {
  const page = new Page();
  const win = new Timers(clock);
  const line = (apart ? new Device() : device).line(win);
  const memory: OpenFileMemory = { shown: false };
  const keep = vi.fn(keepOpen ?? server.keepOpenFor(whose));
  const hold = vi.fn();
  const draw = vi.fn();
  const parts = {
    tell: () => line.tell({ kind: "closed" }),
    lock: server.lock,
    draw,
  };
  let closedAt: number | null = null;
  const close = vi.fn((why: WatchClose) => {
    closedAt = clock.now();
    void closeAndDraw(why, parts);
  });
  let stop = () => {};
  return {
    page,
    win,
    line,
    keep,
    hold,
    draw,
    close,
    /** When the file closed in this tab. */
    closedAt: () => closedAt,
    /** Whether each of its checks, in order, was for activity here, which slides the step-up. */
    slides: () => keep.mock.calls.map(([slide]) => slide),
    /** Whether the file is hidden now, by the last word the watch gave. */
    held: () => hold.mock.lastCall?.[0] === true,
    /** Whether it told any tab that the files closed. */
    toldClosed: () => line.told.some((news) => news.kind === "closed"),
    /** The screen shows the file. */
    watch() {
      stop = watchOpenFile({
        memory,
        keepOpen: keep,
        close,
        hold,
        page: page as unknown as WatchedPage,
        win: win as unknown as WatchedWindow,
        tabs: line,
        now: clock.now,
      });
      return stop;
    },
    /** "נעילת התיק": the file goes from the screen, and closes on the device. */
    async lock() {
      stop();
      await closeAndDraw("pressed", parts);
    },
  };
}

type Tab = ReturnType<typeof tabOf>;

function setup() {
  const clock = new Clock();
  const server = new Server(clock);
  const device = new Device();
  return {
    clock,
    server,
    tab: (options?: Parameters<typeof tabOf>[3]) =>
      tabOf(device, clock, server, options),
    /** A tab of the device with no file watched, as signing out speaks. */
    bare: () => device.line(new Timers(clock)),
  };
}

/** The file closed in this tab alone: no tab told, nothing forgotten, its timers and its ears gone. */
function closedAlone(tab: Tab, server: Server, why: WatchClose) {
  expect(tab.close).toHaveBeenCalledExactlyOnceWith(why);
  expect(tab.toldClosed()).toBe(false);
  expect(server.lock).not.toHaveBeenCalled();
  expect(tab.draw).toHaveBeenCalledTimes(1);
  expect(tab.win.pending()).toBe(0);
  expect(tab.page.listening).toBe(0);
  expect(tab.line.hearing).toBe(false);
}

describe("watchOpenFile, by the rule", () => {
  it("1. only the server says whether the file is open: past its own 15 minutes a tab asks, shows the file again for as long as the server says, and closes when it says not", async () => {
    const { clock, server, tab } = setup();
    const a = tab();
    a.watch();
    await clock.pass(TRIP_MS);
    // Another tab in use at 10 minutes, whose word never came here (its
    // channel blocked): the server's 15 minutes slid all the same.
    await clock.pass(10 * MINUTE);
    void server.keepOpenFor("b1")(true);
    const used = clock.now();
    await clock.pass(5 * MINUTE - 1);
    expect(a.held()).toBe(false);
    await clock.pass(1);
    // Its own 15 minutes passed: hidden, and the server asked, only to read.
    expect(a.held()).toBe(true);
    expect(a.slides()).toEqual([true, false]);
    await clock.pass(TRIP_MS);
    expect(a.held()).toBe(false);
    expect(a.close).not.toHaveBeenCalled();
    // The clock's own check slid nothing, and said nothing to the other tabs.
    expect(server.stepUp?.at).toBe(used);
    expect(a.line.told).toEqual([{ kind: "active" }]);

    // Shown again for the 10 minutes the server had left, not 15: nobody
    // since, so its step-up has gone by itself when they pass, and the file
    // closes here, forgetting nothing.
    await clock.to(used + FILE_IDLE_MS + TRIP_MS - 1);
    expect(a.held()).toBe(false);
    await clock.pass(1);
    expect(a.held()).toBe(true);
    await clock.pass(TRIP_MS);
    closedAlone(a, server, "closed");
    expect(server.stepUp).not.toBeNull();
  });

  it("2. only 'נעילת התיק', or signing out, closes the files on the whole device: every tab told at once, asking nothing, and the step-up forgotten", async () => {
    const { clock, server, tab, bare } = setup();
    const a = tab();
    const b = tab();
    a.watch();
    b.watch();
    await clock.pass(TRIP_MS);
    b.keep.mockClear();
    await a.lock();
    await clock.pass(0);
    expect(server.stepUp).toBeNull();
    expect(a.draw).toHaveBeenCalledTimes(1);
    expect(b.close).toHaveBeenCalledExactlyOnceWith("elsewhere");
    expect(b.keep).not.toHaveBeenCalled();
    expect(b.draw).toHaveBeenCalledTimes(1);
    expect(b.win.pending()).toBe(0);
    // The tab that pressed forgot the step-up; the one that heard didn't again.
    expect(server.lock).toHaveBeenCalledTimes(1);

    // Signing out says the same from a tab with no file (`closeFilesOnDevice`).
    server.open("b1");
    const c = tab();
    c.watch();
    await clock.pass(TRIP_MS);
    bare().tell({ kind: "closed" });
    await clock.pass(0);
    expect(c.close).toHaveBeenCalledExactlyOnceWith("elsewhere");
    expect(c.toldClosed()).toBe(false);
  });

  it("3. anything else closes the file in this tab only, telling no tab and forgetting nothing", async () => {
    // The server says closed, on a press's check.
    {
      const { clock, server, tab } = setup();
      const t = tab();
      t.watch();
      await clock.pass(TRIP_MS);
      server.stepUp = null;
      await clock.pass(2 * MINUTE);
      t.page.press();
      await clock.pass(TRIP_MS);
      closedAlone(t, server, "closed");
    }
    // The check fails, or throws: offline, or the action failed.
    for (const keepOpen of [
      () => Promise.reject(new Error("offline")),
      () => {
        throw new Error("500");
      },
    ]) {
      const { clock, server, tab } = setup();
      const t = tab({ keepOpen });
      t.watch();
      await clock.pass(0);
      closedAlone(t, server, "failed");
    }
    // No answer within 10 seconds.
    {
      const { clock, server, tab } = setup();
      const t = tab({ keepOpen: () => new Promise<KeepOpenAnswer>(() => {}) });
      t.watch();
      await clock.pass(KEEP_OPEN_WAIT_MS - 1);
      expect(t.close).not.toHaveBeenCalled();
      await clock.pass(1);
      closedAlone(t, server, "failed");
    }
    // Its own 15 minutes passed, and the server's too.
    {
      const { clock, server, tab } = setup();
      const t = tab();
      t.watch();
      await clock.pass(TRIP_MS + FILE_IDLE_MS);
      expect(t.held()).toBe(true);
      await clock.pass(TRIP_MS);
      closedAlone(t, server, "closed");
    }
    // Back to the page after 20 minutes asleep, the server's 15 minutes gone.
    {
      const { clock, server, tab } = setup();
      const t = tab();
      t.watch();
      await clock.pass(TRIP_MS);
      t.page.set("hidden");
      t.win.asleep = true;
      await clock.pass(20 * MINUTE);
      t.win.asleep = false;
      t.page.set("visible");
      expect(t.close).not.toHaveBeenCalled();
      await clock.pass(TRIP_MS);
      closedAlone(t, server, "closed");
      expect(t.held()).toBe(true);
    }
    // A screen Next shows again, the files locked meanwhile.
    {
      const { clock, server, tab } = setup();
      const t = tab();
      const stop = t.watch();
      await clock.pass(TRIP_MS);
      stop();
      await clock.pass(MINUTE);
      server.stepUp = null;
      t.watch();
      expect(t.held()).toBe(true);
      await clock.pass(TRIP_MS);
      closedAlone(t, server, "closed");
      expect(t.held()).toBe(true);
    }
  });

  it("4. ends its 15 minutes when the server's end, each open answer saying how long is left, counted from the answer; another tab's word asks the server at most once a minute, one kept for the minute's end", async () => {
    const { clock, server, tab, bare } = setup();
    const a = tab();
    const other = bare();
    const start = clock.now();
    a.watch();
    await clock.pass(TRIP_MS);
    // Two words within the minute of its check: nothing asked yet.
    await clock.pass(20_000);
    other.tell({ kind: "active" });
    await clock.pass(20_000);
    other.tell({ kind: "active" });
    await clock.to(start + FILE_TOUCH_EVERY_MS - 1);
    expect(a.keep).toHaveBeenCalledTimes(1);
    // One check at the minute's end, for both.
    await clock.pass(1);
    expect(a.keep).toHaveBeenCalledTimes(2);
    await clock.pass(TRIP_MS);
    // A word past the minute asks at once.
    await clock.pass(5 * MINUTE);
    other.tell({ kind: "active" });
    await clock.pass(0);
    expect(a.keep).toHaveBeenCalledTimes(3);
    await clock.pass(TRIP_MS);
    // Each answer said what the step-up had left, never a fresh 15 minutes:
    // nobody slid it since the file opened, so the tab asks again as the
    // server's 15 minutes end, and none sooner, and the file closes.
    expect(a.slides()).toEqual([true, false, false]);
    await clock.to(start + FILE_IDLE_MS + TRIP_MS - 1);
    expect(a.held()).toBe(false);
    expect(a.keep).toHaveBeenCalledTimes(3);
    await clock.pass(1);
    expect(a.held()).toBe(true);
    await clock.pass(TRIP_MS);
    closedAlone(a, server, "closed");
    expect(server.slid).toEqual([start]);
  });

  it("5. slides the step-up only on a check for activity here, telling the other tabs once it answers open; a check for another tab's word only reads it, and tells nothing", async () => {
    const { clock, server, tab, bare } = setup();
    const a = tab();
    const other = bare();
    a.watch();
    // Asked as it opens, for activity here, not answered yet: nothing told.
    expect(a.slides()).toEqual([true]);
    expect(a.line.told).toEqual([]);
    await clock.pass(TRIP_MS);
    expect(a.line.told).toEqual([{ kind: "active" }]);
    // Another tab's word: asked only to read, answered open, nothing told back.
    await clock.pass(2 * MINUTE);
    other.tell({ kind: "active" });
    await clock.pass(TRIP_MS);
    expect(a.slides()).toEqual([true, false]);
    expect(server.slid).toHaveLength(1);
    expect(a.line.told).toHaveLength(1);
    // A press within that minute: kept for its end, where it slides, told
    // once answered.
    await clock.pass(10_000);
    a.page.press();
    await clock.pass(0);
    expect(a.keep).toHaveBeenCalledTimes(2);
    expect(a.line.told).toHaveLength(1);
    await clock.pass(MINUTE);
    expect(a.slides()).toEqual([true, false, true]);
    expect(server.slid).toHaveLength(2);
    expect(a.line.told).toEqual([{ kind: "active" }, { kind: "active" }]);
    // A press whose check the server answers closed: nothing told.
    server.stepUp = null;
    await clock.pass(MINUTE);
    a.page.key();
    await clock.pass(TRIP_MS);
    closedAlone(a, server, "closed");
    expect(a.line.told).toHaveLength(2);
  });

  it("6. hides the file while it asks on coming back, a press asking nothing more, and with no answer in 10 seconds closes it in this tab only", async () => {
    const { clock, server, tab } = setup();
    let silent = false;
    const keepOpen = server.keepOpenFor("b1");
    const a = tab({
      keepOpen: (slide) =>
        silent ? new Promise<KeepOpenAnswer>(() => {}) : keepOpen(slide),
    });
    a.watch();
    await clock.pass(TRIP_MS);
    a.page.set("hidden");
    expect(a.held()).toBe(true);
    silent = true;
    // Back within the minute that holds a press's check back: asked at once.
    await clock.pass(FILE_TOUCH_EVERY_MS / 4);
    a.page.set("visible");
    expect(a.held()).toBe(true);
    expect(a.keep).toHaveBeenCalledTimes(2);
    a.page.press();
    a.page.key();
    await clock.pass(KEEP_OPEN_WAIT_MS - 1);
    expect(a.keep).toHaveBeenCalledTimes(2);
    expect(a.close).not.toHaveBeenCalled();
    await clock.pass(1);
    closedAlone(a, server, "failed");
    expect(a.held()).toBe(true);
  });
});

describe("watchOpenFile, the final check's cases", () => {
  // A tab loaded before a deploy calls an action the new build no longer
  // has, so each check it makes fails; or its answer is lost.
  it("an idle tab's failed check never locks the tab in use", async () => {
    for (const fails of [
      () => Promise.reject(new Error("UnrecognizedActionError")),
      () => new Promise<KeepOpenAnswer>(() => {}),
    ]) {
      const { clock, server, tab } = setup();
      let stale = false;
      const keepOpen = server.keepOpenFor("b1");
      const idle = tab({
        keepOpen: (slide) => (stale ? fails() : keepOpen(slide)),
      });
      idle.watch();
      await clock.pass(TRIP_MS);
      stale = true;
      // The person enters a code in a fresh tab and works there.
      server.open("b1");
      const used = tab();
      used.watch();
      await clock.pass(TRIP_MS);
      // The word reaches the idle tab, whose check fails at its minute's end.
      await clock.pass(MINUTE + KEEP_OPEN_WAIT_MS);
      closedAlone(idle, server, "failed");
      expect(used.close).not.toHaveBeenCalled();
      // A press a minute for 20 minutes: open all along.
      for (let minute = 0; minute < 20; minute += 1) {
        await clock.pass(MINUTE);
        used.page.press();
      }
      await clock.pass(TRIP_MS);
      expect(used.close).not.toHaveBeenCalled();
      expect(used.held()).toBe(false);
      expect(server.stepUp).not.toBeNull();
    }
  });

  it("a replaced step-up is never extended by heard activity", async () => {
    const { clock, server, tab } = setup();
    const one = tab({ whose: "b1" });
    one.watch();
    await clock.pass(TRIP_MS);
    // Within the minute of its check, another window switches business and
    // opens a file there with a code: the device's one step-up is b2's now.
    await clock.pass(30_000);
    server.open("b2");
    const two = tab({ whose: "b2" });
    two.watch();
    await clock.pass(TRIP_MS);
    expect(two.line.told).toEqual([{ kind: "active" }]);
    expect(one.close).not.toHaveBeenCalled();
    // The word asks the server at the minute's end, which says closed: b1's
    // file closes then, never kept 15 minutes on b2's word.
    await clock.pass(MINUTE);
    closedAlone(one, server, "closed");
    expect(one.keep).toHaveBeenCalledTimes(2);
    expect(two.close).not.toHaveBeenCalled();
    expect(server.stepUp?.whose).toBe("b2");
  });

  it("a tab resumed after suspension never locks the device", async () => {
    for (const order of ["timer", "shown", "words"] as const) {
      const { clock, server, tab } = setup();
      const away = tab();
      const used = tab();
      away.watch();
      used.watch();
      await clock.pass(TRIP_MS);
      // The phone puts the first tab away and freezes it: its timers and
      // the words told to it wait.
      away.page.set("hidden");
      away.win.asleep = true;
      // The person works on files in the other tab for 20 minutes.
      for (let minute = 0; minute < 20; minute += 1) {
        await clock.pass(MINUTE);
        used.page.press();
      }
      await clock.pass(TRIP_MS);
      // Back to it: its overdue timer, its coming back and the words, with
      // each of them first.
      away.win.asleep = false;
      if (order === "timer") {
        await clock.pass(0);
        away.page.set("visible");
        away.line.wake();
      } else if (order === "shown") {
        away.page.set("visible");
        await clock.pass(0);
        away.line.wake();
      } else {
        away.line.wake();
        away.page.set("visible");
        await clock.pass(0);
      }
      expect(away.held(), order).toBe(true);
      await clock.pass(TRIP_MS);
      expect(away.close, order).not.toHaveBeenCalled();
      expect(away.held(), order).toBe(false);
      expect(away.toldClosed(), order).toBe(false);
      expect(used.close, order).not.toHaveBeenCalled();
      expect(server.lock, order).not.toHaveBeenCalled();
      expect(server.stepUp, order).not.toBeNull();
    }
  });
});

describe("watchOpenFile, a press kept for the minute's end", () => {
  it("slides nothing when its check runs long after, in a tab frozen in the background", async () => {
    const { clock, server, tab } = setup();
    const used = tab();
    const away = tab();
    used.watch();
    away.watch();
    await clock.pass(TRIP_MS);
    // A press in the second tab inside its minute, kept for the minute's end;
    // then it is put away and frozen before that end comes.
    await clock.pass(2_000);
    away.page.press();
    await clock.pass(0);
    away.page.set("hidden");
    away.win.asleep = true;
    // The person works in the first tab for ten minutes, then leaves.
    for (let minute = 0; minute < 10; minute += 1) {
      await clock.pass(MINUTE);
      used.page.press();
    }
    // Its own last press, kept for its minute's end, slides once more.
    await clock.pass(2 * MINUTE);
    const lastSlide = server.slid.at(-1) ?? 0;
    // Fourteen minutes after that last press, the frozen tab's timers run,
    // still hidden, with the step-up still fresh: the stale press only reads,
    // so nothing slides after the person left.
    await clock.pass(12 * MINUTE);
    expect(server.stepUp).not.toBeNull();
    away.win.asleep = false;
    await clock.pass(0);
    away.line.wake();
    await clock.pass(TRIP_MS);
    expect(server.slid.at(-1)).toBe(lastSlide);
    expect(away.slides().at(-1)).toBe(false);
  });

  it("slides as it should when its check runs at the minute's end", async () => {
    const { clock, server, tab } = setup();
    const a = tab();
    a.watch();
    await clock.pass(TRIP_MS);
    await clock.pass(10_000);
    a.page.press();
    await clock.pass(MINUTE);
    expect(a.slides()).toEqual([true, true]);
    expect(server.slid).toHaveLength(2);
  });
});

describe("watchOpenFile, tabs left alone", () => {
  // Each tab's own 15 minutes ask the server, and so does each word heard:
  // if those checks slid the step-up, two idle tabs whose checks come under
  // 15 minutes apart would keep the files open for good, with nobody there.
  it("two idle tabs never keep each other open: both close within 16 minutes of the last press, the step-up over 15 minutes old", async () => {
    for (const heard of [true, false]) {
      const { clock, server, tab } = setup();
      const a = tab();
      const b = tab({ apart: !heard });
      a.watch();
      b.watch();
      await clock.pass(2 * MINUTE);
      a.page.press();
      await clock.pass(30_000);
      b.page.press();
      const last = clock.now();
      // Nobody at the device since.
      await clock.pass(40 * MINUTE);
      for (const t of [a, b]) {
        closedAlone(t, server, "closed");
        const closedAt = t.closedAt() ?? Number.POSITIVE_INFINITY;
        expect(closedAt, `heard: ${heard}`).toBeLessThanOrEqual(
          last + 16 * MINUTE,
        );
        // Asked a trip before: the step-up was over 15 minutes old then.
        expect(
          closedAt - TRIP_MS - (server.stepUp?.at ?? closedAt),
          `heard: ${heard}`,
        ).toBeGreaterThan(FILE_IDLE_MS);
        // Their last checks, for their own 15 minutes, only read it.
        expect(t.slides().at(-1), `heard: ${heard}`).toBe(false);
      }
      // Slid for the last press (at its minute's end at most), never after.
      expect(server.stepUp?.at).toBeLessThanOrEqual(last + FILE_TOUCH_EVERY_MS);
      expect(server.slid.at(-1)).toBe(server.stepUp?.at);
    }
  });

  it("a check for the clock or for another tab's word never slides the step-up, and shows the file only for what the server has left", async () => {
    const { clock, server, tab, bare } = setup();
    const a = tab();
    const other = bare();
    const start = clock.now();
    a.watch();
    await clock.pass(TRIP_MS);
    // A word at 5 minutes, with no slide of its own: read, 10 minutes left,
    // so its 15 minutes still end with the step-up's first.
    await clock.pass(5 * MINUTE);
    other.tell({ kind: "active" });
    await clock.pass(TRIP_MS);
    // Another tab in use at 10 minutes, whose word never came here.
    await clock.to(start + 10 * MINUTE);
    void server.keepOpenFor("b1")(true);
    const used = clock.now();
    await clock.to(start + FILE_IDLE_MS + TRIP_MS - 1);
    expect(a.keep).toHaveBeenCalledTimes(2);
    expect(a.held()).toBe(false);
    // Its 15 minutes: read again, 10 minutes left, shown again for those.
    await clock.pass(1);
    expect(a.held()).toBe(true);
    expect(a.keep).toHaveBeenCalledTimes(3);
    await clock.pass(TRIP_MS);
    expect(a.held()).toBe(false);
    // Put away, its next 15 minutes end with the other tab's: read once
    // more, closed.
    a.page.set("hidden");
    await clock.to(used + FILE_IDLE_MS + TRIP_MS - 1);
    expect(a.keep).toHaveBeenCalledTimes(3);
    await clock.pass(1);
    expect(a.keep).toHaveBeenCalledTimes(4);
    await clock.pass(TRIP_MS);
    closedAlone(a, server, "closed");
    // Only its opening and the other tab's use slid it.
    expect(a.slides()).toEqual([true, false, false, false]);
    expect(server.slid).toEqual([start, used]);
    expect(a.line.told).toEqual([{ kind: "active" }]);
  });

  it("a lone tab still closes 15 minutes after its last press", async () => {
    const { clock, server, tab } = setup();
    const a = tab();
    a.watch();
    await clock.pass(3 * MINUTE);
    a.page.press();
    const last = clock.now();
    await clock.to(last + FILE_IDLE_MS + TRIP_MS - 1);
    expect(a.held()).toBe(false);
    await clock.pass(1);
    expect(a.held()).toBe(true);
    await clock.pass(TRIP_MS);
    closedAlone(a, server, "closed");
    expect(a.closedAt()).toBe(last + FILE_IDLE_MS + 2 * TRIP_MS);
    expect(server.slid.at(-1)).toBe(last);
  });

  it("the tab in use keeps itself open, and the idle tab beside it, for as long as it is used", async () => {
    const { clock, server, tab } = setup();
    const used = tab();
    const idle = tab();
    used.watch();
    idle.watch();
    // A press a minute for 30 minutes.
    for (let minute = 0; minute < 30; minute += 1) {
      await clock.pass(MINUTE);
      used.page.press();
    }
    const last = clock.now();
    await clock.pass(TRIP_MS);
    for (const t of [used, idle]) {
      expect(t.close).not.toHaveBeenCalled();
      expect(t.held()).toBe(false);
    }
    expect(server.slid.length).toBeGreaterThan(30);
    // The idle tab slid it only as it opened; after, it only read.
    expect(idle.slides()[0]).toBe(true);
    expect(idle.slides().slice(1)).not.toContain(true);
    expect(idle.slides().length).toBeGreaterThan(25);
    // Nobody after the last press: both close, the press's minute and 15
    // minutes after it at most.
    await clock.pass(20 * MINUTE);
    for (const t of [used, idle]) {
      closedAlone(t, server, "closed");
      expect(t.closedAt()).toBeLessThanOrEqual(
        last + FILE_TOUCH_EVERY_MS + FILE_IDLE_MS + 2 * TRIP_MS,
      );
    }
  });
});

describe("watchOpenFile, the screen", () => {
  // Next hides a screen it leaves (its effects stopped) and shows it again
  // on Back (started again), and its own clock heard nothing meanwhile.
  it("holds a screen Next shows again, before it is painted, until the server answers, whatever its own clock says", async () => {
    const { clock, server, tab } = setup();
    const t = tab();
    const stop = t.watch();
    await clock.pass(TRIP_MS);
    stop();
    // 20 minutes on another screen, which slid the server's 15 minutes.
    for (let minute = 0; minute < 20; minute += 1) {
      await clock.pass(MINUTE);
      void server.keepOpenFor("b1")(true);
    }
    t.watch();
    expect(t.held()).toBe(true);
    // Shown again is the person's doing: it slides.
    expect(t.slides()).toEqual([true, true]);
    await clock.pass(TRIP_MS);
    expect(t.held()).toBe(false);
    expect(t.close).not.toHaveBeenCalled();
    expect(t.line.told).toEqual([{ kind: "active" }, { kind: "active" }]);
  });

  it("counts no more than 15 minutes from any answer, and closes the file on a time left that isn't one", async () => {
    const { clock, server, tab } = setup();
    const answers: KeepOpenAnswer[] = [{ open: true, leftMs: 120 * MINUTE }];
    const t = tab({
      keepOpen: async () =>
        answers.shift() ?? { open: true, leftMs: Number.NaN },
    });
    const start = clock.now();
    t.watch();
    await clock.to(start + FILE_IDLE_MS - 1);
    expect(t.keep).toHaveBeenCalledTimes(1);
    await clock.pass(1);
    expect(t.keep).toHaveBeenCalledTimes(2);
    await clock.pass(0);
    closedAlone(t, server, "failed");
  });

  it("shows the file only on the answer to the latest look", async () => {
    const { clock, tab } = setup();
    const answers: ((answer: KeepOpenAnswer) => void)[] = [];
    const t = tab({
      keepOpen: () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    });
    t.watch();
    answers[0]?.(OPEN);
    await clock.pass(0);
    t.page.set("hidden");
    t.page.set("visible");
    t.page.set("hidden");
    // The first look answers while the page is away again: still hidden.
    answers[1]?.(OPEN);
    await clock.pass(0);
    expect(t.held()).toBe(true);
    t.page.set("visible");
    answers[2]?.(OPEN);
    await clock.pass(0);
    expect(t.held()).toBe(false);
  });

  it("holds a file that opens on a page put away, asking nothing until the page comes back", async () => {
    const { clock, tab } = setup();
    const t = tab();
    t.page.visibilityState = "hidden";
    t.watch();
    expect(t.keep).not.toHaveBeenCalled();
    expect(t.held()).toBe(true);
    t.page.set("visible");
    expect(t.keep).toHaveBeenCalledTimes(1);
    await clock.pass(TRIP_MS);
    expect(t.held()).toBe(false);
  });

  it("leaves an answer that comes after the stop, and asks again when shown", async () => {
    const { clock, tab } = setup();
    const answers: ((answer: KeepOpenAnswer) => void)[] = [];
    const t = tab({
      keepOpen: () =>
        new Promise((resolve) => {
          answers.push(resolve);
        }),
    });
    const stop = t.watch();
    stop();
    answers[0]?.({ open: false });
    await clock.pass(0);
    expect(t.close).not.toHaveBeenCalled();
    t.watch();
    expect(t.keep).toHaveBeenCalledTimes(2);
    answers[1]?.({ open: false });
    await clock.pass(0);
    expect(t.close).toHaveBeenCalledExactlyOnceWith("closed");
  });

  it("listens no more once stopped", async () => {
    const { clock, tab, bare } = setup();
    const t = tab();
    const stop = t.watch();
    expect(t.page.listening).toBe(3);
    expect(t.line.hearing).toBe(true);
    stop();
    expect(t.page.listening).toBe(0);
    expect(t.line.hearing).toBe(false);
    expect(t.win.pending()).toBe(0);
    await clock.pass(FILE_IDLE_MS);
    t.page.press();
    bare().tell({ kind: "closed" });
    await clock.pass(0);
    expect(t.close).not.toHaveBeenCalled();
  });
});

describe("closeAndDraw", () => {
  const parts = (lock: () => Promise<LockAnswer>) => ({
    tell: vi.fn(),
    lock: vi.fn(lock),
    draw: vi.fn(),
  });

  it("for 'נעילת התיק', tells every other tab at once, forgets the step-up, then draws the page again", async () => {
    let unlock: () => void = () => {};
    const { tell, lock, draw } = parts(
      () =>
        new Promise<LockAnswer>((resolve) => {
          unlock = () => resolve({ ok: true });
        }),
    );
    const done = closeAndDraw("pressed", { tell, lock, draw });
    // Before the server answers.
    expect(tell).toHaveBeenCalledTimes(1);
    await settle();
    expect(lock).toHaveBeenCalledTimes(1);
    expect(draw).not.toHaveBeenCalled();
    unlock();
    await done;
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it("for any other close, tells and forgets nothing, and draws the page again", async () => {
    for (const why of ["closed", "failed", "elsewhere"] as const) {
      const { tell, lock, draw } = parts(async () => ({ ok: true }));
      await closeAndDraw(why, { tell, lock, draw });
      expect(tell, why).not.toHaveBeenCalled();
      expect(lock, why).not.toHaveBeenCalled();
      expect(draw, why).toHaveBeenCalledTimes(1);
    }
  });

  it("draws the page again even when the telling or the lock fails", async () => {
    const draw = vi.fn();
    await closeAndDraw("pressed", {
      tell: () => {
        throw new Error("closed channel");
      },
      lock: () => Promise.reject(new Error("offline")),
      draw,
    });
    expect(draw).toHaveBeenCalledTimes(1);
    const thrown = vi.fn();
    await closeAndDraw("pressed", {
      tell: () => {},
      lock: () => {
        throw new Error("500");
      },
      draw: thrown,
    });
    expect(thrown).toHaveBeenCalledTimes(1);
  });
});
