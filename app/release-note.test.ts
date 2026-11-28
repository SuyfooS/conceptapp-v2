import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import he from "@/messages/he.json";
import { ReleaseNote, useSignedInId } from "./release-note";
import { pressedBy } from "./stale-build";

/*
 * The app's frame for a release (closing the pilot, PR 1b), drawn on the
 * server as a page first is: the presses under it are handed the person it
 * was drawn for, in the business it was drawn for (`pressedBy`), the one
 * its toast speaks to after a reload, and nothing
 * wraps the screen nor comes after it: a page not loaded again for a release
 * has no status region of the frame's, beside the screen's own (specs look
 * for "the" status). What it says after the reload runs in the browser
 * (e2e/clock-release.spec.ts and e2e/release.spec.ts); the note it takes is
 * app/stale-build.test.ts's.
 */

const PERSON = "6a000000-0000-4000-a000-00000000000a";
const BUSINESS = "b1000000-0000-4000-a000-000000000001";

/** What a press under the frame would leave its note for. */
function Pressing() {
  return createElement("output", null, useSignedInId() ?? "nobody");
}

function draw(tree: ReactNode): string {
  const provider = {
    locale: "he",
    timeZone: "Asia/Jerusalem",
    messages: he,
    children: tree,
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  return renderToString(createElement(NextIntlClientProvider, provider));
}

describe("the app's frame for a release", () => {
  it("hands its presses the person it was drawn for, in its business", () => {
    const html = draw(
      createElement(
        ReleaseNote,
        { userId: PERSON, businessId: BUSINESS },
        createElement(Pressing),
      ),
    );
    expect(html).toContain(`<output>${pressedBy(PERSON, BUSINESS)}</output>`);
    expect(pressedBy(PERSON, BUSINESS)).toBe(`${PERSON}:${BUSINESS}`);
  });

  it("hands nobody to a press outside a frame", () => {
    expect(draw(createElement(Pressing))).toContain("<output>nobody</output>");
  });

  it("draws the screen alone, unwrapped, with no status region of its own", () => {
    const html = draw(
      createElement(
        ReleaseNote,
        { userId: PERSON, businessId: BUSINESS },
        createElement("main", null, "screen"),
      ),
    );
    expect(html).toBe("<main>screen</main>");
    expect(html).not.toContain(he.app.updated.toast);
  });
});
