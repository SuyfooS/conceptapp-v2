/**
 * Where the clock puts the keyboard's focus once a press of its own buttons
 * is over (accessibility, part 5): "יציאה להפסקה", "יציאה מהמשמרת" and
 * "ביטול היציאה" each give way to what their press drew, so the focus goes
 * to the screen's main control now, "יציאה מהמשמרת" during a break and the
 * circle otherwise; and when a sheet keeps its close for a refusal it has
 * yet to say. No React here, and no page. A held Enter's repeats are
 * `@ui/focus-after`'s `ignoreHeldEnter`.
 */

/** Where the person stands on the clock: their shift, and a break running in it. */
export function clockState(
  open: { id: string } | null,
  pause: { id: string } | null,
): string {
  return `${open?.id ?? "-"}/${pause?.id ?? "-"}`;
}

/**
 * A press of the clock's own buttons (a break, the end of the shift, the
 * circle, a clock-out taken back, the press without a code), or a code's
 * punch that went through (scanned or typed): the state it was pressed in,
 * and whether its answer was a refusal, which changes nothing on the screen.
 */
export type ClockPress = { from: string; refused: boolean };

/**
 * Whether a press is over, so the focus can be put back where it belongs:
 * nothing on its way any more (`busy`), and either the screen it led to is
 * drawn (the state changed) or it was refused. Until then it waits: the
 * answer can come before the page read again after it.
 */
export function pressOver(
  press: ClockPress | null,
  now: { busy: boolean; state: string },
): boolean {
  if (press === null || now.busy) return false;
  return press.refused || now.state !== press.from;
}

/**
 * Whether a sheet keeps its close for a refusal it has not said yet: it
 * says one once the page read again is drawn, which comes after the answer,
 * and closed before that, nothing would ever say it. A closing only, never
 * an opening.
 */
export function closeHeldForRefusal<Failure>(
  open: boolean,
  refusal: { failure: Failure | null; said: Failure | null },
): boolean {
  return !open && refusal.failure !== null && refusal.said !== refusal.failure;
}
