import { idleLocksAt, touchDue } from "@domain/file-holders";
import type { FileTabNews, FileTabs } from "./file-tabs";
import type { KeepOpenAnswer, LockAnswer } from "./holder-file-types";

/*
 * The idle lock of an open hiring file (profile H6a, plan §3.5), apart from
 * React so it runs against a clock of its own in the tests. It fails
 * closed: a file stops showing when its 15 minutes pass with no activity,
 * when the server says it is closed, when another tab of the device locked
 * the files, and also when the server can't be asked (offline, the action
 * failed, or no answer within `KEEP_OPEN_WAIT_MS`), since then nobody knows
 * it is still open. A page put away hides the file at once, and on coming
 * back the server is asked straight away, the file hidden until it says the
 * file is still open: locked in another tab, or signed out there, it never
 * shows again. Next keeps a screen it leaves (hidden in an <Activity>, its
 * state kept, its effects stopped) and shows it again on Back. Stopped, it
 * heard nothing of the device's other screens and tabs, so its own clock
 * decides nothing then: it is hidden before it is drawn until the server,
 * whose 15 minutes every tab's and screen's activity slides, says it is
 * open, whatever time its own last activity was. The files open on the
 * device, so its tabs keep one 15 minutes: each time one slides the
 * server's, the others are told, and their 15 minutes start again, each
 * asking the server in turn at most once a minute (`FileTabs`), so a tab
 * whose step-up is gone (signed out, another person's or business's now)
 * closes rather than staying up on another's activity.
 */

/**
 * How long the server's answer is waited for: past it, nobody knows the
 * file is still open, and it closes (`failed`), never left hidden with
 * nothing said.
 */
export const KEEP_OPEN_WAIT_MS = 10_000;

/** Why the watch closes an open file here. */
export type WatchClose =
  /** 15 minutes passed with no activity on any of the device's open files. */
  | "idle"
  /** The server couldn't say it is still open: offline, the action failed, or no answer came. */
  | "failed"
  /** The server said it is closed: its step-up gone, or another business's now. */
  | "closed"
  /** Another tab of the device locked the files, and said so. */
  | "elsewhere";

/** Why a file closes here: the watch's reasons, or "נעילת התיק" pressed. */
export type FileClose = WatchClose | "pressed";

/**
 * What an open file's screen keeps while Next hides it and shows it again:
 * the moment of its last activity, null until it first opens. Shown again,
 * that it is set says the screen was shown before, so the file is held
 * until the server answers; the moment itself decides nothing then.
 */
export type OpenFileMemory = { lastActivity: number | null };

/** The page an open file is on: whether it shows, and its presses and keys. */
export type WatchedPage = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/** The window, for the timer of the 15 minutes. */
export type WatchedWindow = Pick<Window, "setTimeout" | "clearTimeout">;

export type OpenFileWatch = {
  memory: OpenFileMemory;
  /** Asks the server whether the file is still open here, sliding its 15 minutes. */
  keepOpen: () => Promise<KeepOpenAnswer>;
  /** Called once, as the file closes here; the watch has stopped. */
  close: (why: WatchClose) => void;
  /**
   * Hides the file (true) while the page is put away and until the server,
   * asked as it comes back, says the file is still open; shows it (false)
   * then.
   */
  hold: (held: boolean) => void;
  page: WatchedPage;
  win: WatchedWindow;
  /** The device's other tabs. */
  tabs: FileTabs;
  now?: () => number;
};

/**
 * Watch an open file while its screen shows, and return the stop for when
 * it hides or goes. As it opens it asks the server to keep the file open
 * (`keepOpen`, which also slides the server's 15 minutes), and again on a
 * press or a key at most once a minute, telling the device's other tabs
 * each time; a press or a key also starts the 15 minutes again, and so does
 * another tab's activity, which asks the server too, at most once a minute,
 * telling nobody back. Put away, the file is held (hidden); back, or shown
 * again by Next, it is held until the server, asked at once, says it is
 * open, and its 15 minutes start then, as the server's did, the other tabs
 * told. It calls `close` once, and stops: the 15 minutes passed (by the
 * timer, on a press or key after them, or on coming back to the page after
 * them, a clock that heard the other tabs throughout), the server answered
 * closed, its answer failed or didn't come within `KEEP_OPEN_WAIT_MS`, or
 * another tab locked the files. A screen shown again is never closed by its
 * own clock, which heard nothing while it was hidden: the server decides.
 * An answer that comes after the stop is left for the next start, which
 * asks again.
 */
