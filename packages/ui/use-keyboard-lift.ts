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
 * on screen, 8px under the top and its safe area, so all of it shows and its
 * body scrolls, or the whole sheet where that is too short for its header
 * and footer (`sheetScrollsWhole`). Nothing at all with no keyboard.
 */
export function sheetLiftStyle(lift: KeyboardLift): CSSProperties | undefined {
  if (lift.room === null) return undefined;
  return {
    "--sheet-bottom": `${lift.inset + SHEET_GAP}px`,
    "--sheet-max": `calc(${Math.max(0, lift.room - 2 * SHEET_GAP)}px - env(safe-area-inset-top))`,
  } as CSSProperties;
}

/**
 * The least a sheet needs over the keyboard to keep its frame in place: the
 * grabber and header (about 71px), a footer with a large button (about
 * 76px), and between them one 48px field 12px clear of the body's edges.
 */
export const SHEET_FRAME_MIN = 220;

/**
 * Whether a sheet scrolls whole, its header and footer with its body: when
 * what is on screen over the keyboard is shorter than its frame, as on a
 * phone turned sideways. Kept in place there, the header and the footer
 * would leave the body no height, and the field typed in would vanish in
 * it, the footer under the keyboard. Never with no keyboard.
 */
export function sheetScrollsWhole(lift: KeyboardLift): boolean {
  return lift.room !== null && lift.room - 2 * SHEET_GAP < SHEET_FRAME_MIN;
}

type Edges = { top: number; bottom: number };

/**
 * How far a scroller moves so that `item` shows within `view`, `gap` clear of
 * its edges, as `scrollIntoView({ block: "nearest" })` would (CSSOM View):
 * nothing when it shows already, or fills the view; otherwise the nearer
 * edge; a field taller than the view aligns its top when it is below and its
 * bottom when it is above (CSSOM). Negative is up.
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
 * Brings what holds the focus into sight within a sheet's body, then within
 * the sheet itself: the body scrolls while the header and footer stay in
 * place, the sheet when it scrolls whole (`sheetScrollsWhole`). Whichever
 * does not scroll is left as it is.
 */
export function keepFocusInSheet(
  body: HTMLElement | null | undefined,
  sheet: HTMLElement | null | undefined,
): void {
  keepFocusInView(body);
  keepFocusInView(sheet);
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

/** What a keyboard is watched for (a sheet): the field typed in is inside it. */
export type KeyboardScope = Pick<
  HTMLElement,
  "contains" | "addEventListener" | "removeEventListener"
> & { readonly ownerDocument: Pick<Document, "activeElement"> };

/** Input types no keyboard opens for: pressed, picked or a file. */
const NOT_TYPED = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "hidden",
  "image",
  "radio",
  "range",
  "reset",
  "submit",
]);

/**
 * Whether the keyboard stays up for what holds the focus: a field to type
 * in, an input (not a button, a box to tick, a file and the like), a
 * textarea or anything contenteditable, and none that only reads.
 */
export function opensKeyboard(focused: unknown): boolean {
  if (typeof focused !== "object" || focused === null) return false;
  const field = focused as Partial<HTMLInputElement>;
  if (field.isContentEditable === true) return true;
  if (field.readOnly === true) return false;
  if (field.tagName === "TEXTAREA") return true;
  return field.tagName === "INPUT" && !NOT_TYPED.has(field.type ?? "text");
}

export type KeyboardWatch = {
  /**
   * The layout viewport's height as `position: fixed` sees it; 0 or less
   * falls back on `innerHeight`.
   */
  layoutHeight?: () => number;
  /**
   * Lift only while a field to type in inside this holds the focus, read
   * again as the focus moves in or out of it. A keyboard up for a field
   * outside (a sheet opened from a button while the page's field kept it),
   * or for a button inside that just took the focus, is one about to close.
   * Without it, any keyboard lifts.
   */
  within?: KeyboardScope;
  /** Called with each new lift, and only when it changes. */
  onLift: (lift: KeyboardLift) => void;
  /** Once the viewport has stood still a moment with a keyboard up. */
  onSettled?: () => void;
};

/**
 * Follows the keyboard: reads the viewports at once, then on every resize
 * and move of the visual viewport (the keyboard opening, closing or changing,
 * iOS moving it to a field), of the window (turning the phone), and as the
 * focus comes into or leaves `within`. Where there is no visualViewport
 * nothing is ever lifted. Returns the stop.
 */
export function watchKeyboard(
  win: KeyboardWindow,
  { layoutHeight, within, onLift, onSettled }: KeyboardWatch,
): () => void {
  const view = win.visualViewport;
  if (!view) return () => {};
  let shown = NO_KEYBOARD;
  let settling: number | undefined;
  const typing = (focused: unknown) =>
    !within || (opensKeyboard(focused) && within.contains(focused as Node));
  const read = (focused: unknown) => {
    const measured = layoutHeight?.() ?? 0;
    const next = typing(focused)
      ? keyboardLift({
          layoutHeight: measured > 0 ? measured : win.innerHeight,
          height: view.height,
          offsetTop: view.offsetTop,
          scale: view.scale,
        })
      : NO_KEYBOARD;
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
  // As the focus comes in, it is already where it went; as it leaves, it is
  // nowhere yet, and `relatedTarget` says where it goes, so going from one
  // field to the next is no drop.
  const reread = () => read(within?.ownerDocument.activeElement);
  const leave = (event: FocusEvent) => read(event.relatedTarget);
  reread();
  view.addEventListener("resize", reread);
  view.addEventListener("scroll", reread);
  win.addEventListener("resize", reread);
  within?.addEventListener("focusin", reread);
  within?.addEventListener("focusout", leave);
  return () => {
    view.removeEventListener("resize", reread);
    view.removeEventListener("scroll", reread);
    win.removeEventListener("resize", reread);
    within?.removeEventListener("focusin", reread);
    within?.removeEventListener("focusout", leave);
    win.clearTimeout(settling);
  };
}

/**
 * The keyboard's lift while `layout` and `sheet` are on the page. `layout`
 * is a fixed, full-height element (a sheet's scrim), whose height is the
 * layout viewport's as `position: fixed` sees it on every browser
 * (`innerHeight` follows the visual viewport on some). `sheet` lifts only
 * while a field inside it holds the focus. Once the viewport stands still
 * with a keyboard up, the field typed in is brought into sight within
 * `scroller` (the sheet's body), then within `sheet` itself, which scrolls
 * whole on a short screen (`sheetScrollsWhole`). Nothing is lifted on the
 * server, before both are drawn, or without a keyboard.
 */
export function useKeyboardLift(
  layout: HTMLElement | null,
  sheet: HTMLElement | null,
  scroller: RefObject<HTMLElement | null>,
): KeyboardLift {
  const [lift, setLift] = useState(NO_KEYBOARD);
  useLayoutEffect(() => {
    if (!layout || !sheet) return;
    const stop = watchKeyboard(window, {
      layoutHeight: () => layout.getBoundingClientRect().height,
      within: sheet,
      onLift: setLift,
      onSettled: () => keepFocusInSheet(scroller.current, sheet),
    });
    return () => {
      stop();
      setLift(NO_KEYBOARD);
    };
  }, [layout, sheet, scroller]);
  return lift;
}
