import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import { UndoRow } from "./undo-row";

/*
 * The way back where the person is looking (accessibility, part 1), drawn
 * on the server: still a status for the screens' checks, but quiet itself
 * (aria-live="off"), since the page's announcer says it once; "ביטול"
 * described by what it undoes; on its way, busy.
 */

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
    it(`is a quiet status whose "${undo}" is described by its words (${locale})`, () => {
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

  it("is busy while its way back is on its way", () => {
    const button = draw(row(true)).match(/<button[^>]*>/)?.[0] ?? "";
    expect(button).toContain('aria-busy="true"');
    expect(draw(row(false)).match(/<button[^>]*>/)?.[0]).not.toContain(
      "aria-busy=",
    );
  });
});
