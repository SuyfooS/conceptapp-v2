import type { Wording } from "@domain/wording";
import { NextIntlClientProvider, useMessages } from "next-intl";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import he from "@/messages/he.json";
import { WordingProvider } from "./wording-provider";

// A business's sentences in the browser (`WordingProvider`), around the
// console's people and its "הוספת אדם" form, and around the app: a page read
// again (`refresh()` after a link is made, `revalidatePath` after an invite)
// reads the business's sentences again too, and one saved or cleared
// meanwhile (in another tab, on the wording page) turns none into some, or
// back. The element it draws stays the same, so React keeps what is under it
// (each link's state, the form's done card) and never draws it anew (closing
// the pilot, PR 4, after the second review).

const MESSAGE = "app.team.pending.message";
const CLINIC = "{business} מזמינים אותך לצוות. הקישור אישי ובתוקף 14 יום.";

/** Draws `child` under the page's words, as the app's root provider gives them. */
function drawn(child: ReactNode) {
  return renderToString(
    createElement(
      NextIntlClientProvider,
      {
        locale: "he",
        timeZone: "Asia/Jerusalem",
        messages: he,
      } as unknown as Parameters<typeof NextIntlClientProvider>[0],
      child,
    ),
  );
}

/**
 * Hands `seen` what WordingProvider draws in its place for these sentences:
 * its element's type. Its hooks run here, as they would in its own.
 */
function Probe({
  overrides,
  seen,
}: {
  overrides: Wording;
  seen: (type: unknown) => void;
}) {
  const element = WordingProvider({ overrides, children: null });
  seen(isValidElement(element) ? element.type : element);
  return null;
}

/**
 * The team's sentence as the words under it hold it. Read from the
 * messages, never a translator: tooling/wording-guard.test.ts keeps those
 * out of every file here that isn't a client one.
 */
function Child() {
  return (useMessages() as typeof he).app.team.pending.message;
}

/** What WordingProvider draws in its place for these sentences: its element's type. */
function drawnFor(overrides: Wording): unknown {
  let type: unknown;
  drawn(
    createElement(Probe, {
      overrides,
      seen: (drawnType) => {
        type = drawnType;
      },
    }),
  );
  return type;
}

/** The sentence a child reads under these sentences. */
function sentence(overrides: Wording) {
  return drawn(
    createElement(
      WordingProvider,
      // Its child goes in as createElement's own argument.
      { overrides } as Parameters<typeof WordingProvider>[0],
      createElement(Child),
    ),
  );
}

describe("a business's sentences in the browser", () => {
  it("draw the same element with none as with some, so what is under it keeps its state", () => {
    const none = drawnFor({});
    expect(none).toBe(drawnFor({ [MESSAGE]: CLINIC }));
    expect(none).not.toBeNull();
  });

  it("are the page's own with none, and the business's in their place", () => {
    expect(sentence({})).toBe(he.app.team.pending.message);
    expect(sentence({ [MESSAGE]: CLINIC })).toBe(CLINIC);
  });
});
