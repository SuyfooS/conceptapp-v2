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
 * What a screen had written goes with a page loaded again, so a press that
 * carries it keeps it for the page loaded (`keep`): the week's availability
 * as marked, a list's typed fields, a takeaway's name. That screen puts it
 * back where it was, never saved by itself (`takeKept`), and the note says
 * so in its words. The press waits for the page to go, a while at most
 * (`untilReloaded`): a page still here then, its reload stopped, says the
 * press failed, as before, and lets go of the note and of what it kept. A
 * chat never loads itself again, since what is written would go with the
 * page: its send says the app was updated, with "טעינה מחדש", which keeps
 * the words in the field for the page loaded (`reloadKeepingWords`).
 *
 * A navigation needs none of this: Next.js loads the whole page itself when
 * its answer comes from another release, by its build id. Nor does a press
 * the new release still knows, whose action runs there and is recorded or
 * refused: its answer is handed to the press, which says it, and the page
 * it carries, from another build, is dropped. What comes next depends on
 * the action's path (checked in Next.js 16.4.6, `server-action-reducer.js`).
 * One that reads the page again (`refresh()`) or redirects makes the router
 * read it, that answer's build id differs, and the page loads whole a moment
 * later, what the press said going with it: the clock's presses, recorded
 * or refused, as its action reads the page again before every answer; the
 * availability sent and a swap's step made, on success only; and a list's
 * refusal that moves on, whose screen reads the page again itself
 * (`router.refresh()`). The page loaded shows what came of the press (the
 * shift running, the availability sent, the request made) and says nothing
 * of it; a refusal is said again by the next press, made on the new page.
 * Any other answer leaves the old page as it was, its own words said: a
 * list item's change, whose action reads nothing again; waiter mode's
 * writes; the availability's and the swap's refusals, which answer before
 * reading the page again; and the chat's send. Decided so in PR 1b: a press
 * can't tell which build answered it, nor that the page is about to load
 * whole, so carrying its words across would mean each screen keeping what
 * it says for a load that may never come, and its "ביטול" can't come along.
 * next.config.ts sets no deployment id, which would leave the build id out
 * of an action's answer; Vercel's Skew Protection would set one
 * (NEXT_DEPLOYMENT_ID), and needs this checked again before it is turned on.
 *
 * Every mark lives in the tab's sessionStorage, inside try/catch: storage
 * that can't be read or written keeps neither the minute's guard nor the
 * note nor what a screen kept (the note and what is kept are written first,
 * and taken away again when the guard can't follow them), so the page isn't
 * loaded again and the press says what it said before. The note names the
 * person whose press it was, and only the frame signed in as them says it:
 * should the reload have gone to the door, the session over, whoever signs
 * in next on that tab is told nothing. So does what was kept, which only
 * that person's screen at the same address takes back, and which the frame
 * of anyone else lets go. Nothing here imports React, for the tests.
 */

/** sessionStorage: when this tab last loaded itself again for a release. */
export const RELOADED_KEY = "stale-build-reloaded";

/**
 * sessionStorage: the note for the page loaded again, when it was left, for
 * whom, and in which words when not the press's own, as `<time> <person>`
 * or `<time> <person> <words>`. A note of the release before has no words.
 */
export const UPDATED_KEY = "stale-build-updated";

/**
 * sessionStorage: what a screen had written when its press loaded the page
 * again for a release (`reloadForRelease`'s `keep`), or what a chat's field
 * held when "טעינה מחדש" was pressed, for the page loaded again (`Kept`, as
 * JSON). One at a time: the newest kept takes the place of any before it.
 */
export const KEPT_KEY = "stale-build-kept";

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
 * doesn't say an update nobody saw. What a screen kept waits as long.
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

/**
 * What the page loaded again says, as `app.updated.<words>`: the press
 * wasn't recorded ("toast"); the availability wasn't sent, and what was
 * marked is still on it ("availability"); what was typed wasn't saved, and
 * is back where it was typed ("typed").
 */
export const RELEASE_WORDS = ["toast", "availability", "typed"] as const;

export type ReleaseWords = (typeof RELEASE_WORDS)[number];

/**
 * What a press keeps for the page loaded again: `value`, under `of`, the
 * screen's own name for it, which that screen takes back with its own
 * schema (`takeKept`), and the words the page loaded says of it.
 */
export type KeepForPage = {
  of: string;
  value: unknown;
  words: Exclude<ReleaseWords, "toast">;
};

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
 * What was kept: when, whose, at which address (the page's path), for which
 * screen (`of`), and what. Read back through it, so storage holding anything
 * else (another version's, a hand's) is nothing kept; the screen reads its
 * `value` with its own schema.
 */
const Kept = z.object({
  at: z.number().int().positive(),
  person: z.string().min(1),
  where: z.string().startsWith("/"),
  of: z.string().min(1),
  value: z.unknown(),
});

type Kept = z.infer<typeof Kept>;

/** What is kept in this tab, as read back; null without any, or unread. */
function keptNow(): Kept | null {
  const raw = sessionStorage.getItem(KEPT_KEY);
  if (raw === null) return null;
  try {
    const kept = Kept.safeParse(JSON.parse(raw));
    return kept.success ? kept.data : null;
  } catch {
    return null;
  }
}

/** Keeps `value` for `person`'s screen `of` at this address; throws as storage does. */
function keepHere(person: string, of: string, value: unknown, at: number) {
  const kept: Kept = {
    at,
    person,
    where: window.location.pathname,
    of,
    value,
  };
  sessionStorage.setItem(KEPT_KEY, JSON.stringify(kept));
}

/**
 * A press failed: when its page is from an earlier release, loads the page
 * again, leaves the note for it, for `person` (the signed-in person whose
 * press it was, as the frame has them: `useSignedInId`), keeps what the
 * screen asks to (`keep`, for that screen at this address, whose words the
 * note then gives), and returns true; the press then waits for the page to
 * go (`untilReloaded`), and says its failure if it stays. False, for the
 * press to say its failure as before: any other error, a reload in the last
 * minute, storage that can't keep the guard, the note and what is kept, or
 * nobody signed in that the press knows of (outside the frame, as in the
 * /design gallery), whom no page could tell.
 */
export function reloadForRelease(
  error: unknown,
  person: string | null,
  keep?: KeepForPage,
): boolean {
  if (person === null || person === "" || !isStaleBuild(error)) return false;
  const now = Date.now();
  try {
    const last = keptTime(sessionStorage.getItem(RELOADED_KEY));
    if (within(last, now, RELOAD_EVERY_MS)) return false;
    // What is kept and the note first: a guard kept without them would hold
    // the next minute's press back, with no page loaded again.
    if (keep) keepHere(person, keep.of, keep.value, now);
    sessionStorage.setItem(
      UPDATED_KEY,
      keep ? `${now} ${person} ${keep.words}` : `${now} ${person}`,
    );
    sessionStorage.setItem(RELOADED_KEY, String(now));
  } catch {
    // Kept halfway, the note would say an update on a page never loaded,
    // and what was kept would come back to a screen that never lost it.
    try {
      sessionStorage.removeItem(UPDATED_KEY);
      if (keep) sessionStorage.removeItem(KEPT_KEY);
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
 * and the note goes, as no page was loaded again to say it, and so does
 * what the press kept with it, still on the page that stayed; the minute's
 * guard stays, so the next press says the failure rather than loading again.
 */
export function untilReloaded(): Promise<void> {
  return new Promise<void>((resolve) => {
    const stayed = () => {
      clearTimeout(timer);
      window.removeEventListener("pageshow", shownAgain);
      window.removeEventListener("popstate", stayed);
      try {
        const note = sessionStorage.getItem(UPDATED_KEY);
        sessionStorage.removeItem(UPDATED_KEY);
        // Kept by the same press, at the note's time: anything kept before
        // it waits for its own screen.
        const kept = keptNow();
        if (kept !== null && note?.startsWith(`${kept.at} `)) {
          sessionStorage.removeItem(KEPT_KEY);
        }
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
 * The page was loaded again for a release: once, for its toast, the words
 * it says when the note is `person`'s ("toast" for a note with none, as the
 * release before left it, or with words this release doesn't have), and
 * the note goes. Null otherwise, and the note goes too: one for someone
 * else (the reload went to the door, and another person signed in on that
 * tab), one too old to be this page's, one that doesn't read, and one that
 * can't be taken away, which would say it at every look. Only the app's
 * frame takes it (`@/app/release-note`), so one page says it once,
 * whichever screen it shows.
 */
export function takeUpdatedNote(person: string): ReleaseWords | null {
  try {
    const kept = sessionStorage.getItem(UPDATED_KEY) ?? "";
    sessionStorage.removeItem(UPDATED_KEY);
    const [at = "", whose, words, ...more] = kept.split(" ");
    if (
      whose !== person ||
      more.length > 0 ||
      words === "" ||
      !within(keptTime(at), Date.now(), NOTE_FOR_MS)
    ) {
      return null;
    }
    return RELEASE_WORDS.find((known) => known === words) ?? "toast";
  } catch {
    return null;
  }
}

/**
 * What a screen kept for this page (`reloadForRelease`'s `keep`, or the
 * chat's `reloadKeepingWords`), read with its `schema`: once, for
 * `person`'s screen `of` at the address it was kept at, within
 * `NOTE_FOR_MS`, and it goes. Null otherwise: none; someone else's (a
 * reload that went to the door, and another person signed in), too old, or
 * unread, which go too, as does one the screen's schema doesn't read;
 * another screen's, or one kept at another address, kept for it; or
 * storage that can't let it go, which would give it back at every look.
 * Put back where it was written, never saved by itself.
 */
export function takeKept<T>(
  person: string | null,
  of: string,
  schema: z.ZodType<T>,
): T | null {
  try {
    const kept = keptNow();
    if (
      kept === null ||
      person === null ||
      kept.person !== person ||
      !within(kept.at, Date.now(), NOTE_FOR_MS)
    ) {
      sessionStorage.removeItem(KEPT_KEY);
      return null;
    }
    if (kept.of !== of || kept.where !== window.location.pathname) {
      return null;
    }
    sessionStorage.removeItem(KEPT_KEY);
    const value = schema.safeParse(kept.value);
    return value.success ? value.data : null;
  } catch {
    return null;
  }
}

/** A chat's field as kept: its words, and whether they were an announcement. */
const KeptWords = z.object({
  words: z.string().min(1),
  announce: z.boolean().optional(),
});

/** What a chat's field held across "טעינה מחדש" (`reloadKeepingWords`). */
export type ChatKept = { words: string; announce: boolean };

/**
 * "טעינה מחדש", pressed in a chat whose send met a page from an earlier
 * release: what is written in its field (`words`), and whether it was to go
 * as "הודעה מההנהלה" (`announce`), is kept for the page loaded again, for
 * `person` at this address, and the page loads again. Pressed, never by
 * itself, so it has no minute's guard and leaves no note: a page still old
 * says so again at the next send. Nothing written, or nobody signed in that
 * the chat knows of, keeps nothing, and takes away what was kept before.
 * Storage that refuses keeps nothing either, and the page loads all the
 * same: what the person asked for.
 */
export function reloadKeepingWords(
  person: string | null,
  words: string,
  announce = false,
): void {
  try {
    sessionStorage.removeItem(KEPT_KEY);
    if (person !== null && person !== "" && words.trim() !== "") {
      keepHere(
        person,
        "chat",
        announce ? { words, announce: true } : { words },
        Date.now(),
      );
    }
  } catch {
    // Refused: the words go with the page, as a reload always took them.
  }
  window.location.reload();
}

/**
 * The field a chat kept for this page (`reloadKeepingWords`), as `takeKept`
 * gives it: once, to that person's chat at that address, in time.
 */
export function takeKeptWords(person: string | null): ChatKept | null {
  const kept = takeKept(person, "chat", KeptWords);
  return kept ? { words: kept.words, announce: kept.announce === true } : null;
}

/**
 * The frame opened for `person`: what was kept for anyone else goes,
 * unsaid, and so does what was kept too long ago or doesn't read. The
 * person's own, still in time, stays for their screen to take back.
 */
export function forgetOthersKept(person: string): void {
  try {
    const kept = keptNow();
    if (
      kept === null ||
      kept.person !== person ||
      !within(kept.at, Date.now(), NOTE_FOR_MS)
    ) {
      sessionStorage.removeItem(KEPT_KEY);
    }
  } catch {
    // Refused: nothing this frame can do of it.
  }
}
