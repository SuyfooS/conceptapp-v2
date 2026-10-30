import { z } from "zod";
import { type AvailabilityRange, weekDates, weekdayOf } from "./availability";
import { minutesOf, rangeMinutes, timeOfDay } from "./hours";
import { calendarDate } from "./shabbat";
import { type ShiftPattern, shiftsOn } from "./staffing";

/**
 * The week's schedule: the shifts of one week and who works each. A
 * manager starts from the business's shift pattern (`draftWeek`), changes
 * what they need and puts people on shifts. The database stores the same
 * shape (`schedule_shifts`, `shift_assignments`) and checks the same rules
 * (`public.save_week_schedule`).
 */

const key = z
  .string()
  .regex(/^[a-z][a-z0-9-]*$/, "Expected a lowercase key")
  .max(40);

export const shiftAssignee = z.object({
  user: z.uuid(),
  /** One of the business's positions, when the shift needs one. */
  position: key.nullable().default(null),
});

export type ShiftAssignee = z.infer<typeof shiftAssignee>;

export const scheduledShift = z
  .object({
    day: calendarDate,
    name: z.string().trim().min(1).max(40),
    start: timeOfDay,
    /** At or before `start` means the shift ends after midnight. */
    end: timeOfDay,
    needed: z.int().min(1).max(50),
    /** The pattern the shift was made from; null when added by hand. */
    pattern: key.nullable().default(null),
    assignees: z.array(shiftAssignee).max(50).default([]),
  })
  .refine((shift) => shift.start !== shift.end, {
    message: "Start and end must differ",
  });

export type ScheduledShift = z.infer<typeof scheduledShift>;

/** Minutes from the week's first midnight to a shift's start and end. */
function span(
  weekStart: string,
  shift: Pick<ScheduledShift, "day" | "start" | "end">,
): [number, number] {
  const from =
    weekDates(weekStart).indexOf(shift.day) * 1440 + minutesOf(shift.start);
  return [from, from + rangeMinutes(shift.start, shift.end)];
}

/**
 * A whole week's schedule for the week starting on `weekStart`: shifts
 * inside the week, each person once per shift, in one of `positionKeys`
 * when given one, and never on two shifts at the same time. People being
 * active members is the database's to check.
 */
export function weekSchedule(
  weekStart: string,
  positionKeys: readonly string[],
) {
  const days = new Set(weekDates(weekStart));
  const positions = new Set(positionKeys);
  return z
    .array(scheduledShift)
    .max(200)
    .superRefine((shifts, ctx) => {
      const busy = new Map<string, { at: [number, number]; shift: number }[]>();
      shifts.forEach((shift, i) => {
        if (!days.has(shift.day)) {
          ctx.addIssue({
            code: "custom",
            message: "Outside the week",
            path: [i, "day"],
          });
          return;
        }
        const at = span(weekStart, shift);
        const seen = new Set<string>();
        shift.assignees.forEach((person, j) => {
          if (seen.has(person.user)) {
            ctx.addIssue({
              code: "custom",
              message: "On the shift twice",
              path: [i, "assignees", j],
            });
          }
          seen.add(person.user);
          if (person.position !== null && !positions.has(person.position)) {
            ctx.addIssue({
              code: "custom",
              message: "Unknown position",
              path: [i, "assignees", j, "position"],
            });
          }
          const other = (busy.get(person.user) ?? []).find(
            (taken) =>
              taken.shift !== i && taken.at[0] < at[1] && at[0] < taken.at[1],
          );
          if (other) {
            ctx.addIssue({
              code: "custom",
              message: "Works another shift at the same time",
              path: [i, "assignees", j],
            });
          }
          busy.set(person.user, [
            ...(busy.get(person.user) ?? []),
            { at, shift: i },
          ]);
        });
      });
    });
}

/**
 * A new week's shifts from the business's shift pattern: every shift on
 * every day it runs, day by day and earliest first, with nobody on it yet.
 */
export function draftWeek(
  weekStart: string,
  patterns: readonly ShiftPattern[],
): ScheduledShift[] {
  return weekDates(weekStart).flatMap((day) =>
    shiftsOn(patterns, weekdayOf(day)).map((pattern) => ({
      day,
      name: pattern.name,
      start: pattern.start,
      end: pattern.end,
      needed: pattern.needed,
      pattern: pattern.key,
      assignees: [],
    })),
  );
}

/** People a shift still needs (0 when it is full or over). */
export function stillNeeded(
  shift: Pick<ScheduledShift, "needed" | "assignees">,
): number {
  return Math.max(0, shift.needed - shift.assignees.length);
}

/**
 * What is still open in a week's schedule: the shifts short of people and
 * how many people are missing in all, for "2 משמרות חסרות עובד".
 */
export function scheduleGaps<
  S extends Pick<ScheduledShift, "needed" | "assignees">,
>(shifts: readonly S[]): { shifts: S[]; people: number } {
  const short = shifts.filter((shift) => stillNeeded(shift) > 0);
  return {
    shifts: short,
    people: short.reduce((sum, shift) => sum + stillNeeded(shift), 0),
  };
}

/**
 * Someone's availability covers the whole shift: their ranges on the
 * shift's day, joined where they touch or overlap, include its start and
 * its end (both may run past midnight).
 */
export function availableFor(
  shift: Pick<ScheduledShift, "day" | "start" | "end">,
  ranges: readonly AvailabilityRange[],
): boolean {
  const from = minutesOf(shift.start);
  const to = from + rangeMinutes(shift.start, shift.end);
  const spans = ranges
    .filter((range) => range.day === shift.day)
    .map((range) => {
      const start = minutesOf(range.start);
      return [start, start + rangeMinutes(range.start, range.end)] as const;
    })
    .sort((a, b) => a[0] - b[0]);
  const joined: [number, number][] = [];
  for (const [start, end] of spans) {
    const last = joined.at(-1);
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else joined.push([start, end]);
  }
  return joined.some(([start, end]) => start <= from && end >= to);
}
