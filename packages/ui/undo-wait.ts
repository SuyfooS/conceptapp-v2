/**
 * The one rule for "the way back waits while it is being reached", shared by
 * StatusToast's undo and UndoRow, with no React:
 *
 * - the keyboard's focus on it (a ring shows) waits, with no limit;
 * - a mouse brought over it waits until it leaves;
 * - a finger (or a pen) held down on it waits until it lifts;
 * - a focus with no ring waits too when the last press on the page was not a
 *   mouse (a tap, or none at all: a screen reader's own activation), until a
 *   press anywhere outside it, the focus leaves, or `QUIET_WAIT_MS` passes.
 *
 * After a mouse press, a focus with no ring counts as before, so a sighted
 * person at a desk sees the same timing. The browser can't tell where a
 * phone's screen reader stands: one that swipes to "ביטול" without its focus
 * gets no wait, so a way back that comes in place of what was pressed takes
 * the focus itself.
 */

/** A focus with no ring (a tap, a touch screen reader) waits at most this long. */
export const QUIET_WAIT_MS = 60_000;

export type PointerKind = "mouse" | "touch" | "pen" | null;

/** The last press on the page: its pointer's kind, and where it was. */
let lastPress: { kind: PointerKind; x: number; y: number } | null = null;
const noted = new WeakSet<Pick<Document, "addEventListener">>();

const kindOf = (type: string): PointerKind =>
  type === "mouse" || type === "touch" || type === "pen" ? type : null;

/** The kind of the last pointer press anywhere on the page (null: none yet). */
export function lastPointerKind(): PointerKind {
  return lastPress?.kind ?? null;
}

/**
 * Whether a mouse at (x, y) rests where the last press was: what is under it
 * came to it (the row that took the pressed button's place), it didn't come
 * to what is under it.
 */
export function restsWherePressed(x: number, y: number): boolean {
  return (
    lastPress?.kind === "mouse" &&
    Math.abs(lastPress.x - x) < 1 &&
    Math.abs(lastPress.y - y) < 1
  );
}

/**
 * Notes each press's pointer, before anything else hears it (capture), once
 * per page: the press that brings a way back comes before it is drawn.
 */
export function notePointerKinds(doc: Pick<Document, "addEventListener">) {
  if (noted.has(doc)) return;
  noted.add(doc);
  doc.addEventListener(
    "pointerdown",
    (event) => {
      const press = event as PointerEvent;
      lastPress = {
        kind: kindOf(String(press.pointerType ?? "")),
        x: Number(press.clientX ?? 0),
        y: Number(press.clientY ?? 0),
      };
    },
    { capture: true, passive: true },
  );
}

/** The clock it waits on: the page's, or a test's. */
export type UndoWaitTimers = {
  setTimeout: (run: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

const pageTimers: UndoWaitTimers = {
  setTimeout: (run, ms) => setTimeout(run, ms),
  clearTimeout: (handle) =>
    clearTimeout(handle as ReturnType<typeof setTimeout>),
};

export type UndoWait = {
  /** The focus came in: with a ring or not, after what kind of press. */
  focusIn(ring: boolean, lastPointer: PointerKind): void;
  /** The focus left it. */
  focusOut(): void;
  /** A mouse came over it, or left. */
  mouse(over: boolean): void;
  /** A finger or a pen went down on it, or lifted. */
  finger(down: boolean): void;
  /** A press somewhere else on the page: a quiet focus waits no more. */
  pressedElsewhere(): void;
  /** The way back was taken: only the keyboard's focus still holds it. */
  taken(): void;
  waiting(): boolean;
  /** Lets go of everything, saying so if it was waiting; it can wait again. */
  dispose(): void;
};

export function createUndoWait({
  onChange,
  quietMs = QUIET_WAIT_MS,
  timers = pageTimers,
}: {
  /** Hears each change of whether it waits, and only a change. */
  onChange: (waiting: boolean) => void;
  quietMs?: number;
  timers?: UndoWaitTimers;
}): UndoWait {
  let ring = false;
  let quiet = false;
  let over = false;
  let finger = false;
  let said = false;
  let limit: unknown = null;

  const report = () => {
    const now = ring || quiet || over || finger;
    if (now === said) return;
    said = now;
    onChange(now);
  };
  const endQuiet = () => {
    if (limit !== null) timers.clearTimeout(limit);
    limit = null;
    quiet = false;
  };

  return {
    focusIn(withRing, lastPointer) {
      endQuiet();
      ring = withRing;
      if (!withRing && lastPointer !== "mouse") {
        quiet = true;
        limit = timers.setTimeout(() => {
          limit = null;
          quiet = false;
          report();
        }, quietMs);
      }
      report();
    },
    focusOut() {
      ring = false;
      endQuiet();
      report();
    },
    mouse(isOver) {
      over = isOver;
      report();
    },
    finger(down) {
      finger = down;
      report();
    },
    pressedElsewhere() {
      if (!quiet) return;
      endQuiet();
      report();
    },
    taken() {
      endQuiet();
      over = false;
      finger = false;
      report();
    },
    waiting: () => said,
    dispose() {
      endQuiet();
      ring = false;
      over = false;
      finger = false;
      report();
    },
  };
}
