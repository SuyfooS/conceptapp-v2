import { describe, expect, it } from "vitest";
import { dateIn } from "./availability";
import {
  ONE_OFF_REST_DAYS,
  PAID_HOLIDAYS,
  type PayrollCalendar,
  paidHolidayDates,
  payrollCalendar,
  type Window,
} from "./payroll-calendar";
import { PAYROLL_READINGS } from "./payroll-readings";
import { ISRAELI_CITIES, timeIn } from "./shabbat";

/*
 * The calendar payroll pays by, pinned to the dates and Tel Aviv times of
 * payroll plan §2 (hebcal 6.14.6, candle lighting 20 minutes before sunset,
 * havdalah at 8.5°; worked out again with the plan's `payplan/ref.mjs`).
 */

const TZ = "Asia/Jerusalem";
const CANDLE = {
  restStart: "candleLighting",
  restStartTime: "14:00",
} as const;

const local = (ms: number) =>
  `${dateIn(new Date(ms), TZ)} ${timeIn(new Date(ms), TZ)}`;
const shown = (window: Window) => [local(window.from), local(window.to)];

const year5787: PayrollCalendar = payrollCalendar(
  ISRAELI_CITIES.telAviv,
  "2026-09-01",
  "2027-08-31",
  CANDLE,
);

describe("the paid holidays", () => {
  it("are the nine of 5787, on their days", () => {
    expect(paidHolidayDates("2026-09-01", "2027-08-31")).toEqual([
      { key: "rosh_hashana_1", date: "2026-09-12" },
      { key: "rosh_hashana_2", date: "2026-09-13" },
      { key: "yom_kippur", date: "2026-09-21" },
      { key: "sukkot", date: "2026-09-26" },
      { key: "shmini_atzeret", date: "2026-10-03" },
      { key: "pesach_1", date: "2027-04-22" },
      { key: "pesach_7", date: "2027-04-28" },
      { key: "independence_day", date: "2027-05-12" },
      { key: "shavuot", date: "2027-06-11" },
    ]);
    expect(PAID_HOLIDAYS).toHaveLength(9);
  });

  it("have their eves, but for a day that is itself a holiday", () => {
    expect([...year5787.eves].sort()).toEqual([
      "2026-09-11",
      "2026-09-20",
      "2026-09-25",
      "2026-10-02",
      "2027-04-21",
      "2027-04-27",
      // Yom HaZikaron, while that reading stands (plan §14, lawyer 2).
      "2027-05-11",
      "2027-06-10",
    ]);
    expect(year5787.eves.has("2026-09-12")).toBe(false);
  });

  it("leave out the days hebcal lists that are no rest days", () => {
    const dates = year5787.holidays.map((holiday) => holiday.date);
    for (const day of [
      "2026-10-05", // Swords of Iron memorial day
      "2026-10-18", // Yom HaAliyah, school observance
      "2026-10-22", // Rabin memorial day
      "2026-11-09", // Sigd
      "2027-04-17", // Yom HaAliyah
      "2027-05-11", // Yom HaZikaron
      "2027-06-04", // Yom Yerushalayim
    ]) {
      expect(dates, day).not.toContain(day);
    }
  });

  it("run from candle lighting on the eve to havdalah, Rosh Hashana as two days in a row", () => {
    const window = (key: string) => {
      const found = year5787.holidays.find((holiday) => holiday.key === key);
      if (!found) throw new Error(key);
      return shown(found.window);
    };
    expect(window("rosh_hashana_1")).toEqual([
      "2026-09-11 18:32",
      "2026-09-12 19:28",
    ]);
    expect(window("rosh_hashana_2")).toEqual([
      "2026-09-12 19:28",
      "2026-09-13 19:26",
    ]);
    expect(window("yom_kippur")).toEqual([
      "2026-09-20 18:20",
      "2026-09-21 19:15",
    ]);
    expect(window("shavuot")).toEqual(["2027-06-10 19:26", "2027-06-11 20:29"]);
  });

  it("make Independence Day 20:00 to 20:00", () => {
    const day = year5787.holidays.find(
      (holiday) => holiday.key === "independence_day",
    );
    expect(day && shown(day.window)).toEqual([
      "2027-05-11 20:00",
      "2027-05-12 20:00",
    ]);
    expect(day?.eve).toBe("2027-05-11");
  });

  it("leave Yom HaZikaron out of the eves in the other reading", () => {
    const other = payrollCalendar(
      ISRAELI_CITIES.telAviv,
      "2027-05-01",
      "2027-05-31",
      CANDLE,
      {
        ...PAYROLL_READINGS,
        independenceDay: { from: "20:00", to: "20:00", eveIsShort: false },
      },
    );
    expect(other.eves.has("2027-05-11")).toBe(false);
  });
});

