import { describe, expect, it } from "vitest";
import {
  dayMonth,
  dayProblems,
  fridayOf,
  parseAvailabilityForm,
  type ShabbatLimits,
  type ShiftHours,
  shabbatConflict,
  shabbatLimits,
  shiftHoursOf,
  suggestedDay,
  suggestedRange,
} from "./availability-form";
import { availableFor } from "./schedule";
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

// The templates' shifts (supabase/migrations/20261017000100_templates.sql,
// 20261107000800_templates_for_every_business.sql), as the form reads them.
const RESTAURANT: ShiftHours[] = [
  { days: [0, 1, 2, 3, 4], start: "09:00", end: "16:00" },
  { days: [0, 1, 2, 3, 4], start: "16:00", end: "23:30" },
  { days: [5], start: "08:00", end: "14:30" },
  { days: [6], start: "19:30", end: "00:00" },
];
const CAFE: ShiftHours[] = [
  { days: [0, 1, 2, 3, 4], start: "07:00", end: "15:00" },
  { days: [0, 1, 2, 3, 4], start: "15:00", end: "00:00" },
  { days: [5], start: "07:00", end: "16:00" },
  { days: [6], start: "19:00", end: "01:00" },
];
const RETAIL: ShiftHours[] = [
  { days: [0, 1, 2, 3, 4], start: "08:00", end: "15:00" },
  { days: [0, 1, 2, 3, 4], start: "15:00", end: "22:00" },
  { days: [5], start: "08:00", end: "14:00" },
];
const EVERY_DAY = [0, 1, 2, 3, 4, 5, 6];
// Summer's havdalah after the restaurant's 19:30, and Jerusalem's December
// candle lighting before the café's Friday ends (the fill plan's risk 2).
const SUMMER: ShabbatLimits = { ...LIMITS, havdalah: "20:21" };
const JERUSALEM: ShabbatLimits = { ...LIMITS, candleLighting: "15:58" };
const SUNDAY = WEEK;
const MONDAY = "2026-11-02";
const TUESDAY = "2026-11-03";

describe("shiftHoursOf", () => {
  it("keeps a shift's days and hours, never its name or how many it needs", () => {
    expect(
      shiftHoursOf([
        {
          key: "morning",
          name: "בוקר",
          days: [0, 1],
          start: "09:00",
          end: "16:00",
          needed: 3,
        },
      ]),
    ).toEqual([{ days: [0, 1], start: "09:00", end: "16:00" }]);
  });
});

