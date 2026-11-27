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
 * again by itself: a punch's time is the moment the person pressed. The
 * press waits for the page to go, a while at most (`untilReloaded`): a page
 * still here then, its reload stopped, says the press failed, as before.
 *
 * A navigation needs none of this: Next.js loads the whole page itself when
 * its answer comes from another release, by its build id. Nor does a press
 * the new release still knows, whose action runs there: its answer, from
 * another build, is dropped, and the page loads whole only because the
 * action then reads the page again or redirects, as every clock action does
 * (`refresh()`); one that did neither would leave the old page as it was,
 * its result taken. Either way what the press would have said goes with
 * the page, unsaid (PR 1b). next.config.ts sets no deployment id, which
 * would leave the build id out of an action's answer; Vercel's Skew
 * Protection would set one (NEXT_DEPLOYMENT_ID), and needs this checked
 * again before it is turned on.
 *
 * Both marks live in the tab's sessionStorage, inside try/catch: storage
 * that can't be read or written keeps neither the minute's guard nor the
 * note (the note is written first, and taken away again when the guard
 * can't follow it), so the page isn't loaded again and the press says what
 * it said before. The note names the person whose press it was, and only
 * their clock says it: should the reload have gone to the door, the session
 * over, whoever signs in next on that tab is told nothing. Nothing here
 * imports React, for the tests.
 */

/** sessionStorage: when this tab last loaded itself again for a release. */
export const RELOADED_KEY = "stale-build-reloaded";

/**
 * sessionStorage: the note for the page loaded again, when it was left and
 * for whom, as `<time> <person>`.
 */
export const UPDATED_KEY = "stale-build-updated";

/**
 * One reload a minute at most. A page still from the release before after
 * one (a release still on its way, or an old page kept somewhere on the way)
 * says the press failed, as before, rather than loading again at each press.
 */
export const RELOAD_EVERY_MS = 60_000;

/**
 * How long the note waits for the page that says it. One left longer ago
 * (the reload went to the door, the session over, and the same person
 * signed in again later) goes saying nothing, so a clock opened much later
 * doesn't say an update nobody saw.
 */
export const NOTE_FOR_MS = 5 * 60_000;

/**
 * How long a press waits for its page to go. A page still here then (its
 * reload stopped: the browser's stop or Escape, a back gesture, a page kept
 * by the browser and shown again) gives the press back, to say it failed;
 * a wait with no end would keep React's transition open, and with it every
 * later one, the tab bar's and the back gesture's included.
 */
export const RELOAD_WAIT_MS = 15_000;

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
 * again, leaves the note for it, for `person` (the signed-in person whose
 * press it was), and returns true; the press then waits for the page to go
 * (`untilReloaded`), and says its failure if it stays. False, for the press
 * to say its failure as before: any other error, a reload in the last
 * minute, or storage that can't keep the guard and the note.
 */
export function reloadForRelease(error: unknown, person: string): boolean {
  if (!isStaleBuild(error)) return false;
  const now = Date.now();
  try {
    const last = keptTime(sessionStorage.getItem(RELOADED_KEY));
    if (within(last, now, RELOAD_EVERY_MS)) return false;
    // The note first: a guard kept without it would hold the next minute's
    // press back, with no page loaded again.
    sessionStorage.setItem(UPDATED_KEY, `${now} ${person}`);
    sessionStorage.setItem(RELOADED_KEY, String(now));
  } catch {
    // Kept halfway, the note would say an update on a page never loaded.
    try {
      sessionStorage.removeItem(UPDATED_KEY);
    } catch {
      // Refused as well: nothing more this press can do.
    }
    return false;
  }
  window.location.reload();
  return true;
}

/**
 * What a press waits on while its page loads again, its button busy: the
 * page going, or, should it stay, `RELOAD_WAIT_MS`, the page shown again
 * from the browser's keeping, or a step back or forward in its history,
 * whichever comes first. Then it settles, for the press to say it failed,
 * and the note goes, as no page was loaded again to say it; the minute's
 * guard stays, so the next press says the failure rather than loading again.
 */
export function untilReloaded(): Promise<void> {
  return new Promise<void>((resolve) => {
    const stayed = () => {
      clearTimeout(timer);
      window.removeEventListener("pageshow", shownAgain);
      window.removeEventListener("popstate", stayed);
      try {
        sessionStorage.removeItem(UPDATED_KEY);
      } catch {
        // Refused: `takeUpdatedNote`, refused the same, says nothing of it.
      }
      resolve();
    };
    const shownAgain = (event: PageTransitionEvent) => {
      if (event.persisted) stayed();
    };
    const timer = setTimeout(stayed, RELOAD_WAIT_MS);
    window.addEventListener("pageshow", shownAgain);
    window.addEventListener("popstate", stayed);
  });
}

/**
 * The page was loaded again for a release: true once, for its toast, when
 * the note is `person`'s, and the note goes. One for someone else (the
 * reload went to the door, and another person signed in on that tab) goes
 * too, and says nothing; so does one too old to be this page's, and one
 * that can't be taken away, which would say it at every look.
 */
export function takeUpdatedNote(person: string): boolean {
  try {
    const kept = sessionStorage.getItem(UPDATED_KEY) ?? "";
    sessionStorage.removeItem(UPDATED_KEY);
    const cut = kept.indexOf(" ");
    return (
      cut > 0 &&
      kept.slice(cut + 1) === person &&
      within(keptTime(kept.slice(0, cut)), Date.now(), NOTE_FOR_MS)
    );
  } catch {
    return false;
  }
}