describe("the weekly rest", () => {
  const october = payrollCalendar(
    ISRAELI_CITIES.telAviv,
    "2026-09-27",
    "2026-10-31",
    CANDLE,
  );
  const of = (windows: Window[], from: string) =>
    windows.map(shown).find(([start]) => start?.startsWith(from));

  it("is 36 hours from candle lighting in Tel Aviv, at least until havdalah", () => {
    expect(of(october.weeklyRest[6], "2026-10-16")).toEqual([
      "2026-10-16 17:47",
      "2026-10-18 05:47",
    ]);
    // Across the clocks going back: 36 elapsed hours end at 04:39.
    expect(of(october.weeklyRest[6], "2026-10-23")).toEqual([
      "2026-10-23 17:39",
      "2026-10-25 04:39",
    ]);
  });

  it("starts at the fixed Friday time when the notice says so", () => {
    const fixed = payrollCalendar(
      ISRAELI_CITIES.telAviv,
      "2026-10-01",
      "2026-10-31",
      { restStart: "fixed", restStartTime: "14:00" },
    );
    expect(of(fixed.weeklyRest[6], "2026-10-16")).toEqual([
      "2026-10-16 14:00",
      "2026-10-18 02:00",
    ]);
  });

  it("follows Haifa's 30 minutes before sunset", () => {
    const haifa = payrollCalendar(
      ISRAELI_CITIES.haifa,
      "2026-10-01",
      "2026-10-31",
      CANDLE,
    );
    expect(of(haifa.weeklyRest[6], "2026-10-16")?.[0]).toBe("2026-10-16 17:36");
  });

  it("runs Thursday 18:00 to Saturday 06:00 for a Friday rest, Saturday 18:00 to Monday 06:00 for a Sunday one", () => {
    expect(of(october.weeklyRest[5], "2026-10-15")).toEqual([
      "2026-10-15 18:00",
      "2026-10-17 06:00",
    ]);
    expect(of(october.weeklyRest[0], "2026-10-17")).toEqual([
      "2026-10-17 18:00",
      "2026-10-19 06:00",
    ]);
  });

  it("reaches a week past each end of the range", () => {
    const starts = october.weeklyRest[6].map((window) => local(window.from));
    expect(starts[0]?.slice(0, 10)).toBe("2026-09-25");
    expect(starts.at(-1)?.slice(0, 10)).toBe("2026-11-06");
  });
});

describe("one-off rest days", () => {
  it("have election day 2026, 07:00 to 22:00", () => {
    const october = payrollCalendar(
      ISRAELI_CITIES.telAviv,
      "2026-10-01",
      "2026-10-31",
      CANDLE,
    );
    expect(
      october.oneOffRestDays.map((day) => [day.key, ...shown(day.window)]),
    ).toEqual([["knesset_2026", "2026-10-27 07:00", "2026-10-27 22:00"]]);
    expect(ONE_OFF_REST_DAYS.map((day) => day.key)).toEqual(["knesset_2026"]);
  });

  it("are only in a range that has them", () => {
    expect(
      payrollCalendar(
        ISRAELI_CITIES.telAviv,
        "2027-01-01",
        "2027-01-31",
        CANDLE,
      ).oneOffRestDays,
    ).toEqual([]);
  });
});
