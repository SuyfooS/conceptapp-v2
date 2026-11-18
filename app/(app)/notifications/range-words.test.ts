import type { NotificationLine } from "@domain/notifications";
import { describe, expect, it, vi } from "vitest";
import en from "@/messages/en.json";
import type he from "@/messages/he.json";

vi.mock("server-only", () => ({}));

const { outOfRangeTitle } = await import("./range-words");
const { baseWording } = await import("../wording");

// A reading outside its range in the inbox, and the same line once a reading
// of the item is back inside it (Orel, 17 November 2026): the database marks
// the settled line backInRange (20261117000100_lists_range_settles.sql).

type RangeLine = Extract<NotificationLine, { kind: "lists.out_of_range" }>;
const line = (label: string | null, backInRange: boolean): RangeLine => ({
  kind: "lists.out_of_range",
  name: "פתיחת מטבח",
  label,
  reading: { value: 9, min: 0, max: 5, unit: "°C" },
  backInRange,
});
const english = { messages: en as unknown as typeof he, overrides: {} };

describe("a reading outside its range in words", () => {
  it("names the item and the list while it waits", () => {
    expect(
      outOfRangeTitle(line("מקרר ראשי", false), false, baseWording),
    ).toEqual({
      title: "קריאה מחוץ לטווח בפתיחת מטבח: מקרר ראשי",
      back: false,
    });
    expect(outOfRangeTitle(line(null, false), false, baseWording)).toEqual({
      title: "קריאה מחוץ לטווח בפתיחת מטבח",
      back: false,
    });
  });

  it("says it is back once a reading inside the range settled it", () => {
    expect(outOfRangeTitle(line("מקרר ראשי", true), true, baseWording)).toEqual(
      { title: "הקריאה של מקרר ראשי בפתיחת מטבח חזרה לטווח", back: true },
    );
    expect(outOfRangeTitle(line(null, true), true, baseWording)).toEqual({
      title: "הקריאה בפתיחת מטבח חזרה לטווח",
      back: true,
    });
    expect(outOfRangeTitle(line("Main fridge", true), true, english)).toEqual({
      title: "The reading of Main fridge in פתיחת מטבח is back in range",
      back: true,
    });
  });

  it("reads as it did when settled without the mark, or marked and open", () => {
    // Settled some other way: it doesn't claim the reading is fine.
    expect(
      outOfRangeTitle(line("מקרר ראשי", false), true, baseWording),
    ).toEqual({
      title: "קריאה מחוץ לטווח בפתיחת מטבח: מקרר ראשי",
      back: false,
    });
    // A mark on a line open again never says it either.
    expect(
      outOfRangeTitle(line("מקרר ראשי", true), false, baseWording),
    ).toEqual({
      title: "קריאה מחוץ לטווח בפתיחת מטבח: מקרר ראשי",
      back: false,
    });
  });
});
