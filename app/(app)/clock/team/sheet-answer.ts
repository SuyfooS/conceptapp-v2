/**
 * A write from one of the person's hours sheets (25 November 2026): its
 * answer is done, or a refusal the sheet's form says. The form draws that
 * refusal on React's next turn after the answer, while the write's hold on
 * the sheet (`@ui/use-sheet-write`) ends as the answer comes, so a close in
 * between (✕, Escape, the scrim, a swipe) took it along unsaid. Kept as it
 * comes, before the form is handed it, the sheet holds on until the form has
 * drawn it and calls `said` (`useSaid`). No React here, and no page.
 */

/** What an hours action answers: done, or why not (a month closed, for one). */
export type SheetAnswer<Failure> =
  | { ok: true }
  | { ok: false; failure: Failure; month?: string };

/**
 * Sends it and hands the answer on: `done`, or `refused` (a write that
 * failed to go is refused as "failed"), kept first (`keep`, the write's own
 * from `useSheetWrite`'s `start`).
 */
export async function sendFromSheet<Failure>(
  keep: () => void,
  send: () => Promise<SheetAnswer<Failure>>,
  on: {
    done: () => void;
    refused: (failure: NoInfer<Failure> | "failed", month?: string) => void;
  },
): Promise<void> {
  let answer: SheetAnswer<Failure | "failed">;
  try {
    answer = await send();
  } catch {
    answer = { ok: false, failure: "failed" };
  }
  if (answer.ok) {
    on.done();
    return;
  }
  keep();
  on.refused(answer.failure, answer.month);
}
