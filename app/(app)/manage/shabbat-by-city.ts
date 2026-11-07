import "server-only";
import {
  ISRAELI_CITIES,
  SHABBAT_CITIES,
  type ShabbatCity,
  timeIn,
} from "@domain/shabbat";
import { comingShabbatTimes } from "@domain/shabbat-times";

export type CityShabbat = { candleLighting: string; havdalah: string };

/**
 * The coming Shabbat at `now` in every city, as a clock there reads it, so
 * choosing a city shows what it changes. Worked out here because the library
 * that knows the sun is too big for the browser.
 */
export function shabbatByCity(
  now: Date,
  timeZone: string,
): Record<ShabbatCity, CityShabbat> {
  return Object.fromEntries(
    SHABBAT_CITIES.map((city) => {
      const times = comingShabbatTimes(
        { ...ISRAELI_CITIES[city], timeZone },
        now,
      );
      return [
        city,
        {
          candleLighting: timeIn(times.candleLighting, timeZone),
          havdalah: timeIn(times.havdalah, timeZone),
        },
      ];
    }),
  ) as Record<ShabbatCity, CityShabbat>;
}
