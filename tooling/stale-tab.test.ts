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
};

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
