import { idleLocksAt, touchDue } from "@domain/file-holders";
import type { FileTabNews, FileTabs } from "./file-tabs";
import type { KeepOpenAnswer, LockAnswer } from "./holder-file-types";

/*
 * The idle lock of an open hiring file (profile H6a, plan §3.5), apart from
 * React so it runs against a clock of its own in the tests. It fails
 * closed: a file stops showing when its 15 minutes pass with no activity,
 * when the server says it is closed, when another tab of the device locked
 * the files, and also when the server can't be asked (offline, or the
 * action failed), since then nobody knows it is still open. A page put away
 * hides the file at once, and on coming back the server is asked straight
 * away, the file hidden until it says the file is still open: locked in
 * another tab, or signed out there, it never shows again. Next keeps a
 * screen it leaves (hidden in an <Activity>, its state kept, its effects
 * stopped) and shows it again on Back: the moment of the last activity
 * lives in the screen's memory, so coming back never starts the 15 minutes
 * again, a file whose 15 minutes passed while it was hidden closes before
 * it is drawn, and one within them is hidden until the server answers, as
 * on coming back to the page. The files open on the device, so its tabs
 * keep one 15 minutes: activity in one starts them again in all
 * (`FileTabs`).
 */

/** Why the watch closes an open file here. */
export type WatchClose =
  /** 15 minutes passed with no activity on any of the device's open files. */
  | "idle"
  /** The server couldn't say it is still open: offline, or the action failed. */
  | "failed"
  /** The server said it is closed: its step-up gone, or another business's now. */
  | "closed"
  /** Another tab of the device locked the files, and said so. */
  | "elsewhere";

/** Why a file closes here: the watch's reasons, or "נעילת התיק" pressed. */
export type FileClose = WatchClose | "pressed";

/** What an open file's screen keeps while Next hides it and shows it again. */
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
 * another tab's activity. Put away, the file is held (hidden); back, or
 * shown again by Next, it is held until the server, asked at once, says it
 * is open. It calls `close` once, and stops: the 15 minutes passed (by the
 * timer, on a press or key after them, on coming back to the page after
 * them, or on being shown again after them, before anything else), the
 * server answered closed, its answer didn't come, or another tab locked the
 * files. An answer that comes after the stop is left for the next start,
 * which asks again.
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

  /** The server asked whether the file is still open here; `open` if so. */
  function ask(open?: () => void) {
    let answer: Promise<KeepOpenAnswer>;
    try {
      answer = keepOpen();
    } catch (error) {
      answer = Promise.reject(error);
    }
    answer.then(
      (kept) => {
        if (!kept?.open) finish("closed");
        else if (!stopped) open?.();
      },
      () => finish("failed"),
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

  /** Back: the file hidden until the server, asked now, says it is open. */
  function lookAgain() {
    look += 1;
    const mine = look;
    hold(true);
    lastTouch = now();
    ask(() => {
      if (mine === look) hold(false);
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
    // minutes start again here too.
    const at = Math.min(news.at, now());
    if (at <= lastActivity()) return;
    memory.lastActivity = at;
    arm();
  }

  // Opened now, or shown again: the 15 minutes run from the last activity.
  const again = memory.lastActivity !== null;
  const start = lastActivity();
  memory.lastActivity = start;
  if (now() >= idleLocksAt(start)) {
    finish("idle");
    return stop;
  }
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
