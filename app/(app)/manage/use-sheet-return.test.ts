import { describe, expect, it, vi } from "vitest";
import { sheetReturn } from "./use-sheet-return";

// The keyboard's way back from an editor's sheet (accessibility, part 8),
// with the page stood in for: a removal's sheet closes onto its "ביטול",
// any other onto what opened it, and a removal refused while its sheet
// still closes onto the row it put back, what follows only after that.
// A refusal that comes once its sheet has gone changes no later sheet's
// way back.

/** A row or a button on screen, as far as the way back asks. */
const shown = (name: string) =>
  ({
    name,
    isConnected: true,
    getClientRects: () => ({ length: 1 }),
    matches: () => false,
    closest: () => null,
    hasAttribute: () => false,
    setAttribute() {},
    focus() {},
    addEventListener() {},
    getBoundingClientRect: () => ({ top: 0, bottom: 10 }),
    scrollIntoView() {},
  }) as unknown as HTMLElement;

/** A screen with two shifts' rows, its "ביטול" and its title. */
function screen() {
  const page = { activeElement: null as Element | null };
  const back = sheetReturn(page);
  const evening = shown("evening");
  const saturday = shown("saturday");
  const undo = shown("undo") as HTMLButtonElement;
  const heading = shown("heading") as HTMLHeadingElement;
  back.undoButton.current = undo;
  back.heading.current = heading;
  /** The sheet of `row`, opened from it. */
  const open = (row: Element) => {
    page.activeElement = row;
    back.opening();
  };
  return { back, evening, saturday, undo, heading, open };
}

/** What follows a step queued after it (the Sheet's focus first). */
const queued = () => new Promise<void>((resolve) => queueMicrotask(resolve));

describe("sheetReturn", () => {
  it("closes a removal's sheet onto its 'ביטול', any other onto what opened it", () => {
    const { back, evening, saturday, undo, open } = screen();
    open(evening);
    back.removing();
    expect(back.returnFocus()).toBe(undo);
    open(saturday);
    expect(back.returnFocus()).toBe(saturday);
  });

  it("closes a removal's sheet refused while it still closes onto the row put back, and says it after", async () => {
    const { back, evening, undo, open } = screen();
    const again = shown("evening, there again");
    const landed = vi.fn();
    open(evening);
    const removal = back.removing();
    expect(back.kept(removal, () => again, landed)).toBe(true);
    const chosen = back.returnFocus();
    expect(chosen).toBe(again);
    expect(chosen).not.toBe(undo);
    // The Sheet focuses it first.
    expect(landed).not.toHaveBeenCalled();
    await queued();
    expect(landed).toHaveBeenCalledOnce();
  });

  it("keeps nothing of a removal refused once its sheet has gone: another sheet opened since closes onto its own row", async () => {
    const { back, evening, saturday, undo, open } = screen();
    const again = shown("evening, there again");
    const landed = vi.fn();
    open(evening);
    const removal = back.removing();
    expect(back.returnFocus()).toBe(undo);
    // Saturday's sheet opened while the removal waited, then refused.
    open(saturday);
    expect(back.kept(removal, () => again, landed)).toBe(false);
    expect(back.returnFocus()).toBe(saturday);
    await queued();
    expect(landed).not.toHaveBeenCalled();
  });

  it("keeps nothing of an earlier removal refused while a later one's sheet closes: that one closes onto its own 'ביטול'", () => {
    const { back, evening, saturday, undo, open } = screen();
    const again = shown("evening, there again");
    open(evening);
    const first = back.removing();
    expect(back.returnFocus()).toBe(undo);
    open(saturday);
    back.removing();
    expect(
      back.kept(
        first,
        () => again,
        () => {},
      ),
    ).toBe(false);
    expect(back.returnFocus()).toBe(undo);
  });

  it("says a refusal at once when its sheet's close won't come for it: another opened or removed first", () => {
    const { back, evening, saturday, open } = screen();
    const again = shown("evening, there again");
    const landed = vi.fn();
    open(evening);
    const removal = back.removing();
    back.kept(removal, () => again, landed);
    open(saturday);
    expect(landed).toHaveBeenCalledOnce();
    expect(back.returnFocus()).toBe(saturday);

    const other = vi.fn();
    open(evening);
    const next = back.removing();
    back.kept(next, () => again, other);
    back.removing();
    expect(other).toHaveBeenCalledOnce();
  });
});
