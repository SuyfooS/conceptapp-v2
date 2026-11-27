import { unstable_isUnrecognizedActionError } from "next/navigation";

/*
 * A screen left open across a release (closing the pilot, PR 1a). A release
 * may give the server actions new ids (Next.js rotates them at most every 14
 * days, even with nothing changed), and a page from the release before then
 * asks for an action the server no longer has: Next.js says so with an
 * `UnrecognizedActionError`, and until the app was opened again, every press
 * said "בדקו את החיבור ונסו שוב" (an iPhone's home-screen app resumes the
 * old page). The press that meets it loads the page again instead, once a
 * minute at most, and leaves a note so the page loaded says the app was
 * updated and the press is the person's to make again. Nothing here presses
 * again by itself: a punch's time is the moment the person pressed. A
 * navigation needs none of this, nor a press the new release still knows:
 * Next.js loads the whole page itself when a navigation or an action's
 * answer comes from another release, by its build id (next.config.ts sets
 * no deployment id, which would leave the id out of an action's answer).
 *
 * Both marks live in the tab's sessionStorage, inside try/catch: storage
 * that can't be read or written keeps neither the minute's guard nor the
 * note, so the page isn't loaded again and the press says what it said
 * before. Nothing here imports React, for the tests.
 */

/** sessionStorage: when this tab last loaded itself again for a release. */
export const RELOADED_KEY = "stale-build-reloaded";

/** sessionStorage: the note for the page loaded again, with when it was left. */
export const UPDATED_KEY = "stale-build-updated";

/**
 * One reload a minute at most. A page still from the release before after
 * one (a release still on its way, or an old page kept somewhere on the way)
 * says the press failed, as before, rather than loading again at each press.
 */
export const RELOAD_EVERY_MS = 60_000;

/**
 * How long the note waits for the page that says it. One left longer ago
 * (the reload went to the door, the session over) goes saying nothing, so a
 * clock opened much later doesn't say an update nobody saw.
 */
export const NOTE_FOR_MS = 5 * 60_000;

/** Whether a press failed because its page is from an earlier release. */
export function isStaleBuild(error: unknown): boolean {
  return unstable_isUnrecognizedActionError(error);
}

/** A time kept in storage; null for none, or for one that isn't a time. */
function keptTime(raw: string | null): number | null {
  if (raw === null) return null;
  const at = Number(raw);
  return Number.isSafeInteger(at) && at > 0 ? at : null;
}

/**
 * Whether `at` is less than `span` before `now`. One after `now` (the
 * phone's clock moved back since) isn't: it holds nothing back.
 */
function within(at: number | null, now: number, span: number): boolean {
  return at !== null && at <= now && now - at < span;
}

/**
 * A press failed: when its page is from an earlier release, loads the page
 * again, leaves the note for it and returns true; the press then waits for
 * the page to go (`untilReloaded`). False, for the press to say its failure
 * as before: any other error, a reload in the last minute, or storage that
 * can't keep the guard and the note.
 */
export function reloadForRelease(error: unknown): boolean {
  if (!isStaleBuild(error)) return false;
  const now = Date.now();
  try {
    const last = keptTime(sessionStorage.getItem(RELOADED_KEY));
    if (within(last, now, RELOAD_EVERY_MS)) return false;
    sessionStorage.setItem(RELOADED_KEY, String(now));
    sessionStorage.setItem(UPDATED_KEY, String(now));
  } catch {
    // Kept halfway, the note would say an update on a page never loaded.
    try {
      sessionStorage.removeItem(UPDATED_KEY);
    } catch {
      // Nothing kept at all.
    }
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * What a press waits on while its page loads again: nothing comes, so it
 * stays on its way, its button busy, until the page has gone.
 */
export function untilReloaded(): Promise<never> {
  return new Promise<never>(() => {});
}

/**
 * The page was loaded again for a release: true once, for its toast, and the
 * note goes. A note too old to be this page's goes too, and says nothing;
 * so does one that can't be taken away, which would say it at every look.
 */
export function takeUpdatedNote(): boolean {
  try {
    const at = keptTime(sessionStorage.getItem(UPDATED_KEY));
    sessionStorage.removeItem(UPDATED_KEY);
    return within(at, Date.now(), NOTE_FOR_MS);
  } catch {
    return false;
  }
}
