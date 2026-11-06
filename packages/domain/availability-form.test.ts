import { describe, expect, it } from "vitest";
import {
  dayMonth,
  dayProblems,
  fridayOf,
  parseAvailabilityForm,
  type ShabbatLimits,
  shabbatConflict,
  shabbatLimits,
  suggestedRange,
} from "./availability-form";
import { ISRAEL_TIME_ZONE, ISRAELI_CITIES } from "./shabbat";
import { shabbatTimes } from "./shabbat-times";

// The week of Sunday 1 November 2026; its Shabbat in Tel Aviv: candles
// 16:26, havdalah 17:24 (hebcal's Israeli calendar).
const WEEK = "2026-11-01";
const LIMITS: ShabbatLimits = {
  friday: "2026-11-06",
  candleLighting: "16:26",
  saturday: "2026-11-07",
  havdalah: "17:24",
};

describe("shabbatLimits", () => {
  it("reads candle lighting and havdalah in the business's zone", () => {
    const times = shabbatTimes(ISRAELI_CITIES.telAviv, LIMITS.friday);
    expect(shabbatLimits(times, ISRAEL_TIME_ZONE)).toEqual(LIMITS);
  });

  it("uses Jerusalem's earlier candle lighting", () => {
    const times = shabbatTimes(ISRAELI_CITIES.jerusalem, LIMITS.friday);
    const limits = shabbatLimits(times, ISRAEL_TIME_ZONE);
    expect(limits.candleLighting < LIMITS.candleLighting).toBe(true);
  });

  it("finds the Friday of a week starting on Sunday or Monday", () => {
    expect(fridayOf("2026-11-01")).toBe("2026-11-06");
    expect(fridayOf("2026-11-02")).toBe("2026-11-06");
  });
});

describe("shabbatConflict", () => {
  const on = (day: string, start: string, end: string) => ({ day, start, end });

  it("lets Friday run until candle lighting, not after", () => {
    expect(shabbatConflict(on(LIMITS.friday, "08:00", "16:26"), LIMITS)).toBe(
      null,
    );
    expect(shabbatConflict(on(LIMITS.friday, "08:00", "16:27"), LIMITS)).toBe(
      "friday",
    );
    expect(shabbatConflict(on(LIMITS.friday, "17:00", "23:00"), LIMITS)).toBe(
      "friday",
    );
  });

  it("refuses a Friday range that runs past midnight", () => {
    expect(shabbatConflict(on(LIMITS.friday, "10:00", "01:00"), LIMITS)).toBe(
      "friday",
    );
  });

  it("lets Saturday start from havdalah, not before", () => {
    expect(shabbatConflict(on(LIMITS.saturday, "17:24", "23:30"), LIMITS)).toBe(
      null,
    );
    expect(shabbatConflict(on(LIMITS.saturday, "19:30", "00:30"), LIMITS)).toBe(
      null,
    );
    expect(shabbatConflict(on(LIMITS.saturday, "17:20", "23:30"), LIMITS)).toBe(
      "saturday",
    );
    expect(shabbatConflict(on(LIMITS.saturday, "10:00", "14:00"), LIMITS)).toBe(
      "saturday",
    );
  });

  it("leaves the other days alone, Thursday night included", () => {
    expect(shabbatConflict(on("2026-11-05", "18:00", "02:00"), LIMITS)).toBe(
      null,
    );
    expect(shabbatConflict(on("2026-11-01", "00:00", "23:59"), LIMITS)).toBe(
      null,
    );
  });
});

describe("parseAvailabilityForm", () => {
  const parse = (
    ranges: unknown,
    note: unknown = "",
    limits: ShabbatLimits | null = LIMITS,
  ) => parseAvailabilityForm({ ranges, note }, WEEK, limits);

  it("accepts a week of ranges and trims the note", () => {
    const ranges = [
      { day: "2026-11-01", start: "09:00", end: "17:00" },
      { day: "2026-11-01", start: "19:00", end: "00:30" },
      { day: "2026-11-06", start: "07:30", end: "14:00" },
      { day: "2026-11-07", start: "19:30", end: "23:30" },
    ];
    expect(parse(ranges, "  רק ערבים  ")).toEqual({
      ok: true,
      value: { ranges, note: "רק ערבים" },
    });
  });

  it("accepts an empty week: not available, no note", () => {
    expect(parse([])).toEqual({ ok: true, value: { ranges: [] } });
  });

  it("names the first problem of each range by its index", () => {
    const result = parse([
      { day: "2026-11-02", start: "9:00", end: "17:00" },
      { day: "2026-11-02", start: "12:00", end: "12:00" },
      { day: "2026-11-08", start: "09:00", end: "17:00" },
      { day: "2026-11-06", start: "12:00", end: "18:00" },
      { day: "2026-11-07", start: "12:00", end: "18:00" },
      { day: "2026-11-03", start: "09:00", end: "17:00" },
    ]);
    expect(result).toEqual({
      ok: false,
      errors: {
        ranges: {
          0: "time",
          1: "same",
          2: "outside",
          3: "friday",
          4: "saturday",
        },
      },
    });
  });

  it("marks the later of two overlapping ranges", () => {
    expect(
      parse([
        { day: "2026-11-02", start: "09:00", end: "17:00" },
        { day: "2026-11-02", start: "16:00", end: "20:00" },
      ]),
    ).toEqual({ ok: false, errors: { ranges: { 1: "overlap" } } });
  });

  it("allows Shabbat hours when the business is open on Shabbat", () => {
    const result = parse(
      [
        { day: "2026-11-06", start: "12:00", end: "23:00" },
        { day: "2026-11-07", start: "10:00", end: "16:00" },
      ],
      "",
      null,
    );
    expect(result.ok).toBe(true);
  });

  it("refuses a long note and a malformed list", () => {
    expect(parse([], "א".repeat(301))).toEqual({
      ok: false,
      errors: { note: "tooLong" },
    });
    expect(parse("nope")).toEqual({ ok: false, errors: { form: "invalid" } });
    expect(parse(Array.from({ length: 22 }, () => ({})))).toEqual({
      ok: false,
      errors: { form: "invalid" },
    });
    expect(parse([null])).toEqual({
      ok: false,
      errors: { ranges: { 0: "time" } },
    });
  });
});

