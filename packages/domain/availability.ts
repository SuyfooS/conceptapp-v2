import { z } from "zod";
import { minutesOf, rangeMinutes, timeOfDay } from "./hours";
import type { Role } from "./modules";
import { calendarDate } from "./shabbat";

/**
 * Weeks of the schedule and each person's availability for one. A week
 * starts on the business's `weekStartsOn` (0 = Sunday, 1 = Monday), and
 * availability for it is due on the business's due day and time in the
 * week before. Dates are "YYYY-MM-DD" calendar days in the business's
 * time zone; the database stores the same shape (`schedule_weeks`,
 * `availability_submissions`, `availability_ranges`).
 */

function utcOf(date: string): Date {
  const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** The date `days` days after `date` (before, when negative). */
export function addDays(date: string, days: number): string {
  const utc = utcOf(date);
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(date: string): number {
  return utcOf(date).getUTCDay();
}

/** The first day of the week `date` is in. */
export function weekStartOf(date: string, weekStartsOn: 0 | 1): string {
  return addDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}

/** The seven dates of the week starting on `start`. */
export function weekDates(start: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

/** Today's date in a time zone. */
export function dateIn(instant: Date, timeZone: string): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).format(instant);
}

/** The week people submit availability for: the one after this week. */
export function nextWeekStart(
  instant: Date,
  timeZone: string,
  weekStartsOn: 0 | 1,
): string {
  return addDays(weekStartOf(dateIn(instant, timeZone), weekStartsOn), 7);
}

/** How far the zone's clock is ahead of UTC at `instant`, in minutes. */
function offsetMinutes(instant: Date, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
      timeZone,
    })
      .formatToParts(instant)
      .map((part) => [part.type, Number(part.value)]),
  );
  const wall = Date.UTC(
    parts.year ?? 0,
    (parts.month ?? 1) - 1,
    parts.day ?? 1,
    parts.hour ?? 0,
    parts.minute ?? 0,
  );
  return Math.round((wall - instant.getTime()) / 60_000);
}

/**
 * The instant a wall-clock time on a date happens in a time zone. A time
 * skipped when the clocks go forward lands just after the change.
 */
export function instantIn(date: string, time: string, timeZone: string): Date {
  const wall = utcOf(date).getTime() + minutesOf(time) * 60_000;
  let instant = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
  // A second pass settles a guess that crossed a clock change.
  instant = wall - offsetMinutes(new Date(instant), timeZone) * 60_000;
  return new Date(instant);
}

/**
 * When availability for the week starting on `weekStart` is due: the last
 * `dueDay` before the week starts, at `dueTime` in the business's zone. A
 * due day equal to the week's first day means a full week before.
 */
export function availabilityDueAt(
  weekStart: string,
  due: { day: number; time: string },
  timeZone: string,
): Date {
  const back = (weekdayOf(weekStart) - due.day + 7) % 7 || 7;
  return instantIn(addDays(weekStart, -back), due.time, timeZone);
}

export const availabilityRange = z
  .object({ day: calendarDate, start: timeOfDay, end: timeOfDay })
  .refine((range) => range.start !== range.end, {
    message: "Start and end must differ",
  });

export type AvailabilityRange = z.infer<typeof availabilityRange>;

/** Two ranges on the same day overlap (an end past midnight counts as late). */
function overlaps(a: AvailabilityRange, b: AvailabilityRange): boolean {
  if (a.day !== b.day) return false;
  const aStart = minutesOf(a.start);
  const bStart = minutesOf(b.start);
  return (
    aStart < bStart + rangeMinutes(b.start, b.end) &&
    bStart < aStart + rangeMinutes(a.start, a.end)
  );
}

/**
 * One person's availability for the week starting on `weekStart`: ranges
 * inside the week, none overlapping another on the same day, and an
 * optional note. No ranges means not available that week. The database
 * checks the same rules (`public.submit_availability`).
 */
export function availabilitySubmission(weekStart: string) {
  const days = new Set(weekDates(weekStart));
  return z.object({
    ranges: z
      .array(availabilityRange)
      .max(21)
      .superRefine((ranges, ctx) => {
        ranges.forEach((range, i) => {
          if (!days.has(range.day)) {
            ctx.addIssue({
              code: "custom",
              message: "Outside the week",
              path: [i, "day"],
            });
          }
          if (ranges.slice(0, i).some((other) => overlaps(other, range))) {
            ctx.addIssue({
              code: "custom",
              message: "Overlaps another range on the same day",
              path: [i],
            });
          }
        });
      }),
    note: z
      .string()
      .trim()
      .max(300)
      .transform((note) => note || undefined)
      .optional(),
  });
}

export type AvailabilitySubmission = z.infer<
  ReturnType<typeof availabilitySubmission>
>;

/**
 * Who has not submitted availability for a week: active workers and
 * managers without a submission, in the order given. Owners are left out;
 * they plan the schedule rather than fill a shift by default.
 */
export function missingAvailability<T extends { userId: string; role: Role }>(
  members: readonly T[],
  submittedUserIds: Iterable<string>,
): T[] {
  const submitted = new Set(submittedUserIds);
  return members.filter(
    (member) => member.role !== "owner" && !submitted.has(member.userId),
  );
}

/** What the manager's overview needs from one person's answer. */
export type AvailabilityAnswer = {
  userId: string;
  note: string | null;
  /** ISO timestamp of the last time it was sent. */
  updatedAt: string;
  ranges: AvailabilityRange[];
};

export type TeamAvailability<
  T extends { userId: string; role: Role },
  A extends AvailabilityAnswer,
> = {
  /** Who still has to send, in the order given (`missingAvailability`). */
  missing: T[];
  /** Who sent, in the order given, with their answer. */
  sent: (T & {
    answer: A;
    /** Sent or last changed after the due moment. */
    late: boolean;
    /** The days with hours, in week order. */
    days: string[];
  })[];
  counts: { sent: number; missing: number };
};

/**
 * A manager's view of a week's availability: who has not sent it yet and
 * what everyone else sent. Answers from people no longer on the team are
 * left out. `dueAt` is the week's due moment (ISO).
 */
export function teamAvailability<
  T extends { userId: string; role: Role },
  A extends AvailabilityAnswer,
>(
  members: readonly T[],
  answers: readonly A[],
  dueAt: string,
): TeamAvailability<T, A> {
  const byUser = new Map(answers.map((answer) => [answer.userId, answer]));
  const due = Date.parse(dueAt);
  const sent = members.flatMap((member) => {
    const answer = byUser.get(member.userId);
    if (!answer) return [];
    const days = [...new Set(answer.ranges.map((range) => range.day))].sort();
    return [
      { ...member, answer, late: Date.parse(answer.updatedAt) > due, days },
    ];
  });
  const missing = missingAvailability(members, byUser.keys());
  return {
    missing,
    sent,
    counts: { sent: sent.length, missing: missing.length },
  };
}
