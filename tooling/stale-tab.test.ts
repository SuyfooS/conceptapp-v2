import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { sourceFiles } from "./boundaries";

// A tab left open after its session ended (signed out in another tab, or the
// session ran out) goes to the door through the router, never by loading the
// whole page again (known issue 21, second review): the router's fetch keeps
// no page for after sign-in, so the next person to sign in on that device
// never lands on the last one's screen, a chat with someone. The proxy keeps
// nothing of a page the app's own sent there either (`isOpenedFromOutside`),
// which covers a browser's own fallback; these keep the app's code from
// leaning on it. Every whole-page load in the app's code is listed with
// where it goes, so a new one fails here until someone decides.

const root = join(__dirname, "..");
const read = (path: string) => readFileSync(join(root, path), "utf8");

/** A page loaded whole from code: reloaded, sent on, or replaced. */
const WHOLE_PAGE =
  /\blocation\s*\.\s*(reload|assign|replace)\s*\(|\blocation(\s*\.\s*href)?\s*=(?!=)/;

/** Each one in the app's code, with where it goes. */
const LISTED: Record<string, string[]> = {
  // Locking a station ends the session and opens the station, a public page.
  "app/(app)/clock/station/lock-station.tsx": [
    "window.location.replace(result.to);",
  ],
  // Signing out ends the session and opens the door, a public page.
  "app/sign-out-form.tsx": ["go: (to) => window.location.replace(to),"],
  // The root layout failed, and the person presses retry: a reload is the
  // one that doesn't depend on what broke. Sent by the app's own page, so the
  // proxy keeps nothing of it.
  "app/global-error.tsx": ["onRetry={() => window.location.reload()}"],
  // A press on a page from the release before (closing the pilot, PR 1a and
  // 1b), then a chat's "טעינה מחדש" after its send met one, pressed: the
  // same page again, for the same person in the same session; the press's
  // once a minute at most, never sent again. The server never ran the
  // press, so nothing ended the session; should it have ended meanwhile, the
  // reload comes from the app's own page, and the proxy keeps nothing of it.
  // Its note is that person's alone (`takeUpdatedNote(userId)`, by the
  // frame), and so are the chat's words (`takeKeptWords`), so whoever signs
  // in next on that tab isn't told a press of theirs wasn't recorded, nor
  // given what someone else wrote.
  "app/stale-build.ts": [
    "window.location.reload();",
    "window.location.reload();",
  ],
};

/**
 * Where a press loads its page again for a release (`reloadForRelease`),
 * and how many times: the clock's own press and a code's punch (PR 1a), a
 * week's availability sent, a list item's change, a swap's step (give away,
 * withdraw, take), and each of waiter mode's writes made at a press, through
 * one wrapper (PR 1b, known issue 37); nowhere else until someone decides. Each waits
 * for the page to go, a while at most, then goes on to its failure should
 * the page stay (a wait with no end would hold every later transition,
 * navigations included). None sends its press again (a punch's time is the
 * person's own press), and each leaves its note for the signed-in person as
 * the frame has them (`useSignedInId`), whom the frame loaded again tells.
 */
const RELOADS_FOR_RELEASE: Record<string, number> = {
  "app/(app)/clock/clock-panel.tsx": 2,
  "app/(app)/schedule/availability/availability-form.tsx": 1,
  "app/(app)/lists/[id]/list-screen.tsx": 1,
  "app/(app)/schedule/shifts/swap-button.tsx": 1,
  "app/(app)/orders/release-writes.ts": 1,
};

/**
 * The presses that keep what was written with them for the page loaded
 * again (`keep`), each under its screen's own name for it, which that
 * screen alone takes back (`takeKept`): the week's availability as marked,
 * a list's typed fields (worked out with no React, for its tests), a
 * takeaway's name (through the wrapper's one caller, for the order's
 * screen).
 */
const KEEPS: Record<string, string> = {
  "app/(app)/schedule/availability/availability-form.tsx": "availability",
  "app/(app)/lists/typed-back.ts": "list",
  "app/(app)/orders/release-writes.ts": "takeaway",
};

/** Where each screen takes back what it kept, and how many times. */
const TAKES: Record<string, number> = {
  "app/(app)/schedule/availability/availability-form.tsx": 1,
  "app/(app)/lists/[id]/list-screen.tsx": 1,
  "app/(app)/orders/order-view.tsx": 1,
};

/** The one that wraps a set of writes, and who hands it the person. */
const WRAPPER = "app/(app)/orders/release-writes.ts";
const WRAPPED_BY = "app/(app)/orders/orders-provider.tsx";

/** Every file of the app's own code, but tests. */
const appCode = () =>
  ["app", "packages", "modules"]
    .flatMap((dir) => sourceFiles(dir, root))
    .filter((file) => !/\.test\.tsx?$/.test(file));

/** Where `call` is written in the app's code, and how many times. */
function callsOf(call: RegExp): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of appCode()) {
    if (file === "app/stale-build.ts") continue;
    const calls = read(file).match(call)?.length ?? 0;
    if (calls > 0) found[file] = calls;
  }
  return found;
}

