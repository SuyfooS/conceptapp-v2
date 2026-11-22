"use client";

import {
  type CSSProperties,
  type RefObject,
  useLayoutEffect,
  useState,
} from "react";

/*
 * A phone's keyboard over a sheet (Orel, 22 November 2026). `position: fixed`
 * is laid out in the layout viewport, and the keyboard doesn't shrink it: iOS
 * never does, and Android Chrome by default shrinks only the visual viewport,
 * what is on screen. So a sheet at the foot of the layout viewport stays
 * there, behind the keyboard. The visual viewport says where the keyboard
 * begins: whatever lies below its foot is under the keyboard.
 */

/** What the browser says of its two viewports, in CSS pixels. */
export type ViewportReading = {
  /** The layout viewport's height: what `position: fixed` is laid out in. */
  layoutHeight: number;
  /** The visual viewport's: what is on screen, above any keyboard. */
  height: number;
  /** How far the visual viewport is moved down the layout one (iOS moves it to show a field). */
  offsetTop: number;
  /** Its pinch zoom: 1 when the page isn't zoomed. */
  scale: number;
};

export type KeyboardLift = {
  /**
   * How far the keyboard reaches over the layout viewport's foot: how high
   * to lift what stands there.
   */
  inset: number;
  /**
   * What is on screen with the keyboard up (the visual viewport's height),
   * or null when there is no keyboard.
   */
  room: number | null;
};

export const NO_KEYBOARD: KeyboardLift = { inset: 0, room: null };

/**
 * Less than this between the two viewports is no keyboard (a rounding, a
 * toolbar on its way): every keyboard is far taller.
 */
export const KEYBOARD_MIN = 40;

/**
 * The keyboard's lift, from the two viewports: the layout viewport's foot
 * less the visual viewport's, `layoutHeight - (height + offsetTop)`, never
 * below 0. Where iOS has moved the visual viewport down to show a field, the
 * lift is that much smaller, and nothing once it shows the foot. Pinched in,
 * the visual viewport is a part of the page made larger: its smaller height
 * says nothing of a keyboard, and the browser moves it to the field itself.
 */
export function keyboardLift(
  view: ViewportReading | null | undefined,
): KeyboardLift {
  if (!view) return NO_KEYBOARD;
  const { layoutHeight, height, offsetTop, scale } = view;
  if (!(height > 0) || Math.abs(scale - 1) > 0.01) return NO_KEYBOARD;
  if (!(layoutHeight - height >= KEYBOARD_MIN)) return NO_KEYBOARD;
  return {
    inset: Math.max(0, Math.ceil(layoutHeight - (height + offsetTop))),
    room: Math.floor(height),
  };
}

/** Between a sheet and the keyboard, and between it and the top of the screen. */
const SHEET_GAP = 8;

/**
 * A sheet's lift as the CSS variables its classes read, today's place being
 * their fallback: `--sheet-bottom` stands it 8px over the keyboard (the safe
 * area is under the keyboard then), and `--sheet-max` keeps it within what is
 * on screen, 8px under the top and its safe area, so its header stays in
 * sight and its body scrolls. Nothing at all with no keyboard.
 */
export function sheetLiftStyle(lift: KeyboardLift): CSSProperties | undefined {
  if (lift.room === null) return undefined;
  return {
    "--sheet-bottom": `${lift.inset + SHEET_GAP}px`,
    "--sheet-max": `calc(${Math.max(0, lift.room - 2 * SHEET_GAP)}px - env(safe-area-inset-top))`,
  } as CSSProperties;
}

type Edges = { top: number; bottom: number };

/**
 * How far a scroller moves so that `item` shows within `view`, `gap` clear of
 * its edges, as `scrollIntoView({ block: "nearest" })` would (CSSOM View):
 * nothing when it shows already, or fills the view; otherwise the nearer
 * edge, or its top when it is taller than the view. Negative is up.
 */
export function nearestScroll(view: Edges, item: Edges, gap = 0): number {
  const top = view.top + gap;
  const bottom = view.bottom - gap;
  if (item.top >= top && item.bottom <= bottom) return 0;
  if (item.top < top && item.bottom > bottom) return 0;
  const taller = item.bottom - item.top > bottom - top;
  if (item.top < top) return taller ? item.bottom - bottom : item.top - top;
  return taller ? item.top - top : item.bottom - bottom;
}