describe("suggestedDay", () => {
  it("spans the business's shifts that day, from the earliest start to the latest end", () => {
    expect(suggestedDay(SUNDAY, LIMITS, RESTAURANT)).toEqual([
      { start: "09:00", end: "23:30" },
    ]);
    // An end at midnight, and one past it, as the ranges allow.
    expect(suggestedDay(MONDAY, LIMITS, CAFE)).toEqual([
      { start: "07:00", end: "00:00" },
    ]);
    expect(suggestedDay(LIMITS.saturday, null, CAFE)).toEqual([
      { start: "19:00", end: "01:00" },
    ]);
    expect(suggestedDay(TUESDAY, LIMITS, RETAIL)).toEqual([
      { start: "08:00", end: "22:00" },
    ]);
    // A break between two shifts is inside it: free for both.
    expect(
      suggestedDay(SUNDAY, null, [
        { days: [0], start: "17:00", end: "22:00" },
        { days: [0], start: "08:00", end: "12:00" },
      ]),
    ).toEqual([{ start: "08:00", end: "22:00" }]);
    // Only the shifts of that weekday count.
    expect(
      suggestedDay(MONDAY, null, [
        { days: [0], start: "06:00", end: "10:00" },
        { days: [1], start: "12:00", end: "18:00" },
      ]),
    ).toEqual([{ start: "12:00", end: "18:00" }]);
  });

  it("cuts Friday's shifts at candle lighting and Saturday's at havdalah, each before spanning", () => {
    expect(suggestedDay(LIMITS.friday, LIMITS, RESTAURANT)).toEqual([
      { start: "08:00", end: "14:30" },
    ]);
    expect(suggestedDay(LIMITS.friday, LIMITS, CAFE)).toEqual([
      { start: "07:00", end: "16:00" },
    ]);
    expect(suggestedDay(LIMITS.friday, JERUSALEM, CAFE)).toEqual([
      { start: "07:00", end: "15:58" },
    ]);
    expect(suggestedDay(LIMITS.saturday, LIMITS, RESTAURANT)).toEqual([
      { start: "19:30", end: "00:00" },
    ]);
    expect(suggestedDay(LIMITS.saturday, SUMMER, RESTAURANT)).toEqual([
      { start: "20:21", end: "00:00" },
    ]);
    expect(suggestedDay(LIMITS.saturday, SUMMER, CAFE)).toEqual([
      { start: "20:21", end: "01:00" },
    ]);
    // A shift wholly inside Shabbat is left out, so the day starts with the
    // evening, not at havdalah.
    expect(
      suggestedDay(LIMITS.saturday, LIMITS, [
        { days: [6], start: "09:00", end: "14:00" },
        { days: [6], start: "19:30", end: "00:00" },
      ]),
    ).toEqual([{ start: "19:30", end: "00:00" }]);
    // A Friday night ends at candle lighting.
    expect(
      suggestedDay(LIMITS.friday, LIMITS, [
        { days: [5], start: "06:00", end: "02:00" },
      ]),
    ).toEqual([{ start: "06:00", end: "16:26" }]);
  });

  it("treats Friday and Saturday as any day when open on Shabbat", () => {
    expect(suggestedDay(LIMITS.friday, null, CAFE)).toEqual([
      { start: "07:00", end: "16:00" },
    ]);
    expect(suggestedDay(LIMITS.saturday, null, RESTAURANT)).toEqual([
      { start: "19:30", end: "00:00" },
    ]);
  });

  it("offers the usual day where the business has no shift that day, or Shabbat leaves none", () => {
    // No shifts at all: the general template's, until it adds some.
    expect(suggestedDay(SUNDAY, LIMITS, [])).toEqual([
      { start: "09:00", end: "17:00" },
    ]);
    expect(suggestedDay(LIMITS.friday, LIMITS, [])).toEqual([
      { start: "08:00", end: "15:00" },
    ]);
    expect(suggestedDay(LIMITS.saturday, LIMITS, [])).toEqual([
      { start: "17:24", end: "23:30" },
    ]);
    // The shop has no Saturday shift.
    expect(suggestedDay(LIMITS.saturday, LIMITS, RETAIL)).toEqual([
      { start: "17:24", end: "23:30" },
    ]);
    expect(suggestedDay(LIMITS.saturday, null, RETAIL)).toEqual([
      { start: "09:00", end: "17:00" },
    ]);
    // Every shift that day inside Shabbat.
    expect(
      suggestedDay(LIMITS.friday, LIMITS, [
        { days: [5], start: "18:00", end: "23:00" },
      ]),
    ).toEqual([{ start: "08:00", end: "15:00" }]);
    expect(
      suggestedDay(LIMITS.saturday, LIMITS, [
        { days: [6], start: "09:00", end: "14:00" },
      ]),
    ).toEqual([{ start: "17:24", end: "23:30" }]);
  });

  it("gives shifts around the clock two ranges that meet at the last shift's start", () => {
    // A range is shorter than a day; joined, the two cover it all.
    expect(
      suggestedDay(SUNDAY, null, [
        { days: EVERY_DAY, start: "07:00", end: "19:00" },
        { days: EVERY_DAY, start: "19:00", end: "07:00" },
      ]),
    ).toEqual([
      { start: "07:00", end: "19:00" },
      { start: "19:00", end: "07:00" },
    ]);
    expect(
      suggestedDay(SUNDAY, null, [
        { days: EVERY_DAY, start: "06:00", end: "14:00" },
        { days: EVERY_DAY, start: "14:00", end: "22:00" },
        { days: EVERY_DAY, start: "22:00", end: "06:00" },
      ]),
    ).toEqual([
      { start: "06:00", end: "22:00" },
      { start: "22:00", end: "06:00" },
    ]);
    // More than a day.
    expect(
      suggestedDay(SUNDAY, null, [
        { days: [0], start: "08:00", end: "20:00" },
        { days: [0], start: "20:00", end: "09:00" },
      ]),
    ).toEqual([
      { start: "08:00", end: "20:00" },
      { start: "20:00", end: "09:00" },
    ]);
    // A minute short of a day is still one range.
    expect(
      suggestedDay(SUNDAY, null, [
        { days: [0], start: "07:00", end: "19:00" },
        { days: [0], start: "19:00", end: "06:59" },
      ]),
    ).toEqual([{ start: "07:00", end: "06:59" }]);
  });

  it("covers every shift Shabbat leaves whole, in hours the form takes, for the templates and any shifts", () => {
    const random = mulberry32(2026);
    const time = (minutes: number) =>
      `${String(Math.floor(minutes / 60) % 24).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
    const generated = Array.from({ length: 60 }, (): ShiftHours[] =>
      Array.from({ length: 1 + Math.floor(random() * 4) }, () => {
        const start = Math.floor(random() * 96) * 15;
        // From a quarter of an hour to a quarter short of a day.
        const length = (1 + Math.floor(random() * 94)) * 15;
        return {
          days: EVERY_DAY.filter(() => random() < 0.6),
          start: time(start),
          end: time(start + length),
        };
      }).filter((shift) => shift.days.length > 0),
    );
    const weekDays = Array.from({ length: 7 }, (_, n) =>
      new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10),
    );
    let cut = 0;
    let split = 0;
    for (const shifts of [RESTAURANT, CAFE, RETAIL, ...generated]) {
      for (const limits of [LIMITS, SUMMER, JERUSALEM, null]) {
        for (const [n, day] of weekDays.entries()) {
          const hours = suggestedDay(day, limits, shifts);
          if (hours.length > 1) split++;
          expect(hours.length).toBeLessThanOrEqual(2);
          // Hours the form sends as they are: no problem, no overlap.
          expect(dayProblems(hours, day, WEEK, limits)).toEqual({});
          const ranges = hours.map((h) => ({ day, ...h }));
          for (const shift of shifts.filter((s) => s.days.includes(n))) {
            const on = { day, start: shift.start, end: shift.end };
            const whole = !limits || shabbatConflict(on, limits) === null;
            if (!whole) cut++;
            // Covered whole exactly when Shabbat doesn't cut it.
            expect(availableFor(on, ranges)).toBe(whole);
          }
          // The second range a day takes passes on its own too.
          const next = suggestedRange(day, true, limits, shifts);
          expect(dayProblems([next], day, WEEK, limits)).toEqual({});
        }
      }
    }
    // The generated shifts reach both edges.
    expect(cut).toBeGreaterThan(100);
    expect(split).toBeGreaterThan(10);
  });
});

describe("suggestedRange", () => {
  it("offers the usual day, then the usual evening, where the business has no shifts", () => {
    expect(suggestedRange("2026-11-01", false, LIMITS, [])).toEqual({
      start: "09:00",
      end: "17:00",
    });
    expect(suggestedRange("2026-11-01", true, LIMITS, [])).toEqual({
      start: "18:00",
      end: "23:00",
    });
  });

  it("ends Friday at 15:00, or at candle lighting when that is earlier", () => {
    expect(suggestedRange(LIMITS.friday, false, LIMITS, [])).toEqual({
      start: "08:00",
      end: "15:00",
    });
    expect(
      suggestedRange(
        LIMITS.friday,
        false,
        { ...LIMITS, candleLighting: "14:40" },
        [],
      ),
    ).toEqual({ start: "08:00", end: "14:40" });
  });

  it("starts Saturday at havdalah", () => {
    expect(suggestedRange(LIMITS.saturday, false, LIMITS, [])).toEqual({
      start: "17:24",
      end: "23:30",
    });
  });

  it("treats Friday and Saturday as any day when open on Shabbat", () => {
    expect(suggestedRange(LIMITS.friday, false, null, [])).toEqual({
      start: "09:00",
      end: "17:00",
    });
    expect(suggestedRange(LIMITS.saturday, true, null, [])).toEqual({
      start: "18:00",
      end: "23:00",
    });
  });

  it("starts an empty day with its first suggested range", () => {
    for (const day of [SUNDAY, LIMITS.friday, LIMITS.saturday]) {
      expect(suggestedRange(day, false, LIMITS, RESTAURANT)).toEqual(
        suggestedDay(day, LIMITS, RESTAURANT)[0],
      );
    }
  });

  it("adds the day's last shift once the day has hours", () => {
    expect(suggestedRange(SUNDAY, true, LIMITS, RESTAURANT)).toEqual({
      start: "16:00",
      end: "23:30",
    });
    expect(suggestedRange(MONDAY, true, LIMITS, CAFE)).toEqual({
      start: "15:00",
      end: "00:00",
    });
    expect(suggestedRange(TUESDAY, true, LIMITS, RETAIL)).toEqual({
      start: "15:00",
      end: "22:00",
    });
    // Around the clock: the second of the day's two ranges.
    expect(
      suggestedRange(SUNDAY, true, null, [
        { days: EVERY_DAY, start: "06:00", end: "14:00" },
        { days: EVERY_DAY, start: "14:00", end: "22:00" },
        { days: EVERY_DAY, start: "22:00", end: "06:00" },
      ]),
    ).toEqual({ start: "22:00", end: "06:00" });
  });

  it("adds the usual hours on a day with one shift, whose suggestion it is already", () => {
    expect(suggestedRange(LIMITS.friday, true, null, RESTAURANT)).toEqual({
      start: "18:00",
      end: "23:00",
    });
    expect(suggestedRange(LIMITS.friday, true, LIMITS, RESTAURANT)).toEqual({
      start: "08:00",
      end: "15:00",
    });
    expect(suggestedRange(LIMITS.saturday, true, LIMITS, CAFE)).toEqual({
      start: "17:24",
      end: "23:30",
    });
  });

  it("suggests hours that pass the day's own checks", () => {
    for (const day of [LIMITS.friday, LIMITS.saturday, "2026-11-03"]) {
      for (const shifts of [[], RESTAURANT, CAFE, RETAIL]) {
        for (const hasHours of [false, true]) {
          expect(
            dayProblems(
              [suggestedRange(day, hasHours, LIMITS, shifts)],
              day,
              WEEK,
              LIMITS,
            ),
          ).toEqual({});
        }
      }
    }
  });
});

/** A small seeded generator (mulberry32), so a failing case can be found again. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("dayMonth", () => {
  it("prints day.month without leading zeros", () => {
    expect(dayMonth("2026-11-01")).toBe("1.11");
    expect(dayMonth("2027-01-09")).toBe("9.1");
  });
});
