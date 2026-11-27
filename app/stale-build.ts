import { unstable_isUnrecognizedActionError } from "next/navigation";
import { z } from "zod";

/*
 * A screen left open across a release (closing the pilot, PR 1a, and the
 * other screens in PR 1b). A release may give the server actions new ids
 * (Next.js rotates them at most every 14 days, even with nothing changed),
 * and a page from the release before then asks for an action the server no
 * longer has: Next.js says so with an `UnrecognizedActionError`, and until
 * the app was opened again, every press said it failed (an iPhone's
 * home-screen app resumes the old page). The press that meets it loads the
 * page again instead, once a minute at most, and leaves a note so the page
 * loaded says the app was updated and the press is the person's to make
 * again: the app's frame says it (`@/app/release-note`), whichever screen
 * the press was on. The presses that do so are listed in
 * tooling/stale-tab.test.ts. Nothing here presses again by itself: a
 * punch's time is the moment the person pressed, and so is a list item's.
 * The press waits for the page to go, a while at most (`untilReloaded`): a
 * page still here then, its reload stopped, says the press failed, as
 * before. A chat never loads itself again, since what is written would go
 * with the page: its send says the app was updated, with "טעינה מחדש", which
 * keeps the words in the field for the page loaded (`reloadKeepingWords`).
 *
 * A navigation needs none of this: Next.js loads the whole page itself when
 * its answer comes from another release, by its build id. Nor does a press
 * the new release still knows, whose action runs there and is recorded or
 * refused: its answer is handed to the press, which says it, and the page
 * it carries, from another build, is dropped; the page then loads whole
 * because the action reads the page again (`refresh()`, as every press
 * listed does), a moment later, and what the press said goes with it. The
 * page loaded shows what came of the press (the shift running, the
 * availability sent, the item ticked, the request made) and says nothing
 * of it; a refusal is said again by the next press, made on the new page.
 * Decided so in PR 1b: a press can't tell which build answered it, nor that
 * the page is about to load whole, so carrying its words across would mean
 * each screen keeping what it says for a load that may never come, and its
 * "ביטול" can't come along. An action that neither reads the page again nor
 * redirects (the chat's send) leaves the old page as it was, its result
 * taken. next.config.ts sets no deployment id, which would leave the build
 * id out of an action's answer; Vercel's Skew Protection would set one
 * (NEXT_DEPLOYMENT_ID), and needs this checked again before it is turned on.
 *
 * Every mark lives in the tab's sessionStorage, inside try/catch: storage
 * that can't be read or written keeps neither the minute's guard nor the
 * note (the note is written first, and taken away again when the guard
 * can't follow it), so the page isn't loaded again and the press says what
 * it said before. The note names the person whose press it was, and only
 * the frame signed in as them says it: should the reload have gone to the
 * door, the session over, whoever signs in next on that tab is told
 * nothing. So do the chat's words, which only that person's chat at the
 * same address takes back, and which the frame of anyone else lets go.
 * Nothing here imports React, for the tests.
 */

/** sessionStorage: when this tab last loaded itself again for a release. */
export const RELOADED_KEY = "stale-build-reloaded";

/**
 * sessionStorage: the note for the page loaded again, when it was left and
 * for whom, as `<time> <person>`.
 */
export const UPDATED_KEY = "stale-build-updated";

/**
 * sessionStorage: what was written in a chat when "טעינה מחדש" was pressed,
 * for the page loaded again (`KeptWords`, as JSON).
 */
export const WORDS_KEY = "stale-build-words";

/**
 * One reload a minute at most. A page still from the release before after
 * one (a release still on its way, or an old page kept somewhere on the way)
 * says the press failed, as before, rather than loading again at each press.
 */
export const RELOAD_EVERY_MS = 60_000;

