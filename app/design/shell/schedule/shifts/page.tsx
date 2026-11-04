import { addDays, weekDates } from "@domain/availability";
import { draftWeek } from "@domain/schedule";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { MyShiftsView } from "../../../../(app)/schedule/shifts/my-shifts-view";
import type { PublishedSchedule } from "../../../../(app)/schedule/week";
import { demoPositions, demoShiftPatterns, teamMembers } from "../../data";
import { demoWeek } from "../availability/week";

// Who works which shift in the demo's published week (by day and pattern),
// and in which position. Noa is the signed-in person.
const placed: Record<string, [string, string | null][]> = {
  "2026-11-01/morning": [
    ["noa", "waiter"],
    ["itay", "cook"],
    ["maya", "waiter"],
  ],
  "2026-11-01/evening": [
    ["shiran", null],
    ["yoav", "bartender"],
    ["omer", "cook"],
  ],
  "2026-11-03/evening": [
    ["noa", "waiter"],
    ["yoav", "bartender"],
    ["itay", "cook"],
  ],
  "2026-11-04/morning": [["maya", "waiter"]],
  "2026-11-06/friday": [
    ["noa", null],
    ["shira", "host"],
  ],
  "2026-11-07/saturday-night": [["yoav", "bartender"]],
};

const start = demoWeek.start;
const next = addDays(start, 7);

// The real "my shifts" screen as Noa sees it on Tuesday 3 November: this
// week published, next week not yet.
export default function ShellMyShifts() {
  const data: PublishedSchedule = {
    userId: "noa",
    today: "2026-11-03",
    timeZone: ISRAEL_TIME_ZONE,
    thisWeek: {
      start,
      dates: weekDates(start),
      publishedAt: "2026-10-29T15:40:00.000Z",
      shifts: draftWeek(start, demoShiftPatterns).map((s) => ({
        ...s,
        assignees: (placed[`${s.day}/${s.pattern}`] ?? []).map(
          ([user, position]) => ({ user, position }),
        ),
      })),
    },
    nextWeek: {
      start: next,
      dates: weekDates(next),
      publishedAt: null,
      shifts: [],
    },
    people: teamMembers.map(({ userId, name }) => ({ userId, name })),
    positions: demoPositions,
  };
  return <MyShiftsView data={data} />;
}
