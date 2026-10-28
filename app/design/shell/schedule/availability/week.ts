import { weekDates } from "@domain/availability";
import { shabbatLimits } from "@domain/availability-form";
import {
  ISRAEL_TIME_ZONE,
  ISRAELI_CITIES,
  shabbatTimes,
} from "@domain/shabbat";
import type { AvailabilityWeek } from "../../../../(app)/schedule/week";

// A fixed week for the demo, in Tel Aviv, with an answer sent before.
const start = "2026-11-01";

export const demoWeek: AvailabilityWeek = {
  start,
  dates: weekDates(start),
  dueAt: "2026-10-28T16:00:00.000Z",
  timeZone: ISRAEL_TIME_ZONE,
  shabbat: shabbatLimits(
    shabbatTimes(ISRAELI_CITIES.telAviv, "2026-11-06"),
    ISRAEL_TIME_ZONE,
  ),
  mine: {
    userId: "demo",
    note: null,
    submittedAt: "2026-10-27T09:12:00.000Z",
    updatedAt: "2026-10-27T09:12:00.000Z",
    ranges: [
      { day: "2026-11-01", start: "09:00", end: "17:00" },
      { day: "2026-11-03", start: "17:00", end: "23:30" },
      { day: "2026-11-06", start: "08:00", end: "14:00" },
      { day: "2026-11-07", start: "19:30", end: "00:30" },
    ],
  },
};