/** How far from the edges of a sheet's body the field typed in is kept. */
const FIELD_GAP = 12;

/**
 * Brings what holds the focus into sight within `scroller` alone. Not
 * `scrollIntoView`, which moves every scroller around it too: the page
 * behind the sheet, and the visual viewport.
 */
export function keepFocusInView(
  scroller: HTMLElement | null | undefined,
): void {
  const field = scroller?.ownerDocument.activeElement;
  if (!scroller || !field || field === scroller || !scroller.contains(field)) {
    return;
  }
  const by = nearestScroll(
    scroller.getBoundingClientRect(),
    field.getBoundingClientRect(),
    FIELD_GAP,
  );
  if (by !== 0) scroller.scrollTop += by;
}

/**
 * How long the viewport stands still, with a keyboard up, before the field
 * typed in is brought into sight: past the sheet's 200ms lift, and past the
 * stream of resizes Android sends while its keyboard slides up.
 */
export const SETTLE_MS = 250;

/** The visual viewport, as far as the keyboard goes. */
export type KeyboardViewport = Pick<
  VisualViewport,
  "height" | "offsetTop" | "scale" | "addEventListener" | "removeEventListener"
>;

/** The window a keyboard is watched in. */
export type KeyboardWindow = Pick<
  Window,
  | "innerHeight"
  | "addEventListener"
  | "removeEventListener"
  | "setTimeout"
  | "clearTimeout"
> & { readonly visualViewport?: KeyboardViewport | null };

export type KeyboardWatch = {
  /**
   * The layout viewport's height as `position: fixed` sees it; 0 or less
   * falls back on `innerHeight`.
   */
  layoutHeight?: () => number;
  /** Called with each new lift, and only when it changes. */
  onLift: (lift: KeyboardLift) => void;
  /** Once the viewport has stood still a moment with a keyboard up. */
  onSettled?: () => void;
};

/**
 * Follows the keyboard: reads the viewports at once, then on every resize
 * and move of the visual viewport (the keyboard opening, closing or changing,
 * iOS moving it to a field) and of the window (turning the phone). Where
 * there is no visualViewport nothing is ever lifted. Returns the stop.
 */
export function watchKeyboard(
  win: KeyboardWindow,
  { layoutHeight, onLift, onSettled }: KeyboardWatch,
): () => void {
  const view = win.visualViewport;
  if (!view) return () => {};
  let shown = NO_KEYBOARD;
  let settling: number | undefined;
  const read = () => {
    const measured = layoutHeight?.() ?? 0;
    const next = keyboardLift({
      layoutHeight: measured > 0 ? measured : win.innerHeight,
      height: view.height,
      offsetTop: view.offsetTop,
      scale: view.scale,
    });
    if (next.inset === shown.inset && next.room === shown.room) return;
    shown = next;
    onLift(next);
    win.clearTimeout(settling);
    settling =
      next.room === null
        ? undefined
        : win.setTimeout(() => {
            settling = undefined;
            onSettled?.();
          }, SETTLE_MS);
  };
  read();
  view.addEventListener("resize", read);
  view.addEventListener("scroll", read);
  win.addEventListener("resize", read);
  return () => {
    view.removeEventListener("resize", read);
    view.removeEventListener("scroll", read);
    win.removeEventListener("resize", read);
    win.clearTimeout(settling);
  };
}

/**
 * The keyboard's lift while `layout` is on the page: a fixed, full-height
 * element (a sheet's scrim), whose height is the layout viewport's as
 * `position: fixed` sees it on every browser (`innerHeight` follows the
 * visual viewport on some). Once the viewport stands still with a keyboard
 * up, the field typed in is brought into sight within `scroller`. Nothing
 * is lifted on the server, before `layout` is drawn, or without a keyboard.
 */
export function useKeyboardLift(
  layout: HTMLElement | null,
  scroller: RefObject<HTMLElement | null>,
): KeyboardLift {
  const [lift, setLift] = useState(NO_KEYBOARD);
  useLayoutEffect(() => {
    if (!layout) return;
    const stop = watchKeyboard(window, {
      layoutHeight: () => layout.getBoundingClientRect().height,
      onLift: setLift,
      onSettled: () => keepFocusInView(scroller.current),
    });
    return () => {
      stop();
      setLift(NO_KEYBOARD);
    };
  }, [layout, scroller]);
  return lift;
}
