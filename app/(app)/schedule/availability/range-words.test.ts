import { createTranslator } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "@/messages/en.json";
import he from "@/messages/he.json";
import { rangeWords } from "./range-words";

/*
 * The hours of a range in the availability form's plain-text words: the
 * name and tooltip of its "×" (`IconButton` puts one label on both), and the
 * line that says they were removed. A tooltip is drawn as plain text in the
 * page's direction, where "09:00–17:00" inside the Hebrew reads "17:00–09:00"
 * unless the range is held left to right in isolates, as `<ltr>` holds it on
 * screen.
 */

const LRI = "⁦";
const PDI = "⁩";

const t = createTranslator({
  locale: "he",
  messages: he,
  namespace: "app.availability",
});
const tEn = createTranslator({
  locale: "en",
  messages: en,
  namespace: "app.availability",
});

const day = { start: "09:00", end: "17:00" };
const night = { start: "22:00", end: "02:00" };

describe("a range's hours in plain words", () => {
  it("names the remove button with the hours held left to right, in order", () => {
    expect(t.markup("removeRange", rangeWords(day))).toBe(
      `הסרת השעות ${LRI}09:00–17:00${PDI}`,
    );
    expect(t.markup("removeRange", rangeWords(night))).toBe(
      `הסרת השעות ${LRI}22:00–02:00${PDI}`,
    );
    expect(tEn.markup("removeRange", rangeWords(day))).toBe(
      `Remove ${LRI}09:00–17:00${PDI}`,
    );
  });

  it("holds the whole range in one isolate, and nothing else", () => {
    const label = t.markup("removeRange", rangeWords(day));
    expect(label.split(LRI)).toHaveLength(2);
    expect(label.split(PDI)).toHaveLength(2);
    const inside = label.slice(label.indexOf(LRI) + 1, label.indexOf(PDI));
    expect(inside).toBe("09:00–17:00");
    // No digit outside it, so no number takes the line's direction.
    expect(label.replace(`${LRI}${inside}${PDI}`, "")).not.toMatch(/\d/);
  });

  it("says the same hours the same way once they are removed", () => {
    expect(t.markup("sheet.removed", rangeWords(day))).toBe(
      `השעות ${LRI}09:00–17:00${PDI} הוסרו.`,
    );
    expect(tEn.markup("sheet.removed", rangeWords(day))).toBe(
      `Removed ${LRI}09:00–17:00${PDI}.`,
    );
  });
});
