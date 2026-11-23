import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createUndoWait,
  lastPointerKind,
  notePointerKinds,
  QUIET_WAIT_MS,
  restsWherePressed,
  waitForFocusInside,
} from "./undo-wait";

/*
 * The one rule for a way back that waits while it is being reached
 * (accessibility, part 1): the keyboard's focus with no limit; a mouse
 * over it; a finger on it; a focus with no ring after a tap or a screen
 * reader's own press, until a press elsewhere, the focus leaving, or a
 * minute. After a mouse press a quiet focus counts, as it always did.
 */

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function waitWith() {
  const heard: boolean[] = [];
  const wait = createUndoWait({ onChange: (waiting) => heard.push(waiting) });
  return { wait, heard };
}

describe("the way back's wait", () => {
  it("waits for the keyboard's focus with no limit, until it leaves", () => {
    const { wait, heard } = waitWith();
    wait.focusIn(true, "mouse");
    vi.advanceTimersByTime(QUIET_WAIT_MS * 10);
    expect(wait.waiting()).toBe(true);
    wait.focusOut();
    expect(heard).toEqual([true, false]);
  });

  for (const press of ["touch", "pen", null] as const) {
    it(`waits for a quiet focus after ${press ?? "no press"}, until a press elsewhere`, () => {
      const { wait, heard } = waitWith();
      wait.focusIn(false, press);
      expect(wait.waiting()).toBe(true);
      wait.pressedElsewhere();
      expect(heard).toEqual([true, false]);
    });
  }

  it("lets a quiet focus go when it leaves, or after a minute", () => {
    const leaving = waitWith();
    leaving.wait.focusIn(false, "touch");
    leaving.wait.focusOut();
    expect(leaving.heard).toEqual([true, false]);

    const staying = waitWith();
    staying.wait.focusIn(false, "touch");
    vi.advanceTimersByTime(QUIET_WAIT_MS - 1);
    expect(staying.wait.waiting()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(staying.wait.waiting()).toBe(false);
    expect(staying.heard).toEqual([true, false]);
  });

  it("counts a quiet focus after a mouse press, as before", () => {
    const { wait, heard } = waitWith();
    wait.focusIn(false, "mouse");
    expect(wait.waiting()).toBe(false);
    expect(heard).toEqual([]);
  });

  it("waits for a mouse over it and a finger on it", () => {
    const { wait, heard } = waitWith();
    wait.mouse(true);
    wait.mouse(false);
    wait.finger(true);
    expect(wait.waiting()).toBe(true);
    wait.finger(false);
    expect(heard).toEqual([true, false, true, false]);
  });

  it("tells only a change", () => {
    const { wait, heard } = waitWith();
    wait.focusIn(true, null);
    wait.mouse(true);
    wait.finger(true);
    wait.mouse(false);
    wait.finger(false);
    expect(heard).toEqual([true]);
    // A press elsewhere ends only a quiet focus's wait.
    wait.pressedElsewhere();
    expect(heard).toEqual([true]);
  });

  it("starts a quiet focus's minute again when the focus moves inside it", () => {
    const { wait } = waitWith();
    wait.focusIn(false, "touch");
    vi.advanceTimersByTime(QUIET_WAIT_MS - 1);
    wait.focusIn(false, "touch");
    vi.advanceTimersByTime(QUIET_WAIT_MS - 1);
    expect(wait.waiting()).toBe(true);
  });

  it("once taken, waits only for the keyboard's focus", () => {
    const quiet = waitWith();
    quiet.wait.focusIn(false, "touch");
    quiet.wait.finger(true);
    quiet.wait.taken();
    expect(quiet.heard).toEqual([true, false]);

    const keys = waitWith();
    keys.wait.focusIn(true, null);
    keys.wait.taken();
    expect(keys.wait.waiting()).toBe(true);
  });

  it("lets go of everything when disposed, saying so, and can wait again", () => {
    const { wait, heard } = waitWith();
    wait.focusIn(true, null);
    wait.mouse(true);
    wait.dispose();
    expect(heard).toEqual([true, false]);
    vi.advanceTimersByTime(QUIET_WAIT_MS);
    expect(heard).toEqual([true, false]);
    wait.finger(true);
    expect(heard).toEqual([true, false, true]);
  });

  it("waits on the clock it is given", () => {
    const due: (() => void)[] = [];
    const cleared: unknown[] = [];
    const heard: boolean[] = [];
    const wait = createUndoWait({
      onChange: (waiting) => heard.push(waiting),
      quietMs: 5,
      timers: {
        setTimeout: (run) => due.push(run),
        clearTimeout: (handle) => cleared.push(handle),
      },
    });
    wait.focusIn(false, null);
    due[0]?.();
    expect(heard).toEqual([true, false]);
    wait.focusIn(false, null);
    wait.focusOut();
    expect(cleared).toEqual([2]);
  });
});

/** A page whose presses are stood in for. */
class Presses extends EventTarget {
  listening = 0;
  override addEventListener(
    ...args: Parameters<EventTarget["addEventListener"]>
  ) {
    this.listening += 1;
    super.addEventListener(...args);
  }
}

const press = (pointerType: string, clientX = 10, clientY = 20) =>
  Object.assign(new Event("pointerdown"), { pointerType, clientX, clientY });

describe("the last press", () => {
  it("follows each press's pointer, noted once per page", () => {
    const page = new Presses();
    notePointerKinds(page);
    notePointerKinds(page);
    expect(page.listening).toBe(1);
    page.dispatchEvent(press("touch"));
    expect(lastPointerKind()).toBe("touch");
    page.dispatchEvent(press("mouse"));
    expect(lastPointerKind()).toBe("mouse");
    page.dispatchEvent(press("pen"));
    expect(lastPointerKind()).toBe("pen");
    page.dispatchEvent(press(""));
    expect(lastPointerKind()).toBeNull();
  });

  it("tells a mouse resting where it pressed from one brought there", () => {
    const page = new Presses();
    notePointerKinds(page);
    page.dispatchEvent(press("mouse", 100, 200));
    expect(restsWherePressed(100, 200)).toBe(true);
    expect(restsWherePressed(140, 200)).toBe(false);
    page.dispatchEvent(press("touch", 100, 200));
    expect(restsWherePressed(100, 200)).toBe(false);
  });
});

describe("a focus already inside as the wait starts listening", () => {
  const button = {} as Element;
  const root = { contains: (node: unknown) => node === button };
  const ring = () => true;

  // An autoFocus took it as the row was drawn; in dev React then runs the
  // effect's cleanup (which lets go of everything) and its body again.
  it("waits again for the keyboard's focus that dev's second run let go", () => {
    const { wait, heard } = waitWith();
    wait.focusIn(true, null);
    wait.dispose();
    waitForFocusInside(wait, root, { activeElement: button }, ring);
    expect(wait.waiting()).toBe(true);
    expect(heard).toEqual([true, false, true]);
  });

  it("changes nothing for a focus it already heard come in", () => {
    const { wait, heard } = waitWith();
    wait.focusIn(true, null);
    waitForFocusInside(wait, root, { activeElement: button }, ring);
    expect(heard).toEqual([true]);
  });

  it("waits for nothing when the focus is elsewhere, or nowhere", () => {
    const { wait, heard } = waitWith();
    waitForFocusInside(wait, root, { activeElement: {} as Element }, ring);
    waitForFocusInside(wait, root, { activeElement: null }, ring);
    waitForFocusInside(wait, null, { activeElement: button }, ring);
    waitForFocusInside(wait, root, undefined, ring);
    expect(heard).toEqual([]);
  });
});
