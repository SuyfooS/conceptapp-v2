import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import { CodeSlots, codeSlotsSaid } from "./code-slots";

/*
 * What the code's boxes say in their own line (accessibility, part 1): how
 * many digits are in and which, each on its own; after the arrows, the
 * digit the caret is on; the code accepted. The digits never leave the
 * field's line. A screen's own description follows it.
 */

const empty = ["", "", "", "", "", ""];

describe("codeSlotsSaid", () => {
  it("counts none typed", () => {
    expect(
      codeSlotsSaid({
        slots: empty,
        total: 6,
        active: 0,
        moved: false,
        success: false,
      }),
    ).toEqual({ key: "count", filled: 0, total: 6 });
  });

  it("says the digits typed, each on its own, a gap left out", () => {
    expect(
      codeSlotsSaid({
        slots: ["1", "2", "3", "", "", ""],
        total: 6,
        active: 3,
        moved: false,
        success: false,
      }),
    ).toEqual({ key: "typed", filled: 3, total: 6, digits: "1 2 3" });
    expect(
      codeSlotsSaid({
        slots: ["4", "", "7", "", "", ""],
        total: 6,
        active: 1,
        moved: false,
        success: false,
      }),
    ).toEqual({ key: "typed", filled: 2, total: 6, digits: "4 7" });
  });

  it("says the caret's place once it was moved, on a digit or an empty slot", () => {
    const slots = ["1", "2", "", "", "", ""];
    expect(
      codeSlotsSaid({
        slots,
        total: 6,
        active: 1,
        moved: true,
        success: false,
      }),
    ).toEqual({ key: "at", position: 2, total: 6, digit: "2" });
    expect(
      codeSlotsSaid({
        slots,
        total: 6,
        active: 4,
        moved: true,
        success: false,
      }),
    ).toEqual({ key: "atEmpty", position: 5, total: 6 });
  });

  it("says the code was accepted over everything", () => {
    expect(
      codeSlotsSaid({
        slots: ["1", "2", "3", "4", "5", "6"],
        total: 6,
        active: 2,
        moved: true,
        success: true,
      }),
    ).toEqual({ key: "accepted" });
  });
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

describe("CodeSlots", () => {
  it("draws its line with none typed, in Hebrew and in English", () => {
    for (const [locale, words] of [
      ["he", "0 מתוך 6 ספרות"],
      ["en", "0 of 6 digits"],
    ] as const) {
      const html = draw(
        createElement(CodeSlots, { name: "code", label: "Code" }),
        locale,
      );
      expect(html).toMatch(
        new RegExp(
          `<span id="[^"]+" class="sr-only" aria-live="polite">${words}</span>`,
        ),
      );
    }
  });

  it("is described by its line first, then by the screen's", () => {
    const html = draw(
      createElement(CodeSlots, {
        name: "code",
        label: "Code",
        describedBy: "why-refused",
      }),
    );
    const line = html.match(/<span id="([^"]+)" class="sr-only"/)?.[1];
    const field = html.match(/<input type="text"[^>]*>/)?.[0] ?? "";
    expect(field).toContain(`aria-describedby="${line} why-refused"`);
    const alone = draw(
      createElement(CodeSlots, { name: "code", label: "Code" }),
    );
    const own = alone.match(/<span id="([^"]+)" class="sr-only"/)?.[1];
    expect(alone.match(/<input type="text"[^>]*>/)?.[0]).toContain(
      `aria-describedby="${own}"`,
    );
  });
});