/**
 * How long the note waits for the page that says it. One left longer ago
 * (the reload went to the door, the session over, and the same person
 * signed in again later) goes saying nothing, so a screen opened much later
 * doesn't say an update nobody saw. The chat's words wait as long.
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
 * press it was, as the frame has them: `useSignedInId`), and returns true;
 * the press then waits for the page to go (`untilReloaded`), and says its
 * failure if it stays. False, for the press to say its failure as before:
 * any other error, a reload in the last minute, storage that can't keep the
 * guard and the note, or nobody signed in that the press knows of (outside
 * the frame, as in the /design gallery), whom no page could tell.
 */
export function reloadForRelease(
  error: unknown,
  person: string | null,
): boolean {
  if (person === null || person === "" || !isStaleBuild(error)) return false;
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
 * that can't be taken away, which would say it at every look. Only the
 * app's frame takes it (`@/app/release-note`), so one page says it once,
 * whichever screen it shows.
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

/**
 * The chat's words as kept: when, whose, at which address (the page's path,
 * a conversation's own), and what was written. Read back through it, so
 * storage holding anything else (another version's, a hand's) is no words.
 */
const KeptWords = z.object({
  at: z.number().int().positive(),
  person: z.string().min(1),
  where: z.string().startsWith("/"),
  words: z.string().min(1),
});

type KeptWords = z.infer<typeof KeptWords>;

/** The words kept in this tab, as read back; null without any, or unread. */
function keptWords(): KeptWords | null {
  const raw = sessionStorage.getItem(WORDS_KEY);
  if (raw === null) return null;
  try {
    const kept = KeptWords.safeParse(JSON.parse(raw));
    return kept.success ? kept.data : null;
  } catch {
    return null;
  }
}

/**
 * "טעינה מחדש", pressed in a chat whose send met a page from an earlier
 * release: what is written in its field (`words`) is kept for the page
 * loaded again, for `person` at this address, and the page loads again.
 * Pressed, never by itself, so it has no minute's guard: a page still old
 * says so again at the next send. Nothing written, or nobody signed in that
 * the chat knows of, keeps nothing. Storage that refuses keeps nothing
 * either, and the page loads all the same: what the person asked for.
 */
export function reloadKeepingWords(person: string | null, words: string): void {
  try {
    sessionStorage.removeItem(WORDS_KEY);
    if (person !== null && person !== "" && words.trim() !== "") {
      const kept: KeptWords = {
        at: Date.now(),
        person,
        where: window.location.pathname,
        words,
      };
      sessionStorage.setItem(WORDS_KEY, JSON.stringify(kept));
    }
  } catch {
    // Refused: the words go with the page, as a reload always took them.
  }
  window.location.reload();
}

/**
 * The words a chat kept for this page (`reloadKeepingWords`): once, for
 * `person`'s chat at the address they were kept at, within `NOTE_FOR_MS`,
 * and they go. Null otherwise: none; someone else's (a reload that went to
 * the door, and another person signed in), too old, or unread, which go
 * too; another chat's, kept for that one; or storage that can't let them
 * go, which would give them back at every look.
 */
export function takeKeptWords(person: string | null): string | null {
  try {
    const kept = keptWords();
    if (
      kept === null ||
      person === null ||
      kept.person !== person ||
      !within(kept.at, Date.now(), NOTE_FOR_MS)
    ) {
      sessionStorage.removeItem(WORDS_KEY);
      return null;
    }
    if (kept.where !== window.location.pathname) return null;
    sessionStorage.removeItem(WORDS_KEY);
    return kept.words;
  } catch {
    return null;
  }
}

/**
 * The frame opened for `person`: words a chat kept for anyone else go,
 * unsaid, and so do words too old to be taken or that don't read. The
 * person's own, still in time, stay for their chat to take back.
 */
export function forgetOthersWords(person: string): void {
  try {
    const kept = keptWords();
    if (
      kept === null ||
      kept.person !== person ||
      !within(kept.at, Date.now(), NOTE_FOR_MS)
    ) {
      sessionStorage.removeItem(WORDS_KEY);
    }
  } catch {
    // Refused: nothing this frame can do of it.
  }
}
