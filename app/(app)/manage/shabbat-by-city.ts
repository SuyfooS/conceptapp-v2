import "server-only";
import {
  ISRAELI_CITIES,
  SHABBAT_CITIES,
  type ShabbatCity,
  timeIn,
} from "@domain/shabbat";
import { shabbatTimes } from "@domain/shabbat-times";

export type CityShabbat = { candleLighting: string; havdalah: string };

/**
 * The Shabbat that `date` belongs to in every city, as a clock there reads it,
 * so choosing a city shows what it changes. Worked out here because the
 * library that knows the sun is too big for the browser.
 */
export function shabbatByCity(
  date: string,
  timeZone: string,
): Record<ShabbatCity, CityShabbat> {
  return Object.fromEntries(
    SHABBAT_CITIES.map((city) => {
      const times = shabbatTimes({ ...ISRAELI_CITIES[city], timeZone }, date);
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
