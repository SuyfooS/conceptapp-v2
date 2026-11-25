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
  shiftHoursOn,
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
    let stuck = 0;
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
          // "הוספת שעות" on the day as it opens: hours the form takes on
          // their own, and beside the day's, whenever any hours could be.
          const next = suggestedRange(day, hours, limits, shifts);
          expect(dayProblems([next], day, WEEK, limits)).toEqual({});
          const added = dayProblems([...hours, next], day, WEEK, limits);
          if (Object.keys(added).length > 0) {
            stuck++;
            expect(roomBeside(hours, day, limits)).toBe(false);
          }
        }
      }
    }
    // The generated shifts reach both edges, and the days with no room for
    // more hours (mostly a Saturday from havdalah past midnight) are few.
    expect(cut).toBeGreaterThan(100);
    expect(split).toBeGreaterThan(10);
    expect(stuck).toBeGreaterThan(10);
    expect(stuck).toBeLessThan(100);
  });
});

describe("shiftHoursOn", () => {
  it("lists each of the day's shifts once, earliest first, in its own hours", () => {
    expect(shiftHoursOn(SUNDAY, LIMITS, RESTAURANT)).toEqual([
      { start: "09:00", end: "16:00" },
      { start: "16:00", end: "23:30" },
    ]);
    expect(shiftHoursOn(LIMITS.friday, LIMITS, RESTAURANT)).toEqual([
      { start: "08:00", end: "14:30" },
    ]);
  });

  it("names a shift Shabbat cuts by its own hours, while the day opens with the cut ones", () => {
    // The restaurant's and the café's Saturday night in summer, and the
    // café's Friday in Jerusalem's December: the sheet's Shabbat line says
    // what can be marked, so the shift keeps the hours the business gave it.
    expect(shiftHoursOn(LIMITS.saturday, SUMMER, RESTAURANT)).toEqual([
      { start: "19:30", end: "00:00" },
    ]);
    expect(suggestedDay(LIMITS.saturday, SUMMER, RESTAURANT)).toEqual([
      { start: "20:21", end: "00:00" },
    ]);
    expect(shiftHoursOn(LIMITS.saturday, SUMMER, CAFE)).toEqual([
      { start: "19:00", end: "01:00" },
    ]);
    expect(shiftHoursOn(LIMITS.friday, JERUSALEM, CAFE)).toEqual([
      { start: "07:00", end: "16:00" },
    ]);
    expect(suggestedDay(LIMITS.friday, JERUSALEM, CAFE)).toEqual([
      { start: "07:00", end: "15:58" },
    ]);
    // Mostly inside Shabbat: still the shift's hours, never a short shift
    // from havdalah or until candle lighting that the business doesn't have.
    const winter: ShiftHours[] = [
      { days: [6], start: "09:00", end: "18:00" },
      { days: [5], start: "12:00", end: "20:00" },
    ];
    expect(shiftHoursOn(LIMITS.saturday, LIMITS, winter)).toEqual([
      { start: "09:00", end: "18:00" },
    ]);
    expect(suggestedDay(LIMITS.saturday, LIMITS, winter)).toEqual([
      { start: "17:24", end: "18:00" },
    ]);
    expect(shiftHoursOn(LIMITS.friday, LIMITS, winter)).toEqual([
      { start: "12:00", end: "20:00" },
    ]);
  });

  it("leaves out a shift wholly inside Shabbat, and lists it when open on Shabbat", () => {
    const saturday: ShiftHours[] = [
      { days: [6], start: "19:30", end: "00:00" },
      { days: [6], start: "09:00", end: "14:00" },
    ];
    expect(shiftHoursOn(LIMITS.saturday, LIMITS, saturday)).toEqual([
      { start: "19:30", end: "00:00" },
    ]);
    expect(shiftHoursOn(LIMITS.saturday, null, saturday)).toEqual([
      { start: "09:00", end: "14:00" },
      { start: "19:30", end: "00:00" },
    ]);
    // Two shifts in the same hours (the floor and the bar) are one line.
    expect(
      shiftHoursOn(SUNDAY, null, [
        { days: [0], start: "16:00", end: "23:30" },
        { days: [0], start: "16:00", end: "23:30" },
      ]),
    ).toEqual([{ start: "16:00", end: "23:30" }]);
  });

  it("is empty where the business has no shift that day, or Shabbat leaves none", () => {
    expect(shiftHoursOn(SUNDAY, LIMITS, [])).toEqual([]);
    expect(shiftHoursOn(LIMITS.saturday, LIMITS, RETAIL)).toEqual([]);
    expect(
      shiftHoursOn(LIMITS.friday, LIMITS, [
        { days: [5], start: "18:00", end: "23:00" },
      ]),
    ).toEqual([]);
  });
});

