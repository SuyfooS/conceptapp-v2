import { z } from "zod";
import { minutesOf, rangeMinutes, timeOfDay } from "./hours";
import { isStaff, type Role } from "./modules";
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

/**
 * One date formatter per time zone, made once: making one costs far more
 * than using it, and payroll asks for thousands of entries' dates. A
 * formatter holds no state, so sharing it keeps `dateIn` pure.
 */
const dateFormats = new Map<string, Intl.DateTimeFormat>();

/** Today's date in a time zone. */
export function dateIn(instant: Date, timeZone: string): string {
  let format = dateFormats.get(timeZone);
  if (!format) {
    // en-CA formats as YYYY-MM-DD.
    format = new Intl.DateTimeFormat("en-CA", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      timeZone,
    });
    dateFormats.set(timeZone, format);
  }
  return format.format(instant);
}

/** The week people submit availability for: the one after this week. */
export function nextWeekStart(
  instant: Date,
  timeZone: string,
  weekStartsOn: 0 | 1,
): string {
  return addDays(weekStartOf(dateIn(instant, timeZone), weekStartsOn), 7);
}

/**
 * One wall-clock formatter per time zone, made once, as `dateFormats`: the
 * fill from availability reads a few hundred instants a week.
 */
const wallFormats = new Map<string, Intl.DateTimeFormat>();

/** How far the zone's clock is ahead of UTC at `instant`, in minutes. */
function offsetMinutes(instant: Date, timeZone: string): number {
  let format = wallFormats.get(timeZone);
  if (!format) {
    format = new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
      timeZone,
    });
    wallFormats.set(timeZone, format);
  }
  const parts = Object.fromEntries(
    format
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

const DAY_MS = 86_400_000;

/**
 * The instant a wall-clock time on a date happens in a time zone, as
 * Postgres's `timestamp at time zone` reads it, in zones east and west of
 * UTC alike: a time skipped when the clocks go forward lands just after the
 * change, and one they repeat when they go back is the second of the two.
 */
export function instantIn(date: string, time: string, timeZone: string): Date {
  const wall = utcOf(date).getTime() + minutesOf(time) * 60_000;
  // The zone's offset a day before and a day after: the same, unless the
  // clocks change close to this time.
  const before = offsetMinutes(new Date(wall - DAY_MS), timeZone);
  const after = offsetMinutes(new Date(wall + DAY_MS), timeZone);
  const byBefore = wall - before * 60_000;
  if (before === after) return new Date(byBefore);
  const byAfter = wall - after * 60_000;
  // A reading is real when the zone has that offset at that instant. When
  // only one is, it is the time; when both are (the hour repeats) or
  // neither is (the hour is skipped), the later instant, as Postgres's
  // DetermineTimeZoneOffset decides.
  const beforeReal = offsetMinutes(new Date(byBefore), timeZone) === before;
  const afterReal = offsetMinutes(new Date(byAfter), timeZone) === after;
  if (beforeReal !== afterReal) {
    return new Date(beforeReal ? byBefore : byAfter);
  }
  return new Date(Math.max(byBefore, byAfter));
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
 * they plan the schedule rather than fill a shift by default. Accountants
 * are off the staff and owe none.
 */
export function missingAvailability<T extends { userId: string; role: Role }>(
  members: readonly T[],
  submittedUserIds: Iterable<string>,
): T[] {
  const submitted = new Set(submittedUserIds);
  return members.filter(
    (member) =>
      member.role !== "owner" &&
      isStaff(member.role) &&
      !submitted.has(member.userId),
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