export function watchOpenFile({
  memory,
  keepOpen,
  close,
  hold,
  page,
  win,
  tabs,
  now = Date.now,
}: OpenFileWatch): () => void {
  let stopped = false;
  let listening = false;
  let unhear: (() => void) | null = null;
  let timer: number | undefined;
  // The answers still waited for, each by the timer that gives up on it.
  const waits = new Set<number>();
  let lastTouch: number | null = null;
  // The latest look at the server on coming back: only its answer shows
  // the file again, and putting the page away makes any other stale.
  let look = 0;

  function lastActivity(): number {
    return memory.lastActivity ?? now();
  }

  function stop() {
    stopped = true;
    win.clearTimeout(timer);
    for (const wait of waits) win.clearTimeout(wait);
    waits.clear();
    unhear?.();
    unhear = null;
    if (!listening) return;
    listening = false;
    page.removeEventListener("pointerdown", active);
    page.removeEventListener("keydown", active);
    page.removeEventListener("visibilitychange", shown);
  }

  function finish(why: WatchClose) {
    if (stopped) return;
    stop();
    close(why);
  }

  function arm() {
    win.clearTimeout(timer);
    timer = win.setTimeout(
      () => finish("idle"),
      Math.max(0, idleLocksAt(lastActivity()) - now()),
    );
  }

  /**
   * The server asked whether the file is still open here; `open` if so. An
   * answer that doesn't come within `KEEP_OPEN_WAIT_MS` closes the file as
   * one that failed would, so a file held for it never stays hidden.
   */
  function ask(open?: () => void) {
    let answer: Promise<KeepOpenAnswer>;
    try {
      answer = keepOpen();
    } catch (error) {
      answer = Promise.reject(error);
    }
    const wait = win.setTimeout(() => {
      waits.delete(wait);
      finish("failed");
    }, KEEP_OPEN_WAIT_MS);
    waits.add(wait);
    const answered = () => {
      win.clearTimeout(wait);
      waits.delete(wait);
    };
    answer.then(
      (kept) => {
        answered();
        if (!kept?.open) finish("closed");
        else if (!stopped) open?.();
      },
      () => {
        answered();
        finish("failed");
      },
    );
  }

  /** Activity here: the server and the other tabs told, at most once a minute. */
  function touch(at: number) {
    if (!touchDue(lastTouch, at)) return;
    lastTouch = at;
    tabs.tell({ kind: "active", at });
    ask();
  }

  /** Put away: the file hidden, and any look already asked for stale. */
  function putAway() {
    look += 1;
    hold(true);
  }

  /**
   * Back, or shown again: the file hidden until the server, asked now, says
   * it is open. Its 15 minutes then start from the answer, as the server's
   * did when it was asked, and the device's other tabs are told, as they
   * are of every slide.
   */
  function lookAgain() {
    look += 1;
    const mine = look;
    hold(true);
    lastTouch = now();
    ask(() => {
      if (mine !== look) return;
      const at = now();
      memory.lastActivity = at;
      arm();
      tabs.tell({ kind: "active", at });
      hold(false);
    });
  }

  function active() {
    const at = now();
    // Back after the 15 minutes: closed before anything else happens.
    if (at >= idleLocksAt(lastActivity())) {
      finish("idle");
      return;
    }
    memory.lastActivity = at;
    arm();
    touch(at);
  }

  function shown() {
    if (page.visibilityState !== "visible") {
      putAway();
      return;
    }
    if (now() >= idleLocksAt(lastActivity())) {
      finish("idle");
      return;
    }
    lookAgain();
  }

  function heard(news: FileTabNews) {
    if (news.kind === "closed") {
      finish("elsewhere");
      return;
    }
    // Another tab's activity, never later than now: the device's 15
    // minutes start again here too, as long as the server, asked at most
    // once a minute, says this file is still open. Its step-up may be gone
    // while the other tab's is good (signed out here, or another person's
    // or business's there): then it closes as the server said, telling
    // nobody. Not told back: the tab that was active told the others.
    const at = Math.min(news.at, now());
    if (at <= lastActivity()) return;
    memory.lastActivity = at;
    arm();
    if (!touchDue(lastTouch, at)) return;
    lastTouch = at;
    ask();
  }

  // Opened now, or shown again by Next: either way the 15 minutes start
  // now. Shown again, the screen heard nothing of the device's other tabs
  // and screens while it was hidden, so its own last activity says nothing
  // of the device's: the file is held, before it is painted, until the
  // server, which heard them all, says it is open (`lookAgain`).
  const again = memory.lastActivity !== null;
  memory.lastActivity = now();
  listening = true;
  page.addEventListener("pointerdown", active);
  page.addEventListener("keydown", active);
  page.addEventListener("visibilitychange", shown);
  unhear = tabs.hear(heard);
  arm();
  if (page.visibilityState !== "visible") putAway();
  else if (again) lookAgain();
  else touch(now());
  return stop;
}

/**
 * After a file closed here, which it already shows locked: unless another
 * tab said so already, or the server did, the device's other tabs are told
 * at once (`tell`), before the server answers; the files are locked on the
 * device (`lock`, which forgets the step-up) unless the server said they
 * were closed already; then the screen is drawn again from the server
 * (`draw`). A lock that fails still draws; the screen stays locked.
 */
export async function lockAndDraw(
  why: FileClose,
  {
    tell,
    lock,
    draw,
  }: {
    tell: () => void;
    lock: () => Promise<LockAnswer>;
    draw: () => void;
  },
): Promise<void> {
  // A close the server answered may be another business's step-up now, so
  // it closes nothing elsewhere; one heard from another tab was told there.
  if (why !== "closed" && why !== "elsewhere") {
    try {
      tell();
    } catch {
      // No other tab could be told: theirs ask the server on their own.
    }
  }
  if (why !== "closed") {
    try {
      await lock();
    } catch {
      // Offline, or the action failed: the screen stays locked all the same.
    }
  }
  draw();
}
