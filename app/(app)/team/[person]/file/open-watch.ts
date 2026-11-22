import {
  FILE_TOUCH_EVERY_MS,
  idleLocksAt,
  touchDue,
} from "@domain/file-holders";
import type { FileTabNews, FileTabs } from "./file-tabs";
import type { KeepOpenAnswer, LockAnswer } from "./holder-file-types";

/*
 * How long an open hiring file shows in a tab (profile H6a, plan §3.5),
 * apart from React so it runs against a clock of its own in the tests.
 *
 * 1. Only the server says whether the files are open on this device: its
 *    step-up cookie, which a tab's check (`keepOpen`) slides, and which goes
 *    by itself 15 minutes after the last check from any tab.
 * 2. Only a deliberate act closes them on the whole device: "נעילת התיק"
 *    (`closeAndDraw`, `pressed`) or signing out (`closeFilesOnDevice`). Each
 *    tells every tab, which closes its file at once, and forgets the step-up.
 * 3. Anything else closes the file in this tab only, telling no other tab
 *    and forgetting nothing: the server answering closed, a check that fails
 *    or isn't answered within `KEEP_OPEN_WAIT_MS`, another tab's lock heard.
 *    This tab's own 15 minutes passing, a page coming back and a screen Next
 *    shows again close nothing by themselves: the server is asked once, the
 *    file hidden meanwhile, and its answer decides.
 * 4. A tab's 15 minutes start again only when its own check answers open,
 *    counted from that answer, which comes after the server's own moment: so
 *    when they pass, the server finds the step-up gone unless another tab
 *    slid it since. A press or a key here, and another tab's word that a file
 *    is in use there, ask the server at most once a minute, one within the
 *    minute kept for its end, never dropped. The word itself extends nothing.
 * 5. A tab says a file is in use only after its own check, for the person's
 *    activity here, answered open. A check for another tab's word or for the
 *    clock says nothing, so no two tabs keep each other open.
 * 6. While the file is hidden for an answer, a line says the server is being
 *    asked (`FileOpenWatch`), and no answer within 10 seconds closes the file
 *    in this tab.
 */

/**
 * How long the server's answer is waited for: past it, nobody knows the
 * file is still open, and it closes in this tab (`failed`), never left
 * hidden with nothing said.
 */
export const KEEP_OPEN_WAIT_MS = 10_000;

/** Why the file closed in this tab, and in this tab only. */
export type WatchClose =
  /** The server said it is closed: its 15 minutes passed, it was locked, or the step-up is another's now. */
  | "closed"
  /** The server couldn't say it is still open: offline, the action failed, or no answer came. */
  | "failed"
  /** Another tab locked the files ("נעילת התיק", or signing out), and said so. */
  | "elsewhere";

/** Why a file closes in a tab: the watch's reasons, or "נעילת התיק" pressed there. */
export type FileClose = WatchClose | "pressed";

/**
 * What an open file's screen keeps while Next hides it and shows it again:
 * whether it showed the file before. Shown again, the file is held until the
 * server answers.
 */
export type OpenFileMemory = { shown: boolean };

/** The page an open file is on: whether it shows, and its presses and keys. */
export type WatchedPage = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/** The window, for the timers of the 15 minutes and of the answers. */
export type WatchedWindow = Pick<Window, "setTimeout" | "clearTimeout">;

export type OpenFileWatch = {
  memory: OpenFileMemory;
  /** Asks the server whether the file is still open here, sliding its 15 minutes if so. */
  keepOpen: () => Promise<KeepOpenAnswer>;
  /** Called once, as the file closes in this tab; the watch has stopped. */
  close: (why: WatchClose) => void;
  /**
   * Hides the file (true) while the page is put away or the server is asked
   * on coming back; shows it (false) when the server answers open.
   */
  hold: (held: boolean) => void;
  page: WatchedPage;
  win: WatchedWindow;
  /** The device's other tabs. */
  tabs: FileTabs;
  now?: () => number;
};

