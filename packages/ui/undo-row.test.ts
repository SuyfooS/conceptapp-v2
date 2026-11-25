import { NextIntlClientProvider } from "next-intl";
import { createElement, createRef, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import { ignoreHeldEnter } from "./focus-after";
import { namedByWords, saidAsItAppears, UndoRow } from "./undo-row";

/*
 * The way back where the person is looking (accessibility, part 1), drawn
 * on the server: still a status for the screens' checks, quiet as it first
 * appears (aria-live="off"), since the page's announcer says it then; after
 * its first effect its role's own status, so a change of its words is heard
 * wherever the focus is and a sheet opened over it hides it (the browser
 * checks that: e2e/design.spec.ts). "ביטול" described by what it undoes, or
 * named with it where its own focus says it (accessibility, part 8); on its
 * way, busy; taking the focus in the removed row's place, it takes no Enter
 * still held down from that press (accessibility, part 5).
 */

/** The props of each Button drawn: a key's handler leaves nothing in the HTML. */
const buttons = vi.hoisted(() => ({
  drawn: [] as { autoFocus?: unknown; onKeyDown?: unknown }[],
}));

vi.mock("./button", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./button")>();
  const { createElement } = await import("react");
  return {
    ...actual,
    Button: (props: Parameters<typeof actual.Button>[0]) => {
      buttons.drawn.push(props);
      return createElement(actual.Button, props);
    },
  };
});

const MESSAGES = { he, en };

function draw(element: ReactElement, locale: "he" | "en" = "he"): string {
  const missing: string[] = [];
  const provider = {
    locale,
    timeZone: "Asia/Jerusalem",
    messages: MESSAGES[locale],
    onError: (error: Error) => {
      missing.push(error.message);
    },
  } as unknown as Parameters<typeof NextIntlClientProvider>[0];
  const html = renderToString(
    createElement(NextIntlClientProvider, provider, element),
  );
  expect(missing).toEqual([]);
  return html;
}

const row = (pending = false) =>
  createElement(UndoRow, {
    message: "Noa Cohen was removed from the team",
    onUndo: () => {},
    pending,
  });

describe("UndoRow", () => {
  for (const [locale, undo] of [
    ["he", he.ui.undoRow.undo],
    ["en", en.ui.undoRow.undo],
  ] as const) {
    it(`appears as a quiet status whose "${undo}" is described by its words (${locale})`, () => {
      const html = draw(row(), locale);
      const root = html.match(/^<div[^>]*>/)?.[0] ?? "";
      expect(root).toContain('role="status"');
      expect(root).toContain('aria-live="off"');
      const words = html.match(
        /<span id="([^"]+)"[^>]*>Noa Cohen was removed from the team<\/span>/,
      );
      expect(words).not.toBeNull();
      const button = html.match(/<button[^>]*>/)?.[0] ?? "";
      expect(button).toContain(`aria-describedby="${words?.[1]}"`);
      expect(html).toMatch(new RegExp(`<button[^>]*>.*${undo}</button>`));
    });
  }

  it("keeps the words of the toasts' undo, so every check still finds it", () => {
    expect(he.ui.undoRow.undo).toBe(he.app.manage.undo);
    expect(en.ui.undoRow.undo).toBe(en.app.manage.undo);
  });

  for (const [locale, words] of [
    ["he", he.ui.undoRow],
    ["en", en.ui.undoRow],
  ] as const) {
    it(`names its "${words.undo}" with its words, its word first, where its own focus says them (${locale})`, () => {
      const focusSays = [
        { autoFocus: true },
        { quiet: true },
        { buttonRef: createRef<HTMLButtonElement>() },
      ];
      for (const props of focusSays) {
        const html = draw(
          createElement(UndoRow, {
            message: "Noa Cohen was removed from the team",
            onUndo: () => {},
            ...props,
          }),
          locale,
        );
        const button = html.match(/<button[^>]*>/)?.[0] ?? "";
        expect(button).toContain(
          `aria-label="${words.undo}: Noa Cohen was removed from the team"`,
        );
        // Not also its description: a screen reader would say them twice.
        expect(button).not.toContain("aria-describedby=");
        // Still a status with its words in sight.
        expect(html).toContain(">Noa Cohen was removed from the team</span>");
      }
    });
  }

  it("is busy while its way back is on its way", () => {
    const button = draw(row(true)).match(/<button[^>]*>/)?.[0] ?? "";
    expect(button).toContain('aria-busy="true"');
    expect(draw(row(false)).match(/<button[^>]*>/)?.[0]).not.toContain(
      "aria-busy=",
    );
  });

  it("lets Enter held down from the press that removed the row undo nothing", () => {
    buttons.drawn.length = 0;
    draw(
      createElement(UndoRow, {
        message: "Noa Cohen was removed from the team",
        onUndo: () => {},
        autoFocus: true,
      }),
    );
    const undo = buttons.drawn.at(-1);
    expect(undo?.autoFocus).toBe(true);
    expect(undo?.onKeyDown).toBe(ignoreHeldEnter);
  });
});

/** A row on the page, as far as saidAsItAppears asks. */
function rowWith(inside: unknown[], rects = 1) {
  return {
    isConnected: true,
    getClientRects: () => ({ length: rects }),
    matches: () => false,
    focus: () => {},
    contains: (node: unknown) => inside.includes(node),
  };
}

describe("what the page's announcer says of an UndoRow as it appears", () => {
  const button = {};
  const elsewhere = {};

  it("says it when the focus is elsewhere", () => {
    expect(
      saidAsItAppears(rowWith([button]), { quiet: false, active: elsewhere }),
    ).toBe(true);
    expect(
      saidAsItAppears(rowWith([button]), { quiet: false, active: null }),
    ).toBe(true);
  });

  it("leaves it to the focus that came in with it, and to a quiet row", () => {
    expect(
      saidAsItAppears(rowWith([button]), { quiet: false, active: button }),
    ).toBe(false);
    expect(
      saidAsItAppears(rowWith([button]), { quiet: true, active: elsewhere }),
    ).toBe(false);
  });

  it("says nothing from the shape of the screen that isn't drawn", () => {
    expect(
      saidAsItAppears(rowWith([button], 0), {
        quiet: false,
        active: elsewhere,
      }),
    ).toBe(false);
    expect(saidAsItAppears(null, { quiet: false, active: elsewhere })).toBe(
      false,
    );
  });
});

describe("whose UndoRow's words are in its button's name", () => {
  it("is a row whose own focus says them: it takes the focus, or the screen brings it there", () => {
    expect(namedByWords({ autoFocus: true })).toBe(true);
    expect(namedByWords({ quiet: true })).toBe(true);
    expect(namedByWords({ buttonRef: createRef<HTMLButtonElement>() })).toBe(
      true,
    );
  });

  it("is not a row with none of them, whose button they describe", () => {
    expect(namedByWords({})).toBe(false);
    expect(namedByWords({ autoFocus: false, quiet: false })).toBe(false);
  });

  it("is a row given its button's ref alone, even one the announcer says as it appears", () => {
    // A screen that brings the focus there itself (a refused way back):
    // the row is said as it appears, and its focus later says the same.
    const buttonRef = createRef<HTMLButtonElement>();
    expect(namedByWords({ autoFocus: false, quiet: false, buttonRef })).toBe(
      true,
    );
  });
});
