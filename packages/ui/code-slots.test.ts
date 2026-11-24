import { NextIntlClientProvider } from "next-intl";
import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
// The words a screen's provider gives it.
import en from "../../messages/en.json";
import he from "../../messages/he.json";
import {
  CodeSlots,
  type CodeSlotsStatus,
  codeSlotsSaid,
  refusalCleared,
} from "./code-slots";

/*
 * What the code's boxes say in their own line (accessibility, part 1): how
 * many digits are in and which, each on its own; after the arrows, the
 * digit the caret is on; the code accepted. The digits never leave the
 * field's line. A screen's own description comes first.
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

// A refused code marks the boxes invalid, read with the screen's why. An
// answer that isn't a refusal (a new code asked for: a check that came back
// idle) clears the mark, so the field the focus comes back to isn't read as
// invalid with no why (accessibility, part 2).
describe("refusalCleared", () => {
  it("clears the mark when the status is back to idle: a check came back, its busy moment drawn or not", () => {
    expect(refusalCleared("pending", "idle")).toBe(true);
    expect(refusalCleared("error", "idle")).toBe(true);
  });

  it("keeps it for a refusal, the code accepted, a check starting, or no change", () => {
    const kept: [CodeSlotsStatus, CodeSlotsStatus][] = [
      ["pending", "error"],
      ["pending", "success"],
      ["error", "pending"],
      ["idle", "pending"],
      ["idle", "error"],
      ["error", "error"],
      ["idle", "idle"],
    ];
    for (const [from, to] of kept) {
      expect(refusalCleared(from, to), `${from} to ${to}`).toBe(false);
    }
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
          `<span id="[^"]+" class="sr-only" aria-live="polite" aria-atomic="true">${words}</span>`,
        ),
      );
    }
  });

  // Its words and its digits are two nodes (`<ltr>`): moving between equal
  // digits changes the place alone, which is said with its digit only when
  // the line is said whole.
  it("says its line whole each time it changes", () => {
    const html = draw(
      createElement(CodeSlots, { name: "code", label: "Code" }),
    );
    const line = html.match(/<span id="[^"]+" class="sr-only"[^>]*>/)?.[0];
    expect(line).toContain('aria-live="polite"');
    expect(line).toContain('aria-atomic="true"');
  });

  // VoiceOver says a description as a hint, after a pause and cut off by
  // the next swipe: why comes first (accessibility, part 2).
  it("is described by the screen's why first, then by its own line", () => {
    const html = draw(
      createElement(CodeSlots, {
        name: "code",
        label: "Code",
        describedBy: "why-refused",
      }),
    );
    const line = html.match(/<span id="([^"]+)" class="sr-only"/)?.[1];
    const field = html.match(/<input type="text"[^>]*>/)?.[0] ?? "";
    expect(field).toContain(`aria-describedby="why-refused ${line}"`);
    const alone = draw(
      createElement(CodeSlots, { name: "code", label: "Code" }),
    );
    const own = alone.match(/<span id="([^"]+)" class="sr-only"/)?.[1];
    expect(alone.match(/<input type="text"[^>]*>/)?.[0]).toContain(
      `aria-describedby="${own}"`,
    );
  });

  // A refusal that keeps the digits (a code too short) is the screen's to
  // mark: the boxes aren't drained or red, the field is invalid.
  it("is marked invalid by the screen apart from the drain, and by a refusal it starts with", () => {
    const field = (props: Partial<Parameters<typeof CodeSlots>[0]>) => {
      const html = draw(
        createElement(CodeSlots, { name: "code", label: "Code", ...props }),
      );
      return {
        input: html.match(/<input type="text"[^>]*>/)?.[0] ?? "",
        status: html.match(/data-status="([^"]+)"/)?.[1],
      };
    };
    const short = field({ invalid: true });
    expect(short.input).toContain('aria-invalid="true"');
    expect(short.status).toBe("idle");
    const refused = field({ status: "error" });
    expect(refused.input).toContain('aria-invalid="true"');
    expect(refused.status).toBe("error");
    for (const status of ["idle", "pending", "success"] as const) {
      expect(field({ status }).input, status).not.toContain("aria-invalid");
    }
  });
});