/**
 * Watch an open file while its screen shows, by the rule above, and return
 * the stop for when it hides or goes. An answer that comes after the stop is
 * left for the next start, which asks again.
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
  // When this tab's 15 minutes pass, unless a check answers open first.
  let shownUntil = idleLocksAt(now());
  let timer: number | undefined;
  // The answers still waited for, each by the timer that gives up on it.
  const waits = new Set<number>();
  let lastCheck: number | null = null;
  // The one check kept for the minute's end, and whether it is for activity
  // here, which the other tabs hear of once it answers open.
  let later: number | undefined;
  let laterTells = false;
  // The latest hold: only its own answer shows the file again, and putting
  // the page away makes any other stale.
  let look = 0;
  let held = false;

  function stop() {
    stopped = true;
    win.clearTimeout(timer);
    win.clearTimeout(later);
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
    timer = win.setTimeout(lapse, Math.max(0, shownUntil - now()));
  }

  function holdFile(next: boolean) {
    held = next;
    hold(next);
  }

  /**
   * The server asked. Open: this tab's 15 minutes start again from the
   * answer, the other tabs told if it was for activity here (`tell`, or a
   * press kept for the minute's end), then `open`. Closed, failed, or no
   * answer within `KEEP_OPEN_WAIT_MS`: the file closes in this tab.
   */
  function check(tell: boolean, open?: () => void) {
    const tells = tell || laterTells;
    win.clearTimeout(later);
    later = undefined;
    laterTells = false;
    lastCheck = now();
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
        if (!kept?.open) {
          finish("closed");
          return;
        }
        if (stopped) return;
        shownUntil = idleLocksAt(now());
        arm();
        if (tells) tabs.tell({ kind: "active" });
        open?.();
      },
      () => {
        answered();
        finish("failed");
      },
    );
  }

  /** Activity, here (`tell`) or in another tab: the server asked now, or at the minute's end. */
  function due(tell: boolean) {
    const at = now();
    if (touchDue(lastCheck, at)) {
      check(tell);
      return;
    }
    laterTells ||= tell;
    if (later !== undefined) return;
    later = win.setTimeout(
      () => check(false),
      (lastCheck ?? at) + FILE_TOUCH_EVERY_MS - at,
    );
  }

  /** Put away: the file hidden, and any answer already asked for stale. */
  function putAway() {
    look += 1;
    holdFile(true);
  }

  /** The file hidden until the server, asked now, answers open. */
  function lookAgain(tell: boolean) {
    look += 1;
    const mine = look;
    win.clearTimeout(timer);
    holdFile(true);
    check(tell, () => {
      if (mine === look) holdFile(false);
    });
  }

  /** This tab's 15 minutes passed: the server asked once before anything closes. */
  function lapse() {
    if (page.visibilityState === "visible") lookAgain(false);
    else check(false);
  }

  function active() {
    // Held, the answer it waits for decides.
    if (held) return;
    // Past its 15 minutes, its timer held back while the device slept.
    if (now() >= shownUntil) lookAgain(true);
    else due(true);
  }

  function shown() {
    if (page.visibilityState === "visible") lookAgain(true);
    else putAway();
  }

  function heard(news: FileTabNews) {
    if (news.kind === "closed") finish("elsewhere");
    else due(false);
  }

  // Shown again by Next, the screen heard nothing while it was hidden: the
  // file is held, before it is painted, until the server answers open.
  const again = memory.shown;
  memory.shown = true;
  listening = true;
  page.addEventListener("pointerdown", active);
  page.addEventListener("keydown", active);
  page.addEventListener("visibilitychange", shown);
  unhear = tabs.hear(heard);
  arm();
  if (page.visibilityState !== "visible") putAway();
  else if (again) lookAgain(true);
  else check(true);
  return stop;
}

/**
 * After a file closed in this tab, which already shows it locked. Only
 * "נעילת התיק" (`pressed`) closes the files on the whole device: the other
 * tabs are told at once (`tell`), before the server answers, and the step-up
 * is forgotten (`lock`). Any other close was this tab's alone, and tells and
 * forgets nothing. Then the screen is drawn again from the server (`draw`),
 * even when telling or the lock failed.
 */
export async function closeAndDraw(
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
  if (why === "pressed") {
    try {
      tell();
    } catch {
      // No other tab could be told: each closes when the server says so.
    }
    try {
      await lock();
    } catch {
      // Offline, or the action failed: this tab stays locked all the same.
    }
  }
  draw();
}
