import { GeoLocation, Zmanim } from "@hebcal/core";
import { z } from "zod";

/**
 * Shabbat boundaries for a business's location: candle lighting on Friday
 * and havdalah on Saturday night, both rounded to the minute as Israeli
 * calendars print them. Scheduling uses them for the Friday and Saturday
 * availability rules.
 *
 * Candle lighting is a number of minutes before sunset: 20 in Israel by
 * default, 40 in Jerusalem, 30 in Haifa (the custom hebcal and Israeli
 * calendars follow). Havdalah is when the sun is 8.5° below the horizon
 * (three small stars), hebcal's default.
 */

export const ISRAEL_TIME_ZONE = "Asia/Jerusalem";

export const DEFAULT_CANDLE_LIGHTING_MINUTES = 20;

/** Solar depression for havdalah, in degrees. */
export const HAVDALAH_DEGREES = 8.5;

/** A calendar date, "YYYY-MM-DD". */
export const calendarDate = z.iso.date();

export const shabbatPlace = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  timeZone: z.string().min(1).default(ISRAEL_TIME_ZONE),
  candleLightingMinutes: z
    .int()
    .min(0)
    .max(60)
    .default(DEFAULT_CANDLE_LIGHTING_MINUTES),
});

export type ShabbatPlace = z.input<typeof shabbatPlace>;

/** Cities whose candle-lighting custom differs from the default, and the tests' reference points. */
export const ISRAELI_CITIES = {
  jerusalem: {
    latitude: 31.76904,
    longitude: 35.21633,
    candleLightingMinutes: 40,
  },
  telAviv: { latitude: 32.08088, longitude: 34.78057 },
  haifa: { latitude: 32.81841, longitude: 34.9885, candleLightingMinutes: 30 },
} as const satisfies Record<string, ShabbatPlace>;

export type ShabbatTimes = {
  /** The Friday, "YYYY-MM-DD". */
  friday: string;
  candleLighting: Date;
  havdalah: Date;
};

function parts(date: string): [number, number, number] {
  const [year = 0, month = 1, day = 1] = calendarDate
    .parse(date)
    .split("-")
    .map(Number);
  return [year, month, day];
}

function format(utc: Date): string {
  return utc.toISOString().slice(0, 10);
}

/**
 * The Friday of the Shabbat a date belongs to: the coming Friday from
 * Sunday to Friday, the day before on Saturday.
 */
export function shabbatFriday(date: string): string {
  const [year, month, day] = parts(date);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay();
  const offset = weekday === 6 ? -1 : 5 - weekday;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return format(utc);
}

/**
 * Hebcal reads the year, month and day of a `Date` in the process's own
 * time zone, so the date is built in local time to mean the same day
 * wherever the code runs.
 */
function zmanimOn(gloc: GeoLocation, date: string): Zmanim {
  const [year, month, day] = parts(date);
  return new Zmanim(gloc, new Date(year, month - 1, day), false);
}

/** Candle lighting and havdalah for the Shabbat that `date` belongs to. */
export function shabbatTimes(place: ShabbatPlace, date: string): ShabbatTimes {
  const { latitude, longitude, timeZone, candleLightingMinutes } =
    shabbatPlace.parse(place);
  const gloc = new GeoLocation(null, latitude, longitude, 0, timeZone);
  const friday = shabbatFriday(date);
  const [year, month, day] = parts(friday);
  const saturday = format(new Date(Date.UTC(year, month - 1, day + 1)));
  return {
    friday,
    candleLighting: zmanimOn(gloc, friday).sunsetOffset(
      -candleLightingMinutes,
      true,
    ),
    havdalah: Zmanim.roundTime(
      zmanimOn(gloc, saturday).tzeit(HAVDALAH_DEGREES),
    ),
  };
}

/** "HH:MM" on the 24-hour clock in the given time zone. */
export function timeIn(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone,
  }).format(instant);
}

/** True from candle lighting (inclusive) until havdalah (exclusive). */
export function isDuringShabbat(instant: Date, times: ShabbatTimes): boolean {
  const at = instant.getTime();
  return at >= times.candleLighting.getTime() && at < times.havdalah.getTime();
}
