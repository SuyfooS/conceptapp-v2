import { GeoLocation, Zmanim } from "@hebcal/core";
import { addDays, dateIn } from "./availability";
import type { ShabbatSpan } from "./list-openings";
import {
  dateParts,
  HAVDALAH_DEGREES,
  isoDate,
  type ShabbatPlace,
  type ShabbatTimes,
  shabbatFriday,
  shabbatPlace,
} from "./shabbat";

/*
 * Apart from the rest of Shabbat's logic because of the library's size: screens
 * in the browser use shabbat.ts, and only the server works out times.
 */

/**
 * Hebcal reads the year, month and day of a `Date` in the process's own
 * time zone, so the date is built in local time to mean the same day
 * wherever the code runs.
 */
function zmanimOn(gloc: GeoLocation, date: string): Zmanim {
  const [year, month, day] = dateParts(date);
  return new Zmanim(gloc, new Date(year, month - 1, day), false);
}

/** Candle lighting and havdalah for the Shabbat that `date` belongs to. */
export function shabbatTimes(place: ShabbatPlace, date: string): ShabbatTimes {
  const { latitude, longitude, timeZone, candleLightingMinutes } =
    shabbatPlace.parse(place);
  const gloc = new GeoLocation(null, latitude, longitude, 0, timeZone);
  const friday = shabbatFriday(date);
  const [year, month, day] = dateParts(friday);
  const saturday = isoDate(new Date(Date.UTC(year, month - 1, day + 1)));
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

/**
 * `weeks` Shabbatot from the one `date` belongs to, as lists' times read
 * them (@domain/list-openings): each Friday with candle lighting and havdalah
 * as instants.
 */
export function shabbatSpansFrom(
  place: ShabbatPlace,
  date: string,
  weeks: number,
): ShabbatSpan[] {
  const first = shabbatFriday(date);
  return Array.from({ length: weeks }, (_, week) => {
    const times = shabbatTimes(place, addDays(first, week * 7));
    return {
      friday: times.friday,
      candleLighting: times.candleLighting.toISOString(),
      havdalah: times.havdalah.toISOString(),
    };
  });
}

/**
 * The Shabbat still ahead at `now`, or the one under way. After havdalah on
 * Saturday night that is next week's, though the date still says Saturday.
 */
export function comingShabbatTimes(
  place: ShabbatPlace,
  now: Date,
): ShabbatTimes {
  const today = dateIn(now, shabbatPlace.parse(place).timeZone);
  const times = shabbatTimes(place, today);
  return now.getTime() < times.havdalah.getTime()
    ? times
    : shabbatTimes(place, addDays(today, 1));
}
