/**
 * What the page's announcer says (`@ui/announcer`), with no React: each line
 * said once into a live region, then gone. Never given a code, an ID number
 * or anything else secret: those keep their own region where they are shown
 * (CodeSlots, MaskedValue), so nothing of them stays in the page's.
 */

export type Politeness = "polite" | "assertive";

export type Announcement = { id: number; text: string; lang?: string };

export type AnnouncerSnapshot = {
  polite: readonly Announcement[];
  assertive: readonly Announcement[];
};

/** By then it was read: the line goes quiet, and nothing lingers to find. */
export const ANNOUNCE_CLEAR_MS = 7_000;
/** The same words twice in a moment (two shapes of one screen): said once. */
export const ANNOUNCE_SAME_MS = 250;

export const NOTHING_SAID: AnnouncerSnapshot = { polite: [], assertive: [] };

/** The clock it waits on: the page's, or a test's. */
export type AnnouncerTimers = {
  setTimeout: (run: () => void, ms: number) => unknown;
};

const pageTimers: AnnouncerTimers = {
  setTimeout: (run, ms) => setTimeout(run, ms),
};

export type AnnouncerStore = {
  /**
   * Says `text`, politely by default (after what is being read), or at once
   * (`assertive`). Each call is a new line, so the same words said again
   * later are heard again; empty words say nothing.
   */
  announce(
    text: string,
    options?: { politeness?: Politeness; lang?: string },
  ): void;
  /** What is said now; a new object only when it changed. */
  snapshot(): AnnouncerSnapshot;
  subscribe(listener: () => void): () => void;
};

export function createAnnouncerStore(
  timers: AnnouncerTimers = pageTimers,
  now: () => number = Date.now,
): AnnouncerStore {
  let next = 0;
  let said: AnnouncerSnapshot = NOTHING_SAID;
  const last: Record<Politeness, { text: string; at: number } | null> = {
    polite: null,
    assertive: null,
  };
  const listeners = new Set<() => void>();
  const changed = (to: AnnouncerSnapshot) => {
    said = to;
    for (const listener of [...listeners]) listener();
  };

  return {
    announce(text, { politeness = "polite", lang } = {}) {
      if (text.trim() === "") return;
      const at = now();
      const before = last[politeness];
      if (before?.text === text && at - before.at < ANNOUNCE_SAME_MS) return;
      last[politeness] = { text, at };
      next += 1;
      const line: Announcement = lang
        ? { id: next, text, lang }
        : { id: next, text };
      changed({ ...said, [politeness]: [...said[politeness], line] });
      timers.setTimeout(() => {
        changed({
          ...said,
          [politeness]: said[politeness].filter((kept) => kept !== line),
        });
      }, ANNOUNCE_CLEAR_MS);
    },
    snapshot: () => said,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
