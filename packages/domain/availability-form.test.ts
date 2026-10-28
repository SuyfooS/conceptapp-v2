import { describe, expect, it } from "vitest";
import {
  dayMonth,
  fridayOf,
  parseAvailabilityForm,
  type ShabbatLimits,
  shabbatConflict,
  shabbatLimits,
} from "./availability-form";
import { ISRAEL_TIME_ZONE, ISRAELI_CITIES, shabbatTimes } from "./shabbat";

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

describe("dayMonth", () => {
  it("prints day.month without leading zeros", () => {
    expect(dayMonth("2026-11-01")).toBe("1.11");
    expect(dayMonth("2027-01-09")).toBe("9.1");
  });
});
