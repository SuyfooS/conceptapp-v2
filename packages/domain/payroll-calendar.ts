import {
  flags,
  GeoLocation,
  HDate,
  HebrewCalendar,
  months,
  Zmanim,
} from "@hebcal/core";
import { addDays, instantIn, weekdayOf } from "./availability";
import type { RestDay } from "./payroll-details";
import { PAYROLL_READINGS, type PayrollReadings } from "./payroll-readings";
import {
  dateParts,
  HAVDALAH_DEGREES,
  type ShabbatPlace,
  shabbatPlace,
} from "./shabbat";

/*
 * The days payroll pays differently, for a range of dates (payroll P6): each
 * weekly rest by the day a person rests on, the paid holidays and the one-off
 * rest days, with their windows as instants. It imports hebcal, so only the
 * server imports this file, as with shabbat-times.ts; the engine
 * (`payroll.ts`) takes what it returns as data.
 */

/** A stretch of time, as epoch milliseconds, the end not included. */
export type Window = { from: number; to: number };

/**
 * The paid holidays: an explicit list of nine, never "every holiday hebcal
 * knows", whose "modern holidays" include days that are no rest days
 * (Yom HaAliyah, Sigd, the Swords of Iron memorial day…). In Israel, one day
 * each, two for Rosh Hashana (Holidays Ordinance; Law and Administration
 * Ordinance s.18א).
 */
export const PAID_HOLIDAYS = [
  "rosh_hashana_1",
  "rosh_hashana_2",
  "yom_kippur",
  "sukkot",
  "shmini_atzeret",
  "pesach_1",
  "pesach_7",
  "shavuot",
  "independence_day",
] as const;
export type HolidayKey = (typeof PAID_HOLIDAYS)[number];

export type Holiday = {
  key: HolidayKey;
  /** The day itself, `YYYY-MM-DD`. */
  date: string;
  /** The day before it. */
  eve: string;
  /**
   * Its own part of the holiday: from candle lighting on its eve (20:00 for
   * Independence Day; havdalah when the eve is a Saturday) to havdalah on the
   * day (20:00 for Independence Day). The second day of Rosh Hashana starts
   * where the first ends. The 36 hours after a holiday are per person, in the
   * engine.
   */
  window: Window;
};

/**
 * One-off rest days (שבתון) that aren't holidays, by law for that day only:
 * Knesset election day. Work on one is tagged with its minutes, never moved
 * to another rate, and an hourly worker who would have worked it is paid the
 * day (payroll plan §2, §9.4).
 */
export const ONE_OFF_REST_DAYS = [
  // Election day for the 26th Knesset. Its hours aren't defined anywhere:
  // 07:00–22:00 is practice, the polls' hours (payroll plan §14, lawyer 4).
  { key: "knesset_2026", date: "2026-10-27", from: "07:00", to: "22:00" },
] as const;
export type OneOffRestDayKey = (typeof ONE_OFF_REST_DAYS)[number]["key"];

export type OneOffRestDay = { key: string; date: string; window: Window };

export type PayrollCalendar = {
  /** Each weekly rest of the range, by the day a person rests on. */
  weeklyRest: Record<RestDay, Window[]>;
  /** The paid holidays of the range, by date. */
  holidays: Holiday[];
  oneOffRestDays: OneOffRestDay[];
  /**
   * The day before each paid holiday that isn't itself one (so not the first
   * day of Rosh Hashana), Independence Day's eve included while that reading
   * stands.
   */
  eves: ReadonlySet<string>;
};

const HOUR_MS = 3_600_000;

/** The Hebrew dates of the holidays that keep one, by the key. */
const FIXED_HOLIDAYS: readonly {
  key: Exclude<HolidayKey, "independence_day">;
  day: number;
  month: number;
}[] = [
  { key: "rosh_hashana_1", day: 1, month: months.TISHREI },
  { key: "rosh_hashana_2", day: 2, month: months.TISHREI },
  { key: "yom_kippur", day: 10, month: months.TISHREI },
  { key: "sukkot", day: 15, month: months.TISHREI },
  { key: "shmini_atzeret", day: 22, month: months.TISHREI },
  { key: "pesach_1", day: 15, month: months.NISAN },
  { key: "pesach_7", day: 21, month: months.NISAN },
  { key: "shavuot", day: 6, month: months.SIVAN },
];

/** A local `Date` for a calendar day: hebcal reads its year, month and day in the process's own zone. */
function localDay(date: string): Date {
  const [year, month, day] = dateParts(date);
  return new Date(year, month - 1, day);
}