describe("a whole page loaded from the app's code", () => {
  it("is one of those listed, each going where it says", () => {
    const found: Record<string, string[]> = {};
    for (const file of ["app", "packages", "modules"].flatMap((dir) =>
      sourceFiles(dir, root),
    )) {
      if (/\.test\.tsx?$/.test(file)) continue;
      const lines = read(file)
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => !line.startsWith("//") && !line.startsWith("*"))
        .filter((line) => WHOLE_PAGE.test(line));
      if (lines.length > 0) found[file] = lines;
    }
    expect(found).toEqual(LISTED);
  });

  it("for a release, comes from the presses listed, each waiting for the page to go", () => {
    expect(callsOf(/\breloadForRelease\(/g)).toEqual(RELOADS_FOR_RELEASE);
    for (const [file, calls] of Object.entries(RELOADS_FOR_RELEASE)) {
      const person = file === WRAPPER ? "person" : "signedIn";
      const waits = read(file).match(
        new RegExp(
          `if \\(reloadForRelease\\(error, ${person}(, keep)?\\)\\) await untilReloaded\\(\\);`,
          "g",
        ),
      );
      expect(waits?.length, file).toBe(calls);
    }
  });

  it("for a release, leaves its note for the person the frame was drawn for", () => {
    // Each press takes the person from the frame, whose toast says the note
    // after the reload, so the two are the same by construction (the design
    // twins' screens carry people of their own, the frame Shiran).
    for (const file of Object.keys(RELOADS_FOR_RELEASE)) {
      if (file === WRAPPER) continue;
      expect(read(file), file).toMatch(/const signedIn = useSignedInId\(\);/);
    }
    // The wrapper's one caller hands it the frame's person, and the writes
    // pressed: not a line's fix nor the order's cancel, held for their
    // "ביטול" and sent by its time, which would load the page while the
    // person does something else.
    expect(callsOf(/\breloadOnRelease\(/g)).toEqual({ [WRAPPED_BY]: 1 });
    const provider = read(WRAPPED_BY);
    expect(provider).toMatch(/const signedIn = useSignedInId\(\);/);
    expect(provider).toMatch(
      /const \{ takeBack, cancelLine, compLine, cancelOrder, \.\.\.pressed \} =\s*actions;/,
    );
    expect(provider).toMatch(/reloadOnRelease\(pressed, signedIn[,)]/);
    // Said by the frame alone, once a page: a screen taking the note too
    // would race the frame for it.
    expect(callsOf(/\btakeUpdatedNote\(/g)).toEqual({
      "app/release-note.tsx": 1,
    });
    // And the frame is there, for the app's screens and the design twins',
    // with the business it was drawn for: a note, and what was kept, are
    // that business's alone (`pressedBy`).
    for (const layout of [
      "app/(app)/layout.tsx",
      "app/design/shell/layout.tsx",
    ]) {
      expect(read(layout), layout).toMatch(
        /<ReleaseNote userId=\S+ businessId=\S+>/,
      );
    }
    expect(read("app/release-note.tsx")).toMatch(
      /const person = pressedBy\(userId, businessId\);/,
    );
  });

  it("for a release, keeps what was written with the press for that screen alone", () => {
    for (const [file, of] of Object.entries(KEEPS)) {
      expect(read(file), file).toMatch(new RegExp(`of: (KEPT_LABEL|"${of}")`));
    }
    expect(read(WRAPPER)).toMatch(/export const KEPT_LABEL = "takeaway";/);
    expect(read(WRAPPED_BY)).toMatch(/\{ setLabel: keepLabel \}/);
    expect(callsOf(/\btakeKept\(/g)).toEqual(TAKES);
    // Each screen that takes back tells the frame whether it put it back,
    // which says the screen's words only then (`wordsOnceBack`).
    for (const file of Object.keys(TAKES)) {
      const source = read(file);
      expect(source, file).toMatch(/const frameBack = usePutBack\(\);/);
      expect(source, file).toMatch(
        /\bframeBack\((true|false|ours|back !== null)\);/,
      );
    }
    // And a list keeps nothing for a page that won't show it: its change
    // met the release after the screen was left.
    expect(read("app/(app)/lists/[id]/list-screen.tsx")).toMatch(
      /const keep = onScreen\.current\s*\? typedToKeep\(/,
    );
  });

  it("from a chat, comes only from its own press, keeping what is written", () => {
    // A chat never loads itself again for a release: what is written would
    // go with the page. Its send says the app was updated, and "טעינה מחדש"
    // keeps the field's words for the page loaded, which puts them back.
    expect(callsOf(/\breloadKeepingWords\(/g)).toEqual({
      "app/(app)/chat/conversation-screen.tsx": 1,
    });
    const chat = read("app/(app)/chat/conversation-screen.tsx");
    expect(chat).toMatch(
      /onClick=\{\(\) => reloadKeepingWords\(signedIn, text, announcing\)\}/,
    );
    expect(chat).not.toMatch(/\breloadForRelease\(/);
    expect(callsOf(/\btakeKeptWords\(/g)).toEqual({
      "app/(app)/chat/conversation-screen.tsx": 1,
    });
  });

  it("for an action's answer from another release, comes from Next.js by its build id", () => {
    // With a deployment id set in the config, Next.js leaves its build id
    // out of an action's answer (`maybeAppendBuildIdToRSCPayload`), so an
    // answer from the next release is drawn into the page from the one
    // before instead of being dropped. Vercel's Skew Protection sets
    // NEXT_DEPLOYMENT_ID, which Next.js takes as its deployment id whatever
    // the config says (`config.js`), so this check can't see it: turning it
    // on needs this checked again (next.config.ts, ROADMAP).
    expect(read("next.config.ts")).not.toMatch(/\bdeploymentId\s*:/);
  });

  it("is found however it is written", () => {
    for (const code of [
      "window.location.reload();",
      "location.assign(to);",
      "window.location.replace(to);",
      'window.location.href = "/chat";',
      "window.location = next;",
    ]) {
      expect(WHOLE_PAGE.test(code), code).toBe(true);
    }
    for (const code of [
      "const url = new URL(window.location.href);",
      "if (window.location.href === here) return;",
      "setOrigin(window.location.origin);",
    ]) {
      expect(WHOLE_PAGE.test(code), code).toBe(false);
    }
  });
});

/** A provider's answer to a 401, up to the next branch of its chain. */
function signedOutBranch(file: string): string {
  const source = read(file);
  const at = source.indexOf("=== 401");
  expect(at, file).toBeGreaterThan(-1);
  const end = source.indexOf("} else", at);
  expect(end, file).toBeGreaterThan(at);
  return source.slice(at, end);
}

describe("a sync that finds the session ended", () => {
  it("draws the screen again through the router: the chat's and the orders'", () => {
    const chat = signedOutBranch("app/(app)/chat/chat-provider.tsx");
    expect(chat).toMatch(/\brouter\.refresh\(\);/);
    // Asked again with the failures counted, should the session still be
    // there: the loop goes on.
    expect(chat).toMatch(/askAgain\(\);/);
    expect(chat).toMatch(/s\.failures \+= 1;/);
    expect(chat).not.toMatch(/alive = false/);
    const orders = signedOutBranch("app/(app)/orders/orders-provider.tsx");
    expect(orders).toMatch(/\.refresh\(\);/);
    for (const branch of [chat, orders]) {
      expect(branch).not.toMatch(/location\s*\./);
    }
  });
});
