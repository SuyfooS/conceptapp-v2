import { idleLocksAt, touchDue } from "@domain/file-holders";
import type { KeepOpenAnswer, LockAnswer } from "./holder-file-types";

/*
 * The idle lock of an open hiring file (profile H6a, plan §3.5), apart from
 * React so it runs against a clock of its own in the tests. It fails
 * closed: a file stops showing when its 15 minutes pass with no activity,
 * when the server says it is closed, and also when the server can't be
 * asked (offline, or the action failed), since then nobody knows it is
 * still open. Next keeps a screen it leaves (hidden in an <Activity>, its
 * state kept, its effects stopped) and shows it again on Back: the moment
 * of the last activity lives in the screen's memory, so coming back never
 * starts the 15 minutes again, and a file whose 15 minutes passed while it
 * was hidden closes before it is drawn.
 */

/** Why the watch closes an open file here. */
export type WatchClose =
  /** 15 minutes passed with no activity on it. */
  | "idle"
  /** The server couldn't say it is still open: offline, or the action failed. */
  | "failed"
  /** The server said it is closed: locked in another tab, or its step-up gone. */
  | "closed";

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

/**
 * Watch an open file while its screen shows, and return the stop for when
 * it hides or goes. As it starts it asks the server to keep the file open
 * (`keepOpen`, which also slides the server's 15 minutes), and again on a
 * press or a key at most once a minute; a press or a key also starts the
 * 15 minutes again. It calls `close` once, and stops: the 15 minutes passed
 * (by the timer, on a press or key after them, on coming back to the page
 * after them, or on being shown again after them, before anything else),
 * the server answered closed, or the server's answer didn't come. An answer
 * that comes after the stop is left for the next start, which asks again.
 */
export function watchOpenFile(
  memory: OpenFileMemory,
  keepOpen: () => Promise<KeepOpenAnswer>,
  close: (why: WatchClose) => void,
  page: WatchedPage,
  win: WatchedWindow,
  now: () => number = Date.now,
): () => void {
  let stopped = false;
  let listening = false;
  let timer: number | undefined;
  let lastTouch: number | null = null;

  function lastActivity(): number {
    return memory.lastActivity ?? now();
  }

  function stop() {
    stopped = true;
    win.clearTimeout(timer);
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

  function touch(at: number) {
    if (!touchDue(lastTouch, at)) return;
    lastTouch = at;
    let answer: Promise<KeepOpenAnswer>;
    try {
      answer = keepOpen();
    } catch (error) {
      answer = Promise.reject(error);
    }
    answer.then(
      (kept) => {
        if (!kept?.open) finish("closed");
      },
      () => finish("failed"),
    );
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
    if (
      page.visibilityState === "visible" &&
      now() >= idleLocksAt(lastActivity())
    ) {
      finish("idle");
    }
  }

  // Opened now, or shown again: the 15 minutes run from the last activity.
  const start = lastActivity();
  memory.lastActivity = start;
  if (now() >= idleLocksAt(start)) {
    finish("idle");
    return stop;
  }
  touch(now());
  arm();
  listening = true;
  page.addEventListener("pointerdown", active);
  page.addEventListener("keydown", active);
  page.addEventListener("visibilitychange", shown);
  return stop;
}

/**
 * After a file closed here, which it already shows locked: the files are
 * locked on the device (`lock`, which forgets the step-up) unless the server
 * said they were closed already, and then the screen is drawn again from the
 * server (`draw`). A lock that fails still draws; the screen stays locked.
 */
export async function lockAndDraw(
  why: FileClose,
  lock: () => Promise<LockAnswer>,
  draw: () => void,
): Promise<void> {
  if (why !== "closed") {
    try {
      await lock();
    } catch {
      // Offline, or the action failed: the screen stays locked all the same.
    }
  }
  draw();
}
