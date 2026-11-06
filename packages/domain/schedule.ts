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
 * How filled a list of shifts is, for "5 מתוך 7" and the coverage track:
 * the places taken and the places needed. Extra people on a full shift do
 * not make up for a place missing on another.
 */
export function coverageOf(
  shifts: readonly Pick<ScheduledShift, "needed" | "assignees">[],
): { have: number; need: number } {
  return shifts.reduce(
    (sum, shift) => ({
      have: sum.have + Math.min(shift.assignees.length, shift.needed),
      need: sum.need + shift.needed,
    }),
    { have: 0, need: 0 },
  );
}

/**
 * Where the schedule tab opens. A worker opens on their next shift, in
 * whichever week it falls. Everyone else, and a worker with nothing coming,
 * opens on today; or, when this week has nothing to show and next week does,
 * on next week's first shift.
 */
export function scheduleOpening<
  S extends Pick<ScheduledShift, "day" | "assignees">,
>({
  today,
  userId,
  manager,
  thisWeek,
  nextWeek,
}: {
  today: string;
  userId: string;
  manager: boolean;
  thisWeek: { dates: readonly string[]; shifts: readonly S[] };
  nextWeek: { dates: readonly string[]; shifts: readonly S[] };
}): { week: "this" | "next"; day: string } {
  const own = manager
    ? undefined
    : shiftsOf([...thisWeek.shifts, ...nextWeek.shifts], userId, today)[0]
        ?.shift.day;
  if (own) {
    return { week: thisWeek.dates.includes(own) ? "this" : "next", day: own };
  }
  const first = nextWeek.shifts[0]?.day;
  if (thisWeek.shifts.length === 0 && first) {
    return { week: "next", day: first };
  }
  return { week: "this", day: today };
}

/**
 * How full a list of shifts is, for a day's coverage: the people placed out
 * of the people needed. A shift with too many people counts as full and no
 * more, so it cannot hide a gap in another shift.
 */
export function shiftCoverage(
  shifts: readonly Pick<ScheduledShift, "needed" | "assignees">[],
): { filled: number; needed: number } {
  const needed = shifts.reduce((sum, shift) => sum + shift.needed, 0);
  return { filled: needed - scheduleGaps(shifts).people, needed };
}

