/**
 * What the builder's form action takes: the form as a dock button sent it,
 * or a publish that waited for its undo, sent once the wait was over, with
 * what to call when the server has answered (a switch to another business
 * waits for that: `useHeldWrite`).
 */
export type BuilderSend = FormData | { form: FormData; sent: () => void };

/** The form a send carries, and what to call once it is answered. */
export function sendOf(payload: BuilderSend): {
  form: FormData;
  sent: (() => void) | null;
} {
  return payload instanceof FormData
    ? { form: payload, sent: null }
    : { form: payload.form, sent: payload.sent };
}

/**
 * Whether a press of the dock waits for "ביטול" before anything reaches the
 * server (Orel's answer 3 of 15 November 2026, the running-week plan's R3b):
 * publishing changes to a week already published, in either week, waits
 * `HOLD_MS` (app/(app)/use-held-write.ts), and nobody hears of it until it
 * goes. A week's first publish and a draft go at once: the answer was about
 * "פרסום השינויים". So does publishing on the way out ("פרסום השינויים
 * ויציאה"), as the screen is being left, and a write held then would go at
 * once anyway.
 */
export function publishWaits(press: {
  intent: "save" | "publish";
  /** The week has been published: the button reads "פרסום השינויים". */
  published: boolean;
  /** Pressed on the way out, from the sheet that asks before leaving. */
  leaving: boolean;
}): boolean {
  return press.intent === "publish" && press.published && !press.leaving;
}