/** A local `Date` hebcal returns, as `YYYY-MM-DD`. */
function isoOf(local: Date): string {
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

/**
 * The paid holidays whose day is from `from` to `to`, by date. Each but
 * Independence Day keeps its Hebrew date; Independence Day moves (to avoid
 * Shabbat), so its day is hebcal's "Yom HaAtzma'ut" for Israel.
 */
export function paidHolidayDates(
  from: string,
  to: string,
): { key: HolidayKey; date: string }[] {
  const first = new HDate(localDay(from)).getFullYear();
  const last = new HDate(localDay(to)).getFullYear();
  const found: { key: HolidayKey; date: string }[] = [];
  for (let year = first; year <= last; year++) {
    for (const holiday of FIXED_HOLIDAYS) {
      found.push({
        key: holiday.key,
        date: isoOf(new HDate(holiday.day, holiday.month, year).greg()),
      });
    }
  }
  const modern = HebrewCalendar.calendar({
    start: localDay(from),
    end: localDay(to),
    il: true,
    mask: flags.MODERN_HOLIDAY,
  });
  for (const event of modern) {
    if (event.getDesc() === "Yom HaAtzma'ut") {
      found.push({
        key: "independence_day",
        date: isoOf(event.getDate().greg()),
      });
    }
  }
  return found
    .filter((holiday) => holiday.date >= from && holiday.date <= to)
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Every day from `from` to `to` that falls on `weekday`. */
function weekdaysBetween(from: string, to: string, weekday: number): string[] {
  const days: string[] = [];
  let day = addDays(from, (weekday - weekdayOf(from) + 7) % 7);
  while (day <= to) {
    days.push(day);
    day = addDays(day, 7);
  }
  return days;
}

/**
 * Rest windows, holidays and one-off rest days for the dates from `from` to
 * `to`, where `place` is (its coordinates, zone and candle-lighting custom).
 * Windows reach a week past each end, so a shift at the range's edge, and the
 * holiday rule's look back, find theirs.
 */
export function payrollCalendar(
  place: ShabbatPlace,
  from: string,
  to: string,
  rest: {
    restStart: "candleLighting" | "fixed";
    restStartTime: string;
  },
  readings: PayrollReadings = PAYROLL_READINGS,
): PayrollCalendar {
  const { latitude, longitude, timeZone, candleLightingMinutes } =
    shabbatPlace.parse(place);
  const gloc = new GeoLocation(null, latitude, longitude, 0, timeZone);
  const zmanim = (date: string) => new Zmanim(gloc, localDay(date), false);
  const candleLighting = (date: string) =>
    zmanim(date).sunsetOffset(-candleLightingMinutes, true).getTime();
  const havdalah = (date: string) =>
    Zmanim.roundTime(zmanim(date).tzeit(HAVDALAH_DEGREES)).getTime();
  const at = (date: string, time: string) =>
    instantIn(date, time, timeZone).getTime();

  const start = addDays(from, -7);
  const end = addDays(to, 7);
  const fridays = weekdaysBetween(start, end, 5);
  const restHours = readings.weeklyRestHours * HOUR_MS;
  const other = readings.otherRestDay;

  const weeklyRest: Record<RestDay, Window[]> = {
    // From candle lighting on Friday (or the business's fixed time) to the
    // later of 36 hours on and havdalah.
    6: fridays.map((friday) => {
      const begins =
        rest.restStart === "fixed"
          ? at(friday, rest.restStartTime)
          : candleLighting(friday);
      return {
        from: begins,
        to: Math.max(begins + restHours, havdalah(addDays(friday, 1))),
      };
    }),
    5: fridays.map((friday) => ({
      from: at(addDays(friday, -1), other.from),
      to: at(addDays(friday, 1), other.to),
    })),
    0: weekdaysBetween(start, end, 0).map((sunday) => ({
      from: at(addDays(sunday, -1), other.from),
      to: at(addDays(sunday, 1), other.to),
    })),
  };

  const holidays: Holiday[] = [];
  for (const { key, date } of paidHolidayDates(start, end)) {
    const eve = addDays(date, -1);
    const previous = holidays.at(-1);
    const independence = key === "independence_day";
    const begins =
      previous?.date === eve
        ? previous.window.to
        : independence
          ? at(eve, readings.independenceDay.from)
          : weekdayOf(eve) === 6
            ? havdalah(eve)
            : candleLighting(eve);
    const ends = independence
      ? at(date, readings.independenceDay.to)
      : havdalah(date);
    holidays.push({ key, date, eve, window: { from: begins, to: ends } });
  }
  const holidayDates = new Set(holidays.map((holiday) => holiday.date));
  const eves = new Set(
    holidays
      .filter(
        (holiday) =>
          !holidayDates.has(holiday.eve) &&
          (holiday.key !== "independence_day" ||
            readings.independenceDay.eveIsShort),
      )
      .map((holiday) => holiday.eve),
  );

  const oneOffRestDays: OneOffRestDay[] = ONE_OFF_REST_DAYS.filter(
    (day) => day.date >= start && day.date <= end,
  ).map((day) => ({
    key: day.key,
    date: day.date,
    window: { from: at(day.date, day.from), to: at(day.date, day.to) },
  }));

  return { weeklyRest, holidays, oneOffRestDays, eves };
}