describe("suggestedRange", () => {
  const range = (start: string, end: string) => ({ start, end });
  const CLOCK: ShiftHours[] = [
    { days: EVERY_DAY, start: "06:00", end: "14:00" },
    { days: EVERY_DAY, start: "14:00", end: "22:00" },
    { days: EVERY_DAY, start: "22:00", end: "06:00" },
  ];

  it("offers the usual day, then the usual evening, where the business has no shifts", () => {
    expect(suggestedRange(SUNDAY, [], LIMITS, [])).toEqual(
      range("09:00", "17:00"),
    );
    expect(
      suggestedRange(SUNDAY, [range("09:00", "17:00")], LIMITS, []),
    ).toEqual(range("18:00", "23:00"));
  });

  it("ends Friday at 15:00, or at candle lighting when that is earlier", () => {
    expect(suggestedRange(LIMITS.friday, [], LIMITS, [])).toEqual(
      range("08:00", "15:00"),
    );
    expect(
      suggestedRange(
        LIMITS.friday,
        [],
        { ...LIMITS, candleLighting: "14:40" },
        [],
      ),
    ).toEqual(range("08:00", "14:40"));
  });

  it("starts Saturday at havdalah", () => {
    expect(suggestedRange(LIMITS.saturday, [], LIMITS, [])).toEqual(
      range("17:24", "23:30"),
    );
  });

  it("treats Friday and Saturday as any day when open on Shabbat", () => {
    expect(suggestedRange(LIMITS.friday, [], null, [])).toEqual(
      range("09:00", "17:00"),
    );
    expect(
      suggestedRange(LIMITS.saturday, [range("09:00", "17:00")], null, []),
    ).toEqual(range("18:00", "23:00"));
  });

  it("starts an empty day with its first suggested range", () => {
    for (const day of [SUNDAY, LIMITS.friday, LIMITS.saturday]) {
      expect(suggestedRange(day, [], LIMITS, RESTAURANT)).toEqual(
        suggestedDay(day, LIMITS, RESTAURANT)[0],
      );
    }
  });

  it("adds what the day's shifts still need, after the day's hours when it can", () => {
    // Narrowed to the first shift: the rest of the day.
    expect(
      suggestedRange(SUNDAY, [range("09:00", "16:00")], LIMITS, RESTAURANT),
    ).toEqual(range("16:00", "23:30"));
    expect(
      suggestedRange(MONDAY, [range("07:00", "15:00")], LIMITS, CAFE),
    ).toEqual(range("15:00", "00:00"));
    expect(
      suggestedRange(TUESDAY, [range("08:00", "15:00")], LIMITS, RETAIL),
    ).toEqual(range("15:00", "22:00"));
    // The usual day, kept from before the form read the shifts: the evening
    // from where it ends, never the café's early morning before it.
    expect(
      suggestedRange(SUNDAY, [range("09:00", "17:00")], LIMITS, RESTAURANT),
    ).toEqual(range("17:00", "23:30"));
    expect(
      suggestedRange(MONDAY, [range("09:00", "17:00")], LIMITS, CAFE),
    ).toEqual(range("17:00", "00:00"));
    // Narrowed to the last shift: the hours before it.
    expect(
      suggestedRange(SUNDAY, [range("16:00", "23:30")], LIMITS, RESTAURANT),
    ).toEqual(range("09:00", "16:00"));
    // A break between shifts is part of the day's hours, as it opens.
    expect(
      suggestedRange(SUNDAY, [range("08:00", "12:00")], null, [
        { days: [0], start: "08:00", end: "12:00" },
        { days: [0], start: "17:00", end: "22:00" },
      ]),
    ).toEqual(range("12:00", "22:00"));
    // Around the clock: the other of the day's two ranges.
    expect(
      suggestedRange(SUNDAY, [range("06:00", "22:00")], null, CLOCK),
    ).toEqual(range("22:00", "06:00"));
    expect(
      suggestedRange(SUNDAY, [range("22:00", "06:00")], null, CLOCK),
    ).toEqual(range("06:00", "22:00"));
  });

  it("adds the usual evening once the day's shifts are taken, where it is free", () => {
    expect(
      suggestedRange(
        LIMITS.friday,
        [range("08:00", "14:30")],
        null,
        RESTAURANT,
      ),
    ).toEqual(range("18:00", "23:00"));
    expect(
      suggestedRange(SUNDAY, [range("08:00", "14:00")], null, [
        { days: [0], start: "08:00", end: "14:00" },
      ]),
    ).toEqual(range("18:00", "23:00"));
  });

  it("adds the day's latest free hours, beside its own, when the usual evening isn't free", () => {
    expect(
      suggestedRange(SUNDAY, [range("09:00", "23:30")], LIMITS, RESTAURANT),
    ).toEqual(range("23:30", "00:00"));
    expect(
      suggestedRange(TUESDAY, [range("08:00", "22:00")], LIMITS, RETAIL),
    ).toEqual(range("22:00", "00:00"));
    // One shift across the usual evening.
    expect(
      suggestedRange(SUNDAY, [range("10:00", "20:00")], null, [
        { days: [0], start: "10:00", end: "20:00" },
      ]),
    ).toEqual(range("20:00", "00:00"));
    // Into the usual evening on a day without shifts: no longer than it.
    expect(suggestedRange(SUNDAY, [range("10:00", "18:30")], null, [])).toEqual(
      range("18:30", "23:30"),
    );
    // A day until midnight: hours before it, no longer than the usual ones.
    expect(
      suggestedRange(
        LIMITS.saturday,
        [range("19:30", "00:00")],
        null,
        RESTAURANT,
      ),
    ).toEqual(range("14:30", "19:30"));
    expect(
      suggestedRange(MONDAY, [range("07:00", "00:00")], LIMITS, CAFE),
    ).toEqual(range("02:00", "07:00"));
    expect(
      suggestedRange(
        SUNDAY,
        [range("06:00", "22:00"), range("22:00", "06:00")],
        null,
        CLOCK,
      ),
    ).toEqual(range("01:00", "06:00"));
    // The café's Saturday cut to midnight: the hour after it would read as
    // the morning, so it isn't offered.
    expect(
      suggestedRange(LIMITS.saturday, [range("19:00", "00:00")], null, CAFE),
    ).toEqual(range("14:00", "19:00"));
    // Inside Shabbat's limits: Friday until candle lighting, Saturday from
    // havdalah.
    expect(
      suggestedRange(
        LIMITS.friday,
        [range("08:00", "14:30")],
        LIMITS,
        RESTAURANT,
      ),
    ).toEqual(range("14:30", "16:26"));
    expect(
      suggestedRange(
        LIMITS.saturday,
        [range("19:30", "00:00")],
        LIMITS,
        RESTAURANT,
      ),
    ).toEqual(range("17:24", "19:30"));
    expect(
      suggestedRange(
        LIMITS.saturday,
        [range("17:24", "23:30")],
        LIMITS,
        RETAIL,
      ),
    ).toEqual(range("23:30", "00:00"));
  });

  it("keeps the usual hours where no hours could join the day's", () => {
    // Summer: the restaurant's Saturday opens from havdalah until midnight,
    // all that a Saturday closed on Shabbat can take.
    const rows = suggestedDay(LIMITS.saturday, SUMMER, RESTAURANT);
    expect(rows).toEqual([range("20:21", "00:00")]);
    expect(roomBeside(rows, LIMITS.saturday, SUMMER)).toBe(false);
    const next = suggestedRange(LIMITS.saturday, rows, SUMMER, RESTAURANT);
    expect(next).toEqual(range("20:21", "23:30"));
    expect(dayProblems([next], LIMITS.saturday, WEEK, SUMMER)).toEqual({});
  });

  it("leaves out hours that aren't whole yet", () => {
    // A time cleared while typing is checked on its own.
    expect(
      suggestedRange(SUNDAY, [range("", "23:30")], LIMITS, RESTAURANT),
    ).toEqual(range("09:00", "23:30"));
    expect(
      suggestedRange(SUNDAY, [range("09:00", "09:00")], LIMITS, RESTAURANT),
    ).toEqual(range("09:00", "23:30"));
  });

  it("adds hours the day takes beside its own, for each template's days as they open and as kept before", () => {
    const days = Array.from({ length: 7 }, (_, n) =>
      new Date(Date.UTC(2026, 10, 1 + n)).toISOString().slice(0, 10),
    );
    for (const shifts of [RESTAURANT, CAFE, RETAIL]) {
      for (const limits of [LIMITS, SUMMER, JERUSALEM, null]) {
        for (const day of days) {
          // The sheet's own steps: the day opens, then "הוספת שעות".
          const rows = suggestedDay(day, limits, shifts);
          const next = suggestedRange(day, rows, limits, shifts);
          // Only a summer Saturday from havdalah to midnight or past it has
          // no room (above).
          const full =
            limits === SUMMER && day === LIMITS.saturday && shifts !== RETAIL;
          expect(dayProblems([...rows, next], day, WEEK, limits)).toEqual(
            full ? { 1: "overlap" } : {},
          );
        }
        // The usual day, kept from before, Sunday to Thursday: joined to it,
        // the added hours cover every shift from 09:00 on.
        for (const [n, day] of days.slice(0, 5).entries()) {
          const kept = [range("09:00", "17:00")];
          const next = suggestedRange(day, kept, limits, shifts);
          expect(dayProblems([...kept, next], day, WEEK, limits)).toEqual({});
          const ranges = [...kept, next].map((r) => ({ day, ...r }));
          for (const shift of shifts.filter((s) => s.days.includes(n))) {
            if (shift.start < "09:00") continue;
            expect(
              availableFor({ day, start: shift.start, end: shift.end }, ranges),
            ).toBe(true);
          }
        }
      }
    }
  });

  it("suggests hours that pass the day's own checks on their own", () => {
    for (const day of [LIMITS.friday, LIMITS.saturday, TUESDAY]) {
      for (const shifts of [[], RESTAURANT, CAFE, RETAIL]) {
        const opening = suggestedDay(day, LIMITS, shifts);
        for (const rows of [[], opening]) {
          expect(
            dayProblems(
              [suggestedRange(day, rows, LIMITS, shifts)],
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

/**
 * Whether any hours at all could join `rows` on `day`, as the form checks
 * them. A minute is enough, since any range the form takes there starts with
 * one, and the earliest such minute, if any, is where the day's hours can
 * start (midnight, or havdalah on a Saturday) or where one of the rows ends:
 * the minute before it is taken by a row, or outside what Shabbat allows.
 */
function roomBeside(
  rows: readonly { start: string; end: string }[],
  day: string,
  limits: ShabbatLimits | null,
): boolean {
  const minuteFrom = (start: string) => {
    const [h = 0, m = 0] = start.split(":").map(Number);
    const next = (h * 60 + m + 1) % (24 * 60);
    return `${String(Math.floor(next / 60)).padStart(2, "0")}:${String(next % 60).padStart(2, "0")}`;
  };
  const starts = ["00:00", ...(limits ? [limits.havdalah] : [])].concat(
    rows.map((r) => r.end),
  );
  return starts.some(
    (start) =>
      Object.keys(
        dayProblems(
          [...rows, { start, end: minuteFrom(start) }],
          day,
          WEEK,
          limits,
        ),
      ).length === 0,
  );
}

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
