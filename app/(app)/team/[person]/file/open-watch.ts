import {
  FILE_IDLE_MS,
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
 *    step-up cookie, which only a check for the person's activity in a tab
 *    slides (`keepOpen(true)`, by point 5), and which goes by itself 15
 *    minutes after the last.
 * 2. Only a deliberate act closes them on the whole device: "נעילת התיק"
 *    (`closeAndDraw`, `pressed`) or signing out (`closeFilesOnDevice`). Each
 *    tells every tab, which closes its file at once, and forgets the step-up.
 * 3. Anything else closes the file in this tab only, telling no other tab
 *    and forgetting nothing: the server answering closed, a check that fails
 *    or isn't answered within `KEEP_OPEN_WAIT_MS` while the tab is awake,
 *    another tab's lock heard. This tab's own 15 minutes passing, a page
 *    coming back, a screen Next shows again and a check the tab slept
 *    through (`SLEPT_AFTER_MS`) close nothing by themselves: the server is
 *    asked once, the file hidden meanwhile, and its answer decides.
 * 4. A tab's 15 minutes end when the server's do: its own check, answered
 *    open, says how long the step-up has left (15 minutes once slid, never
 *    more), counted here from the answer, which comes after the server's own
 *    moment (an answer that comes after the tab slept counts for nothing, by
 *    point 3); so when they pass, the server finds the step-up gone unless
 *    activity in some tab slid it since. Activity here (a press, a key, the
 *    focus moved), and another tab's word that a file is in use there, ask
 *    the server at most once a minute, one within the minute kept for its
 *    end, never dropped. "להשאיר פתוח" asks at once, whatever the minute:
 *    the person asked, and less than the minute may be left. So does any
 *    activity here while the warning is up (point 7): the minute's end
 *    could come after the step-up's own. One gesture
 *    counts once: the focus a press or a key brings with it, and the click
 *    of "להשאיר פתוח" after its own press, within `SAME_GESTURE_MS` of the
 *    check that slid the step-up for it, ask nothing more. The word itself
 *    extends nothing.
 * 5. Only a check for the person's activity in this tab slides the step-up:
 *    the file opening, a press or a key, the focus moved from one element to
 *    another (by the keyboard, or by a desktop screen reader that moves the
 *    system focus; never a focus the screen puts back from nowhere, which
 *    nobody moved), "להשאיר פתוח", coming back to the page, a screen Next
 *    shows again. A phone's screen reader moves only its own cursor, no
 *    focus, so reading the file there is no activity: the warning a minute
 *    before, with "להשאיר פתוח" (point 7), is what keeps it open. Answered
 *    open, it tells the other tabs a file is in use. A check for this tab's
 *    own clock (its 15 minutes, or a check it slept through) or for another
 *    tab's word only reads the step-up, and tells nothing. So tabs left
 *    alone never keep each other open: the files close on the device 15
 *    minutes after the last activity in any tab, a minute more at most for
 *    a press kept for the minute's end. A kept press slides only while it is
 *    fresh (`PRESS_FRESH_MS`): run long after, in a tab frozen in the
 *    background, its check only reads.
 * 6. While the file is hidden for an answer, a line says the server is being
 *    asked (`FileOpenWatch`), and no answer within 10 seconds, the tab awake,
 *    closes the file in this tab.
 * 7. A minute before this tab's 15 minutes end (`WARN_BEFORE_MS`), the
 *    person is told the file is about to lock (`warn(true)`), with
 *    "להשאיר פתוח" (`stayOpen`), activity asked of the server at once, as
 *    any other activity here is while the warning is up. The
 *    warning ends (`warn(false)`) only when an answer moves the 15 minutes
 *    on, the file still open here; a file that closes, or a watch that
 *    stops, says nothing more. The warning keeps nothing open by itself:
 *    with nobody there, the file locks as it did.
 */

/**
 * How long the server's answer is waited for: past it, nobody knows the
 * file is still open, and it closes in this tab (`failed`), never left
 * hidden with nothing said. A wait the tab slept through says nothing of
 * the server, and asks it again instead (`SLEPT_AFTER_MS`).
 */
export const KEEP_OPEN_WAIT_MS = 10_000;

/**
 * How long after its check a give-up may run, or the answer come, and still
 * be a tab awake all along: the wait, and a few seconds for a busy page.
 * Later, the tab slept meanwhile (the phone locked, the device asleep, the
 * tab frozen in the background, its timers and its answers held back), so
 * neither says anything of the server now: the check decides nothing, and
 * the server is asked again with the page in sight, at once or as it comes
 * back.
 */
export const SLEPT_AFTER_MS = KEEP_OPEN_WAIT_MS + 5_000;

/**
 * How old a press kept for the minute's end may be when its check runs and
 * still slide the step-up: the minute, and a few seconds for a busy page.
 * Older, the tab was frozen and its timer ran late with nobody there, so the
 * check only reads.
 */
export const PRESS_FRESH_MS = FILE_TOUCH_EVERY_MS + 5_000;

/**
 * How soon after a check that slid the step-up for activity here more of it
 * is still the same gesture: the focus a press or a key brings with it (a
 * tap and a Tab move it too), and the click of "להשאיר פתוח" after its own
 * press or key. Counted once, by that check, never kept for the minute's
 * end as a second press would be: so a lone tap leaves the file its 15
 * minutes, not 16, at the cost of these two seconds at most. A check that
 * only read the step-up (the clock's, another tab's word) is no gesture, so
 * a press right after one counts.
 */
export const SAME_GESTURE_MS = 2_000;

/**
 * How long before this tab's 15 minutes end the person is told the file is
 * about to lock: time to hear it, and to say "להשאיר פתוח".
 */
export const WARN_BEFORE_MS = 60_000;

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

/** The page an open file is on: whether it shows, its presses and keys, and its focus. */
export type WatchedPage = Pick<
  Document,
  "visibilityState" | "addEventListener" | "removeEventListener"
>;

/** The window, for the timers of the 15 minutes and of the answers. */
export type WatchedWindow = Pick<Window, "setTimeout" | "clearTimeout">;

export type OpenFileWatch = {
  memory: OpenFileMemory;
  /**
   * Asks the server whether the file is still open here and how long it has
   * left, sliding its 15 minutes only when `slide`: for the person's
   * activity in this tab.
   */
  keepOpen: (slide: boolean) => Promise<KeepOpenAnswer>;
  /** Called once, as the file closes in this tab; the watch has stopped. */
  close: (why: WatchClose) => void;
  /**
   * Hides the file (true) while the page is put away or the server is asked
   * on coming back; shows it (false) when the server answers open.
   */
  hold: (held: boolean) => void;
  /**
   * The file is about to lock (true), a minute before this tab's 15 minutes
   * end; or it stays open after all (false), an answer having moved them on.
   */
  warn?: (soon: boolean) => void;
  page: WatchedPage;
  win: WatchedWindow;
  /** The device's other tabs. */
  tabs: FileTabs;
  now?: () => number;
};

/** A file being watched. */
export type FileWatch = {
  /** For when its screen hides or goes. */
  stop: () => void;
  /** "להשאיר פתוח": the person's activity here, asked of the server at once. */
  stayOpen: () => void;
};

/**
 * Watch an open file while its screen shows, by the rule above, with its
 * stop for when it hides or goes. An answer that comes after the stop is
 * left for the next start, which asks again.
 */
export function watchOpenFile({
  memory,
  keepOpen,
  close,
  hold,
  warn,
  page,
  win,
  tabs,
  now = Date.now,
}: OpenFileWatch): FileWatch {
  let stopped = false;
  let listening = false;
  let unhear: (() => void) | null = null;
  // When this tab's 15 minutes pass: the step-up's end, as the server's last
  // open answer said (until its first, 15 minutes from now).
  let shownUntil = idleLocksAt(now());
  let timer: number | undefined;
  // The warning a minute before, and whether it was given.
  let warnTimer: number | undefined;
  let warned = false;
  // The answers still waited for, each by the timer that gives up on it.
  const waits = new Set<number>();
  let lastCheck: number | null = null;
  // The one check kept for the minute's end, and when the press it keeps
  // for was: a press still fresh when the check runs slides the step-up, and
  // the other tabs hear of it once it answers open. A press gone stale (the
  // tab frozen in the background, its timer run long after) only reads.
  let later: number | undefined;
  let pressedAt: number | null = null;
  // When a check last went to slide the step-up: what comes within
  // `SAME_GESTURE_MS` of it is the same gesture.
  let lastSlide: number | null = null;
  // The latest hold: only its own answer shows the file again, and putting
  // the page away makes any other stale.
  let look = 0;
  let held = false;

  function stop() {
    stopped = true;
    win.clearTimeout(timer);
    win.clearTimeout(warnTimer);
    win.clearTimeout(later);
    for (const wait of waits) win.clearTimeout(wait);
    waits.clear();
    unhear?.();
    unhear = null;
    if (!listening) return;
    listening = false;
    page.removeEventListener("pointerdown", active);
    page.removeEventListener("keydown", active);
    page.removeEventListener("focusin", moved);
    page.removeEventListener("visibilitychange", shown);
  }

  function finish(why: WatchClose) {
    if (stopped) return;
    stop();
    close(why);
  }

  /**
   * This tab's 15 minutes counted to their end, and the warning a minute
   * before; a warning given ends, the end moved on.
   */
  function arm() {
    win.clearTimeout(timer);
    win.clearTimeout(warnTimer);
    const left = shownUntil - now();
    timer = win.setTimeout(lapse, Math.max(0, left));
    if (left > WARN_BEFORE_MS) {
      if (warned) {
        warned = false;
        warn?.(false);
      }
      warnTimer = win.setTimeout(soon, left - WARN_BEFORE_MS);
    } else {
      soon();
    }
  }

  /** A minute left: the person is told, once. */
  function soon() {
    if (warned || stopped) return;
    warned = true;
    warn?.(true);
  }

  function holdFile(next: boolean) {
    held = next;
    hold(next);
  }

  /**
   * The server asked, sliding its 15 minutes only for activity here (`tell`,
   * or a press kept for the minute's end). Open: this tab's 15 minutes end
   * when the server says the step-up's do, counted from the answer, the
   * other tabs told if it slid, then `open`. Closed, failed, no answer
   * within `KEEP_OPEN_WAIT_MS` in a tab awake all along, or a time left
   * that isn't one: the file closes in this tab. A give-up or an answer
   * that comes past `SLEPT_AFTER_MS` came after the tab slept, and decides
   * nothing: with the page in sight and no look since, the server is asked
   * again, the file hidden meanwhile (a look since asks for itself, and a
   * page put away asks as it comes back); nothing more from this check is
   * heard.
   */
  function check(tell: boolean, open?: () => void) {
    const at = now();
    const tells =
      tell || (pressedAt !== null && at - pressedAt <= PRESS_FRESH_MS);
    win.clearTimeout(later);
    later = undefined;
    pressedAt = null;
    lastCheck = at;
    if (tells) lastSlide = at;
    const seen = look;
    // Given up on, or answered: what comes after is heard no more.
    let done = false;
    let answer: Promise<KeepOpenAnswer>;
    try {
      answer = keepOpen(tells);
    } catch (error) {
      answer = Promise.reject(error);
    }
    /** Whether the tab slept since the check; if so, asked again as above. */
    const slept = (): boolean => {
      if (now() - at <= SLEPT_AFTER_MS) return false;
      if (page.visibilityState === "visible" && look === seen) {
        lookAgain(false);
      }
      return true;
    };
    const wait = win.setTimeout(() => {
      waits.delete(wait);
      done = true;
      if (!slept()) finish("failed");
    }, KEEP_OPEN_WAIT_MS);
    waits.add(wait);
    /** Whether the answer decides: the first word, in a tab awake. */
    const answered = (): boolean => {
      win.clearTimeout(wait);
      waits.delete(wait);
      if (done || stopped) return false;
      done = true;
      return !slept();
    };
    answer.then(
      (kept) => {
        if (!answered()) return;
        if (!kept?.open) {
          finish("closed");
          return;
        }
        // Never a fresh 15 minutes on a check that only read the step-up,
        // and never more than 15 on any.
        const left = Math.min(kept.leftMs, FILE_IDLE_MS);
        if (!Number.isFinite(left) || left < 0) {
          finish("failed");
          return;
        }
        shownUntil = now() + left;
        arm();
        if (tells) tabs.tell({ kind: "active" });
        open?.();
      },
      () => {
        if (answered()) finish("failed");
      },
    );
  }

  /** Part of the gesture a check just slid the step-up for. */
  function sameGesture(at: number): boolean {
    return lastSlide !== null && at - lastSlide < SAME_GESTURE_MS;
  }

  /**
   * Activity, here (`tell`) or in another tab: the server asked now, or at
   * the minute's end; activity here during the warning, now, as
   * "להשאיר פתוח" is.
   */
  function due(tell: boolean) {
    const at = now();
    if (touchDue(lastCheck, at)) {
      check(tell);
      return;
    }
    // The focus a press or a key just counted brings with it: counted.
    if (tell && sameGesture(at)) return;
    // A warning up within the minute of a check (an answer that left under
    // a minute): kept for the minute's end, it would come after the
    // step-up's end. Slid now, the warning ends.
    if (tell && warned) {
      check(true);
      return;
    }
    if (tell) pressedAt = at;
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

  /**
   * This tab's 15 minutes passed: the server asked once before anything
   * closes, sliding nothing unless a press here waits for the minute's end.
   */
  function lapse() {
    if (page.visibilityState === "visible") lookAgain(false);
    else check(false);
  }

  function active() {
    // Held, the answer it waits for decides.
    if (held || stopped) return;
    // Past its 15 minutes, its timer held back while the device slept.
    if (now() >= shownUntil) lookAgain(true);
    else due(true);
  }

  /**
   * The focus moved from one element to another: the person's doing (by the
   * keyboard, or by a desktop screen reader that moves the system focus; a
   * phone's screen reader moves only its own cursor, and nothing comes
   * here). A focus put on the page from nowhere (the screen giving it back
   * once the file shows again, or once what had it went) moved nothing of
   * the person's, and keeps nothing open.
   */
  function moved(event: Event) {
    if ((event as FocusEvent).relatedTarget) active();
  }

  /**
   * "להשאיר פתוח": asked at once, past the minute's wait, which could end
   * after this tab's 15 minutes do; nothing more when its own press or key
   * just asked.
   */
  function stayOpen() {
    if (held || stopped) return;
    const at = now();
    if (at >= shownUntil) lookAgain(true);
    else if (!sameGesture(at)) check(true);
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
  page.addEventListener("focusin", moved);
  page.addEventListener("visibilitychange", shown);
  unhear = tabs.hear(heard);
  arm();
  if (page.visibilityState !== "visible") putAway();
  else if (again) lookAgain(true);
  else check(true);
  return { stop, stayOpen };
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