/** What someone sent for one day, earliest first. */
export function rangesOn(
  ranges: readonly AvailabilityRange[],
  day: string,
): AvailabilityRange[] {
  return ranges
    .filter((range) => range.day === day)
    .sort((a, b) => minutesOf(a.start) - minutesOf(b.start));
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

/**
 * Where a person stands for one shift of the week being built:
 * - `assigned`: already on it;
 * - `busy`: on another shift that overlaps it;
 * - `available`: their availability covers the whole shift;
 * - `unavailable`: they answered, and it does not;
 * - `noAnswer`: they have not sent availability for the week.
 */
export type CandidateState =
  | "assigned"
  | "busy"
  | "available"
  | "unavailable"
  | "noAnswer";

export type Candidate<M> = { member: M; state: CandidateState };

const CANDIDATE_ORDER: Record<CandidateState, number> = {
  available: 0,
  noAnswer: 1,
  unavailable: 2,
  busy: 3,
  assigned: 4,
};

/**
 * The other shift of the week `userId` works during shift `index`, if any:
 * why someone cannot be put on it.
 */
export function overlappingShift<
  S extends Pick<ScheduledShift, "day" | "start" | "end" | "assignees">,
>(
  weekStart: string,
  shifts: readonly S[],
  index: number,
  userId: string,
): S | null {
  const shift = shifts[index];
  if (!shift) return null;
  const at = span(weekStart, shift);
  return (
    shifts.find((other, i) => {
      if (i === index || !other.assignees.some((a) => a.user === userId)) {
        return false;
      }
      const taken = span(weekStart, other);
      return taken[0] < at[1] && at[0] < taken[1];
    }) ?? null
  );
}

/**
 * Everyone on the team for shift `index` of the week starting on
 * `weekStart`, with where they stand, for the manager's "add a person"
 * list: available first, then those who have not answered, then those who
 * are not available, then those already working at the time. The team's
 * order is kept within each group.
 */
export function shiftCandidates<M extends { userId: string }>(
  weekStart: string,
  shifts: readonly Pick<
    ScheduledShift,
    "day" | "start" | "end" | "assignees"
  >[],
  index: number,
  members: readonly M[],
  answers: readonly { userId: string; ranges: readonly AvailabilityRange[] }[],
): Candidate<M>[] {
  const shift = shifts[index];
  if (!shift) return [];
  const rangesOf = new Map(answers.map((a) => [a.userId, a.ranges]));
  const stateOf = (userId: string): CandidateState => {
    if (shift.assignees.some((a) => a.user === userId)) return "assigned";
    if (overlappingShift(weekStart, shifts, index, userId)) return "busy";
    const ranges = rangesOf.get(userId);
    if (!ranges) return "noAnswer";
    return availableFor(shift, ranges) ? "available" : "unavailable";
  };
  return members
    .map((member) => ({ member, state: stateOf(member.userId) }))
    .map((c, order) => ({ ...c, order }))
    .sort(
      (a, b) =>
        CANDIDATE_ORDER[a.state] - CANDIDATE_ORDER[b.state] ||
        a.order - b.order,
    )
    .map(({ member, state }) => ({ member, state }));
}

/**
 * People put on two shifts of the week that overlap, for instance after a
 * manager moved one shift's hours. Both sides are listed, as
 * `${shiftIndex}:${userId}`, so each shift can say who clashes.
 */
export function doubleBooked(
  weekStart: string,
  shifts: readonly Pick<
    ScheduledShift,
    "day" | "start" | "end" | "assignees"
  >[],
): Set<string> {
  const spans = shifts.map((shift) => span(weekStart, shift));
  const clashes = new Set<string>();
  shifts.forEach((shift, i) => {
    for (const { user } of shift.assignees) {
      for (let j = i + 1; j < shifts.length; j++) {
        const other = shifts[j];
        const [a, b] = [spans[i], spans[j]];
        if (!other || !a || !b) continue;
        if (!other.assignees.some((p) => p.user === user)) continue;
        if (a[0] < b[1] && b[0] < a[1]) {
          clashes.add(`${i}:${user}`);
          clashes.add(`${j}:${user}`);
        }
      }
    }
  });
  return clashes;
}

/** What is wrong with a shift's details as typed, if anything. */
export type ShiftDetailsProblem = "name" | "time" | "same" | "needed";

/**
 * The manager's own edits to a shift (name, hours, people needed), checked
 * field by field as the form shows them: a name, two times that differ
 * (an end at or before the start runs past midnight), 1–50 people.
 */
export function shiftDetailsProblem(details: {
  name: string;
  start: string;
  end: string;
  needed: number;
}): ShiftDetailsProblem | null {
  const name = details.name.trim();
  if (name.length === 0 || name.length > 40) return "name";
  if (
    !timeOfDay.safeParse(details.start).success ||
    !timeOfDay.safeParse(details.end).success
  ) {
    return "time";
  }
  if (details.start === details.end) return "same";
  if (
    !Number.isInteger(details.needed) ||
    details.needed < 1 ||
    details.needed > 50
  ) {
    return "needed";
  }
  return null;
}

/**
 * Where a shift goes in the week's list, which runs day by day and
 * earliest first: after every shift that starts before it or at the same
 * time on the same day. Returns the index to insert at.
 */
export function shiftSlot(
  shifts: readonly Pick<ScheduledShift, "day" | "start">[],
  shift: Pick<ScheduledShift, "day" | "start">,
): number {
  const at = shifts.findIndex(
    (s) => s.day > shift.day || (s.day === shift.day && s.start > shift.start),
  );
  return at === -1 ? shifts.length : at;
}

/**
 * Who works each position on a shift, for "מלצר/ית 2 · טבח/ית 1": the
 * business's positions in their own order, only those someone is in.
 * People without a position are not counted here.
 */
export function positionCounts<P extends { key: string }>(
  shift: Pick<ScheduledShift, "assignees">,
  positions: readonly P[],
): { position: P; count: number }[] {
  return positions
    .map((position) => ({
      position,
      count: shift.assignees.filter((a) => a.position === position.key).length,
    }))
    .filter(({ count }) => count > 0);
}

/**
 * A saved week with positions the business no longer has taken off the
 * people in them, so a position removed from the settings does not make
 * the week impossible to save again. Everything else stays as it was.
 */
export function withKnownPositions<S extends ScheduledShift>(
  shifts: readonly S[],
  positionKeys: readonly string[],
): S[] {
  const known = new Set(positionKeys);
  return shifts.map((shift) => ({
    ...shift,
    assignees: shift.assignees.map((a) =>
      a.position === null || known.has(a.position)
        ? a
        : { ...a, position: null },
    ),
  }));
}

/** A shift someone works in a published week, and their position on it. */
export type OwnShift<S> = { shift: S; position: string | null };

/**
 * The shifts `userId` works, in the order given (day by day, earliest
 * first), from `from` on when given (a calendar date, e.g. today), so
 * "my next shifts" leaves out the days already behind.
 */
export function shiftsOf<S extends Pick<ScheduledShift, "day" | "assignees">>(
  shifts: readonly S[],
  userId: string,
  from?: string,
): OwnShift<S>[] {
  return shifts.flatMap((shift) => {
    if (from !== undefined && shift.day < from) return [];
    const mine = shift.assignees.find((a) => a.user === userId);
    return mine ? [{ shift, position: mine.position }] : [];
  });
}

/** How long a list of shifts is in all, in minutes (past midnight counts). */
export function shiftMinutes(
  shifts: readonly Pick<ScheduledShift, "start" | "end">[],
): number {
  return shifts.reduce((sum, s) => sum + rangeMinutes(s.start, s.end), 0);
}

/**
 * A week's shifts under each of its days, for the schedule as the team
 * reads it: every date of `dates` (also days without shifts), and on each
 * the shifts earliest first, then by name.
 */
export function shiftsByDay<
  S extends Pick<ScheduledShift, "day" | "start" | "name">,
>(
  dates: readonly string[],
  shifts: readonly S[],
): { day: string; shifts: S[] }[] {
  return dates.map((day) => ({
    day,
    shifts: shifts
      .filter((s) => s.day === day)
      .sort(
        (a, b) =>
          minutesOf(a.start) - minutesOf(b.start) ||
          a.name.localeCompare(b.name),
      ),
  }));
}
