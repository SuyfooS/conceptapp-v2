import { dateIn } from "@domain/availability";
import type { OpeningShift, ScheduleOpenings } from "@domain/list-openings";
import { type BusinessPlace, shabbatPlaceOf } from "@domain/shabbat";
import { shabbatSpansFrom } from "@domain/shabbat-times";
import type { EditorTimes } from "../list-types";

/** Shabbatot ahead the editor knows: more than the three weeks it looks into. */
const SHABBATOT = 4;

/**
 * What a template's times are worked out with in its editor, the same for
 * the business's own people, the team in the console and the demo. Shabbat's
 * times come from hebcal, so this runs on the server.
 */
export function editorTimes({
  now,
  place,
  closesOnShabbat,
  shifts,
  people,
  openings,
}: {
  now: Date;
  place: BusinessPlace;
  closesOnShabbat: boolean;
  shifts: readonly (OpeningShift & { people?: string[] })[];
  people: readonly { userId: string; name: string | null }[];
  openings: ScheduleOpenings;
}): EditorTimes {
  return {
    now: now.toISOString(),
    timeZone: place.timeZone,
    closesOnShabbat,
    shabbat: closesOnShabbat
      ? shabbatSpansFrom(
          shabbatPlaceOf(place),
          dateIn(now, place.timeZone),
          SHABBATOT,
        )
      : [],
    shifts: shifts.map((shift) => ({
      id: shift.id,
      day: shift.day,
      start: shift.start,
      end: shift.end,
      pattern: shift.pattern,
    })),
    people: people.map((person) => ({
      userId: person.userId,
      name: person.name,
    })),
    openings,
  };
}