describe("dayProblems", () => {
  const check = (
    ranges: { start: string; end: string }[],
    day: string,
    limits: ShabbatLimits | null = LIMITS,
  ) => dayProblems(ranges, day, WEEK, limits);

  it("finds nothing on a day with no hours, or with fine ones", () => {
    expect(check([], "2026-11-02")).toEqual({});
    expect(
      check(
        [
          { start: "09:00", end: "12:00" },
          { start: "18:00", end: "23:00" },
        ],
        "2026-11-02",
      ),
    ).toEqual({});
  });

  it("names each problem by its index", () => {
    expect(
      check(
        [
          { start: "", end: "12:00" },
          { start: "12:00", end: "12:00" },
        ],
        "2026-11-02",
      ),
    ).toEqual({ 0: "time", 1: "same" });
  });

  it("marks the later of two overlapping ranges", () => {
    expect(
      check(
        [
          { start: "09:00", end: "17:00" },
          { start: "16:00", end: "20:00" },
        ],
        "2026-11-02",
      ),
    ).toEqual({ 1: "overlap" });
  });

  it("holds Friday and Saturday to Shabbat's limits", () => {
    expect(check([{ start: "08:00", end: "23:00" }], LIMITS.friday)).toEqual({
      0: "friday",
    });
    expect(check([{ start: "12:00", end: "14:00" }], LIMITS.saturday)).toEqual({
      0: "saturday",
    });
  });

  it("lets a business open on Shabbat use those hours", () => {
    expect(
      check([{ start: "08:00", end: "23:00" }], LIMITS.friday, null),
    ).toEqual({});
  });

  it("finds what the whole form finds when only this day has hours", () => {
    const hours = [
      { start: "12:00", end: "18:00" },
      { start: "17:00", end: "20:00" },
    ];
    const whole = parseAvailabilityForm(
      {
        ranges: hours.map((range) => ({ day: LIMITS.friday, ...range })),
        note: "",
      },
      WEEK,
      LIMITS,
    );
    expect(whole).toEqual({
      ok: false,
      errors: { ranges: check(hours, LIMITS.friday) },
    });
  });

  it("finds an overlap that a problem on another day hides from the form", () => {
    const monday = [
      { start: "09:00", end: "13:00" },
      { start: "12:00", end: "17:00" },
    ];
    const whole = parseAvailabilityForm(
      {
        ranges: [
          ...monday.map((range) => ({ day: "2026-11-02", ...range })),
          { day: LIMITS.friday, start: "08:00", end: "23:00" },
        ],
        note: "",
      },
      WEEK,
      LIMITS,
    );
    expect(whole).toEqual({ ok: false, errors: { ranges: { 2: "friday" } } });
    expect(check(monday, "2026-11-02")).toEqual({ 1: "overlap" });
  });
});

describe("suggestedRange", () => {
  it("offers the usual day, then the usual evening", () => {
    expect(suggestedRange("2026-11-01", false, LIMITS)).toEqual({
      start: "09:00",
      end: "17:00",
    });
    expect(suggestedRange("2026-11-01", true, LIMITS)).toEqual({
      start: "18:00",
      end: "23:00",
    });
  });

  it("ends Friday at 15:00, or at candle lighting when that is earlier", () => {
    expect(suggestedRange(LIMITS.friday, false, LIMITS)).toEqual({
      start: "08:00",
      end: "15:00",
    });
    expect(
      suggestedRange(LIMITS.friday, false, {
        ...LIMITS,
        candleLighting: "14:40",
      }),
    ).toEqual({ start: "08:00", end: "14:40" });
  });

  it("starts Saturday at havdalah", () => {
    expect(suggestedRange(LIMITS.saturday, false, LIMITS)).toEqual({
      start: "17:24",
      end: "23:30",
    });
  });

  it("treats Friday and Saturday as any day when open on Shabbat", () => {
    expect(suggestedRange(LIMITS.friday, false, null)).toEqual({
      start: "09:00",
      end: "17:00",
    });
    expect(suggestedRange(LIMITS.saturday, true, null)).toEqual({
      start: "18:00",
      end: "23:00",
    });
  });

  it("suggests hours that pass the day's own checks", () => {
    for (const day of [LIMITS.friday, LIMITS.saturday, "2026-11-03"]) {
      expect(
        dayProblems([suggestedRange(day, false, LIMITS)], day, WEEK, LIMITS),
      ).toEqual({});
    }
  });
});

describe("dayMonth", () => {
  it("prints day.month without leading zeros", () => {
    expect(dayMonth("2026-11-01")).toBe("1.11");
    expect(dayMonth("2027-01-09")).toBe("9.1");
  });
});
