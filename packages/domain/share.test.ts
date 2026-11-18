import { describe, expect, it } from "vitest";
import { weekDates } from "./availability";
import {
  AVAILABILITY_PATH,
  availabilityLate,
  SCHEDULE_PATH,
  scheduleWeekHref,
  scheduleWeekOf,
  shareText,
  weekRange,
  whatsappHref,
} from "./share";

// Sunday 22 November 2026 is next week; this week began on the 15th.
const WEEKS = { thisWeek: "2026-11-15", nextWeek: "2026-11-22" };

/** The text WhatsApp reads back from the link. */
const textOf = (href: string) => new URL(href).searchParams.get("text");

describe("whatsappHref", () => {
  it("writes the text and names nobody to send it to", () => {
    const href = whatsappHref("שלום");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    expect(new URL(href).pathname).toBe("/");
    expect(textOf(href)).toBe("שלום");
  });

  it("keeps Hebrew, the line break and what a link would cut", () => {
    const text =
      "הסידור של קפה & בר #1 לשבוע 22–28 בנובמבר פורסם? כן + עוד.\nhttps://example.test/schedule?week=2026-11-22&x=1";
    const href = whatsappHref(text);
    expect(textOf(href)).toBe(text);
    // Spaces and the line break are escaped as WhatsApp reads them.
    expect(href).toContain("%20");
    expect(href).toContain("%0A");
    expect(href).not.toContain("+");
    expect(href).not.toContain("#");
  });
});

describe("shareText", () => {
  it("puts the link on its own line under the sentence", () => {
    expect(
      shareText("  הסידור פורסם.  ", "https://example.test/schedule"),
    ).toBe("הסידור פורסם.\nhttps://example.test/schedule");
  });
});

describe("weekRange", () => {
  it("names a week as the schedule tab does", () => {
    expect(weekRange("he", weekDates("2026-11-22"))).toBe("22–28 בנובמבר");
  });

  it("names both months of a week across two", () => {
    expect(weekRange("he", weekDates("2026-11-29"))).toBe(
      "29 בנובמבר–5 בדצמבר",
    );
  });

  it("follows the locale", () => {
    expect(weekRange("en", weekDates("2026-11-22"))).toMatch(
      /^November 22\s–\s28$/,
    );
  });

  it("needs a day", () => {
    expect(() => weekRange("he", [])).toThrow();
  });
});

describe("scheduleWeekHref", () => {
  it("leads to the schedule tab on the week's first day", () => {
    expect(scheduleWeekHref("2026-11-22")).toBe("/schedule?week=2026-11-22");
    expect(SCHEDULE_PATH).toBe("/schedule");
  });

  it("leads to another tab's path when given one", () => {
    expect(scheduleWeekHref("2026-11-01", "/design/shell/schedule")).toBe(
      "/design/shell/schedule?week=2026-11-01",
    );
  });

  it("takes only a calendar date", () => {
    expect(() => scheduleWeekHref("2026-13-01")).toThrow();
    expect(() => scheduleWeekHref("")).toThrow();
    expect(() => scheduleWeekHref("2026-11-22&x=1")).toThrow();
  });
});

describe("scheduleWeekOf", () => {
  it("names this week and next week by their first day", () => {
    expect(scheduleWeekOf("2026-11-15", WEEKS)).toBe("this");
    expect(scheduleWeekOf("2026-11-22", WEEKS)).toBe("next");
  });

  it("is neither for any other week, or anything else", () => {
    // A link shared before the week turned.
    expect(scheduleWeekOf("2026-11-08", WEEKS)).toBeNull();
    expect(scheduleWeekOf("2026-11-29", WEEKS)).toBeNull();
    // Inside this week, but not its first day.
    expect(scheduleWeekOf("2026-11-17", WEEKS)).toBeNull();
    expect(scheduleWeekOf("next", WEEKS)).toBeNull();
    expect(scheduleWeekOf("", WEEKS)).toBeNull();
    expect(scheduleWeekOf(null, WEEKS)).toBeNull();
    expect(scheduleWeekOf(undefined, WEEKS)).toBeNull();
  });
});

describe("availabilityLate", () => {
  const due = "2026-11-18T16:00:00.000Z";

  it("is not late before the due moment, nor at it", () => {
    expect(availabilityLate(due, new Date("2026-11-18T15:59:00.000Z"))).toBe(
      false,
    );
    expect(availabilityLate(due, new Date(due))).toBe(false);
  });

  it("is late once it has passed", () => {
    expect(availabilityLate(due, new Date("2026-11-18T16:00:01.000Z"))).toBe(
      true,
    );
  });

  it("links to where each person sends their own", () => {
    expect(AVAILABILITY_PATH).toBe("/schedule/availability");
  });
});
