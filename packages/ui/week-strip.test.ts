import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { type WeekDay, WeekStrip } from "./week-strip";

/*
 * A day's note in words (accessibility, part 3): Friday's "16:23" alone says
 * nothing to a screen reader, so the strip reads the words a screen passes
 * (`noteLabel`, "כניסת שבת 16:23") in its place, and only shows the time.
 */

const strip = (days: WeekDay[]) =>
  renderToString(
    createElement(WeekStrip, {
      days,
      value: days[0]?.key ?? "",
      onChange: () => {},
      label: "Days",
    }),
  );

const friday: WeekDay = { key: "fri", label: "F", date: "23", note: "16:23" };

describe("WeekStrip", () => {
  it("reads a note's words in its place, the time only shown", () => {
    const html = strip([{ ...friday, noteLabel: "Candle lighting 16:23" }]);
    expect(html).toMatch(
      /<span dir="ltr" aria-hidden="true"[^>]*>16:23<\/span>/,
    );
    expect(html).toContain(
      '<span class="sr-only">Candle lighting 16:23</span>',
    );
  });

  it("reads a note with no words as it shows", () => {
    const html = strip([friday]);
    expect(html).toMatch(/<span dir="ltr" class="[^"]*">16:23<\/span>/);
    // The strip's own name is its legend's; no day reads words of its own.
    expect(html).not.toContain('<span class="sr-only">');
  });

  it("says nothing for words with no note", () => {
    const html = strip([
      { key: "sun", label: "S", date: "18", noteLabel: "Nothing" },
    ]);
    expect(html).not.toContain("Nothing");
  });
});
