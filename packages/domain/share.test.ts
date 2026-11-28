import { describe, expect, it } from "vitest";
import { weekDates } from "./availability";
import {
  AVAILABILITY_PATH,
  availabilityLate,
  daysLeftToRight,
  inviteWhatsappHref,
  SCHEDULE_PATH,
  scheduleWeekHref,
  scheduleWeekOf,
  shareText,
  weekRange,
  whatsappHref,
  whatsappToHref,
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

// Inviting from a list, part 2: each person's link, in a chat to their
// number (the plan's 3.6). The person still presses send in WhatsApp.
describe("whatsappToHref", () => {
  const link = "https://example.test/join/AbC-12_xyz";
  const sentence =
    "קפה & בר #1 מזמינים אותך לצוות באפליקציה ConceptApp. הקישור אישי ובתוקף 14 יום.";
  const text = shareText(sentence, link);

  it("opens a chat to the number's digits alone, the text written", () => {
    const href = whatsappToHref("+972501234567", text);
    expect(href.startsWith("https://wa.me/972501234567?text=")).toBe(true);
    const url = new URL(href);
    expect(url.pathname).toBe("/972501234567");
    expect([...url.searchParams.keys()]).toEqual(["text"]);
    expect(textOf(href)).toBe(text);
    // The link on its own line, and nothing a link would cut.
    expect(textOf(href)?.split("\n")).toEqual([sentence, link]);
    expect(href).toContain("%0A");
    expect(href).not.toContain("+");
    expect(href).not.toContain("#");
    expect(href).not.toContain(" ");
  });

  it("takes only a number in E.164, never one as typed", () => {
    for (const phone of [
      "050-123-4567",
      "0501234567",
      "972501234567",
      "+972 50 123 4567",
      "+0501234567",
      "",
      "+97250123456789012",
    ]) {
      expect(() => whatsappToHref(phone, text), phone).toThrow();
    }
  });

  it("names nobody to send it to only without a number (`whatsappHref`)", () => {
    expect(new URL(whatsappHref(text)).pathname).toBe("/");
    expect(new URL(whatsappToHref("+972521234567", text)).pathname).toBe(
      "/972521234567",
    );
  });
});

// Closing the pilot, PR 4: every screen that makes an invite's link sends it
// so, to the number it was made for; a twin's goes to nobody.
describe("inviteWhatsappHref", () => {
  const link = "https://example.test/join/AbC-12_xyz";
  const text = shareText("מסעדת הדגמה מזמינים אותך לצוות.", link);

  it("opens a chat to the invite's number, the text written", () => {
    expect(inviteWhatsappHref(text, "+972500000911")).toBe(
      whatsappToHref("+972500000911", text),
    );
    const href = new URL(inviteWhatsappHref(text, "+972500000911"));
    expect(`${href.origin}${href.pathname}`).toBe("https://wa.me/972500000911");
    expect(href.searchParams.get("text")).toBe(text);
  });

  it("asks whom to send it to with no number to trust, and never throws", () => {
    // A twin's, whose made-up numbers may be someone's.
    expect(inviteWhatsappHref(text, null)).toBe(whatsappHref(text));
    // Anything that isn't E.164 (no screen should hold one).
    for (const phone of ["", "050-000-0911", "0500000911", "972500000911"]) {
      expect(inviteWhatsappHref(text, phone), phone).toBe(whatsappHref(text));
    }
  });
});

describe("shareText", () => {
  it("puts the link on its own line under the sentence", () => {
    expect(
      shareText("  הסידור פורסם.  ", "https://example.test/schedule"),
    ).toBe("הסידור פורסם.\nhttps://example.test/schedule");
  });
});

/** A text's code points in hex, to tell apart what looks the same. */
const codePoints = (text: string) =>
  [...text].map((c) => (c.codePointAt(0) ?? 0).toString(16));

/** Bidi marks, embeddings, overrides and isolates. */
const BIDI = /[\u200e\u200f\u061c\u202a-\u202e\u2066-\u2069]/;

/** A week's range as Intl writes it, before anything is held. */
const intlRange = (locale: string, first: string, last: string) =>
  new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).formatRange(new Date(`${first}T00:00:00Z`), new Date(`${last}T00:00:00Z`));

describe("weekRange", () => {
  it("names a week as the schedule tab does, its days left to right", () => {
    // LRI, "22", the en dash, "28", PDI, then " בנובמבר" as Intl writes it:
    // the first day stands on the left in a right-to-left line.
    expect(codePoints(weekRange("he", weekDates("2026-11-22")))).toEqual([
      "2066",
      "32",
      "32",
      "2013",
      "32",
      "38",
      "2069",
      ...codePoints(" בנובמבר"),
    ]);
  });

  it("holds the days of a week early in the month too", () => {
    expect(codePoints(weekRange("he", weekDates("2026-11-01")))).toEqual([
      "2066",
      "31",
      "2013",
      "37",
      "2069",
      ...codePoints(" בנובמבר"),
    ]);
  });

  it("names both months of a week across two, as Intl writes it", () => {
    const range = weekRange("he", weekDates("2026-11-29"));
    expect(range).toBe("29 בנובמבר–5 בדצמבר");
    expect(range).toBe(intlRange("he", "2026-11-29", "2026-12-05"));
    expect(range).not.toMatch(BIDI);
  });

  it("leaves a week across two years as Intl writes it", () => {
    // "27 דצמבר 2026 – 2 ינואר 2027": the spaced dash reads right as it is.
    const range = weekRange("he", weekDates("2026-12-27"));
    expect(range).toBe(intlRange("he", "2026-12-27", "2027-01-02"));
    expect(range).not.toMatch(BIDI);
  });

  it("follows the locale", () => {
    const range = weekRange("en", weekDates("2026-11-22"));
    expect(range).toMatch(/^November 22\s–\s28$/);
    expect(range).not.toMatch(BIDI);
  });

  it("needs a day", () => {
    expect(() => weekRange("he", [])).toThrow();
  });

  it("keeps its isolates in the message WhatsApp gets", () => {
    const text = shareText(
      `לשבוע ${weekRange("he", weekDates("2026-11-22"))} פורסם.`,
      "https://example.test/schedule?week=2026-11-22",
    );
    const href = whatsappHref(text);
    expect(textOf(href)).toBe(text);
    // LRI and PDI in UTF-8, around the days.
    expect(href).toContain("%E2%81%A622%E2%80%9328%E2%81%A9");
  });
});

describe("daysLeftToRight", () => {
  it("holds only a run of digits, a dash and digits", () => {
    expect(daysLeftToRight("22–28 בנובמבר")).toBe("\u206622–28\u2069 בנובמבר");
    expect(daysLeftToRight("29 בנובמבר–5 בדצמבר")).toBe("29 בנובמבר–5 בדצמבר");
    expect(daysLeftToRight("2026 – 2")).toBe("2026 – 2");
    expect(daysLeftToRight("הסידור פורסם")).toBe("הסידור פורסם");
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
