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

/**
 * The cities a business's Shabbat times can follow: hebcal's own Israeli
 * cities, with its coordinates (a test holds them to the library) and its
 * customs. A business elsewhere picks the nearest. A key is stored in
 * `businesses.shabbat_city`, so keys never change; names are in the messages
 * under `cities`.
 */
export const ISRAELI_CITIES = {
  jerusalem: {
    latitude: 31.76904,
    longitude: 35.21633,
    candleLightingMinutes: 40,
  },
  telAviv: { latitude: 32.08088, longitude: 34.78057 },
  haifa: { latitude: 32.81841, longitude: 34.9885, candleLightingMinutes: 30 },
  beerSheva: { latitude: 31.25181, longitude: 34.7913 },
  ashdod: { latitude: 31.79213, longitude: 34.64966 },
  petahTikva: { latitude: 32.08707, longitude: 34.88747 },
  tiberias: { latitude: 32.79221, longitude: 35.53124 },
  eilat: { latitude: 29.55805, longitude: 34.94821 },
} as const satisfies Record<string, ShabbatPlace>;

export type ShabbatCity = keyof typeof ISRAELI_CITIES;

/** In the order a menu shows them: the largest first, roughly north to south after. */
export const SHABBAT_CITIES = [
  "jerusalem",
  "telAviv",
  "haifa",
  "petahTikva",
  "tiberias",
  "ashdod",
  "beerSheva",
  "eilat",
] as const satisfies readonly ShabbatCity[];

/** Until a business picks a city, its times are Tel Aviv's. */
export const DEFAULT_SHABBAT_CITY: ShabbatCity = "telAviv";

/** The city a stored value names, or null for one no list has. */
export function shabbatCityOf(value: unknown): ShabbatCity | null {
  return typeof value === "string" && Object.hasOwn(ISRAELI_CITIES, value)
    ? (value as ShabbatCity)
    : null;
}

/** Where a business is, as far as its Shabbat times and its calendar go. */
export type BusinessPlace = {
  /** The stored key; null (or one no longer listed) reads as Tel Aviv. */
  shabbatCity: string | null;
  timeZone: string;
};

/** The place a business's Shabbat times are worked out for. */
export function shabbatPlaceOf(place: BusinessPlace): ShabbatPlace {
  const city = shabbatCityOf(place.shabbatCity) ?? DEFAULT_SHABBAT_CITY;
  return { ...ISRAELI_CITIES[city], timeZone: place.timeZone };
}

export type ShabbatTimes = {
  /** The Friday, "YYYY-MM-DD". */
  friday: string;
  candleLighting: Date;
  havdalah: Date;
};

export function dateParts(date: string): [number, number, number] {
  const [year = 0, month = 1, day = 1] = calendarDate
    .parse(date)
    .split("-")
    .map(Number);
  return [year, month, day];
}

export function isoDate(utc: Date): string {
  return utc.toISOString().slice(0, 10);
}

/**
 * The Friday of the Shabbat a date belongs to: the coming Friday from
 * Sunday to Friday, the day before on Saturday.
 */
export function shabbatFriday(date: string): string {
  const [year, month, day] = dateParts(date);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const weekday = utc.getUTCDay();
  const offset = weekday === 6 ? -1 : 5 - weekday;
  utc.setUTCDate(utc.getUTCDate() + offset);
  return isoDate(utc);
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
