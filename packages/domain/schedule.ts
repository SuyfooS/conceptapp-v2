import { z } from "zod";
import {
  type AvailabilityRange,
  instantIn,
  weekDates,
  weekdayOf,
} from "./availability";
import { minutesOf, rangeMinutes, timeOfDay } from "./hours";
import { holdsPermission, type Viewer } from "./modules";
import { calendarDate } from "./shabbat";
import { MAX_SHIFTS_IN_A_WEEK, type ShiftPattern, shiftsOn } from "./staffing";

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
    /**
     * The stored shift this is, when the screen read it from the week: the
     * database writes it in place, and keeps its swap requests and lists
     * (20261115000100_week_in_place.sql). A new shift has none, and so does
     * a copy of another: the same id twice is refused.
     */
    id: z.uuid().optional(),
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
 * inside the week, each stored shift once, each person once per shift, in
 * one of `positionKeys` when given one, and never on two shifts at the same
 * time. People being active members, and the ids being the week's own, is
 * the database's to check.
 */
export function weekSchedule(
  weekStart: string,
  positionKeys: readonly string[],
) {
  const days = new Set(weekDates(weekStart));
  const positions = new Set(positionKeys);
  return z
    .array(scheduledShift)
    .max(MAX_SHIFTS_IN_A_WEEK)
    .superRefine((shifts, ctx) => {
      const busy = new Map<string, { at: [number, number]; shift: number }[]>();
      const ids = new Set<string>();
      shifts.forEach((shift, i) => {
        if (shift.id !== undefined) {
          if (ids.has(shift.id)) {
            ctx.addIssue({
              code: "custom",
              message: "The same shift twice",
              path: [i, "id"],
            });
          }
          ids.add(shift.id);
        }
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
 * What the builder read of a saved week: each stored shift's id and the
 * digest the database gave it (`seen`, from `public.week_shifts`). Sent back
 * with the week, it tells which shifts changed since, so a stale screen
 * never undoes a change it did not see. Null for a week drawn from the
 * pattern, which replaces whatever is stored, as before.
 */
export const shiftBasis = z
  .record(z.uuid(), z.string().regex(/^[0-9a-f]{32}$/))
  .nullable();

export type ShiftBasis = NonNullable<z.infer<typeof shiftBasis>>;

/**
 * The builder's key: it starts again from what the server read after each
 * save or publish, with the new shifts' ids and what was seen, so a second
 * press never sends the same new shifts again.
 */
export function builderKey(
  weekStart: string,
  savedAt: string | null,
  publishedAt: string | null,
): string {
  return [weekStart, savedAt ?? "", publishedAt ?? ""].join("|");
}

/**
 * Whether two versions of a shift show the same: its day, name, hours,
 * people needed and pattern, and the same people in the same positions, in
 * any order. These are what the database digests of a shift
 * (`private.shift_digest`, which stays the authority), read off the screen's
 * own shape, for what the builder tells before it sends the week
 * (`swapsEndedBy` in ./swaps). Never sent as what was seen.
 */
export function sameShift(
  a: Pick<
    ScheduledShift,
    "day" | "name" | "start" | "end" | "needed" | "pattern" | "assignees"
  >,
  b: Pick<
    ScheduledShift,
    "day" | "name" | "start" | "end" | "needed" | "pattern" | "assignees"
  >,
): boolean {
  const people = (shift: Pick<ScheduledShift, "assignees">) =>
    shift.assignees
      .map((p) => `${p.user.toLowerCase()}=${p.position ?? ""}`)
      .sort()
      .join(",");
  return (
    a.day === b.day &&
    a.name.trim() === b.name.trim() &&
    a.start === b.start &&
    a.end === b.end &&
    a.needed === b.needed &&
    (a.pattern ?? null) === (b.pattern ?? null) &&
    people(a) === people(b)
  );
}

/**
 * A stored shift as it is now, with what is seen of it (`public.week_shifts`):
 * what the builder puts back after a save or publish was refused because the
 * shift changed meanwhile (`weekMoved`).
 */
export type ShiftAsNow = ScheduledShift & { id: string; seen: string };

/** A shift on the builder's screen, under an id of the screen's own. */
export type ScreenShift = { id: number; shift: ScheduledShift };

/**
 * The builder's week after a save or publish was refused because shifts it
 * changed had changed meanwhile (`weekMoved`, 40001 with hint `moved`):
 * - each of `now` takes the place of the screen's version of it, as it is now
 *   and in its place in the day (back among the shifts if the screen had
 *   removed it), keeping the screen's id, so an open sheet keeps its place;
 * - each of `gone` (deleted meanwhile) goes among the removed, with its stored
 *   id dropped, so bringing it back adds it as a new shift;
 * - everything else stays as it is on the screen, unsaved work included.
 * A shift of `now` the screen does not have (which it always has: the
 * database names only shifts the screen read) is added under `nextId()`.
 */
export function withShiftsAsNow(
  screen: { rows: readonly ScreenShift[]; removed: readonly ScreenShift[] },
  moved: { shifts: readonly ShiftAsNow[]; gone: readonly string[] },
  nextId: () => number,
): { rows: ScreenShift[]; removed: ScreenShift[] } {
  const asNow = new Map<string, ScheduledShift>(
    moved.shifts.map(({ seen: _, ...shift }) => [shift.id, shift]),
  );
  const gone = new Set(moved.gone);
  const idOf = (row: ScreenShift) => row.shift.id ?? "";
  const withoutId = ({ id, shift: { id: _, ...shift } }: ScreenShift) => ({
    id,
    shift,
  });

  const back: ScreenShift[] = [];
  const placed = new Set<string>();
  for (const row of [...screen.rows, ...screen.removed]) {
    const shift = asNow.get(idOf(row));
    if (shift && !placed.has(idOf(row))) {
      placed.add(idOf(row));
      back.push({ id: row.id, shift });
    }
  }
  for (const [id, shift] of asNow) {
    if (!placed.has(id)) back.push({ id: nextId(), shift });
  }

  let rows = screen.rows.filter(
    (row) => !asNow.has(idOf(row)) && !gone.has(idOf(row)),
  );
  for (const row of back) {
    const at = shiftSlot(
      rows.map((r) => r.shift),
      row.shift,
    );
    rows = [...rows.slice(0, at), row, ...rows.slice(at)];
  }
  return {
    rows,
    removed: [
      ...screen.removed
        .filter((row) => !asNow.has(idOf(row)))
        .map((row) => (gone.has(idOf(row)) ? withoutId(row) : row)),
      ...screen.rows.filter((row) => gone.has(idOf(row))).map(withoutId),
    ],
  };
}

/**
 * Whether sending `sent` for a week read as `read` would write anything: a
 * shift new on the screen, one not as it was read (`sameShift`), or one read
 * and not sent. After a write refused because shifts changed meanwhile, with
 * those put back as they are now (`withShiftsAsNow`), it says whether any of
 * the screen's own work is left to send.
 */
export function changedSince(
  read: readonly ScheduledShift[],
  sent: readonly ScheduledShift[],
): boolean {
  const before = new Map(
    read.flatMap((shift) => (shift.id ? [[shift.id, shift] as const] : [])),
  );
  const kept = new Set<string>();
  for (const shift of sent) {
    const was = shift.id ? before.get(shift.id) : undefined;
    if (!shift.id || !was || !sameShift(was, shift)) return true;
    kept.add(shift.id);
  }
  return [...before.keys()].some((id) => !kept.has(id));
}

/**
 * The day a phone shows after a write refused because shifts changed
 * meanwhile (`weekMoved`): the one on the screen while one of those shifts is
 * on it, else the earliest of theirs, so what is marked is in sight. A shift
 * changed meanwhile is on its day as it is now; one deleted meanwhile on its
 * day as the screen sent it.
 */
export function dayOfMoved(
  current: string,
  moved: {
    shifts: readonly Pick<ScheduledShift, "day">[];
    gone: readonly string[];
  },
  sent: readonly Pick<ScheduledShift, "id" | "day">[],
): string {
  const days = [
    ...moved.shifts.map((shift) => shift.day),
    ...sent
      .filter(
        (shift) => shift.id !== undefined && moved.gone.includes(shift.id),
      )
      .map((shift) => shift.day),
  ].sort();
  return days.includes(current) ? current : (days[0] ?? current);
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

/**
 * Whether a shift has begun at `now`: its start, on its day in the business's
 * time zone, is at or before the moment. This is the database's own moment
 * (`lower(private.shift_span(id)) <= at_time`), the one that refuses giving a
 * shift away, taking it or approving the swap. A start the clocks skip lands
 * just after the change, and one they repeat counts the second time, as
 * Postgres's `timestamp at time zone` reads them (`instantIn`, in any zone,
 * east or west of UTC). A shift past
 * midnight has begun from its start, and one that ended has begun too.
 * Wall-clock comparisons (`shiftPhase`) drift by an hour on those nights.
 */
export function shiftStarted(
  shift: Pick<ScheduledShift, "day" | "start">,
  now: Date,
  timeZone: string,
): boolean {
  return instantIn(shift.day, shift.start, timeZone).getTime() <= now.getTime();
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

/**
 * Whether the viewer builds the schedule: reads its drafts and everyone's
 * availability, saves the week and decides swaps (Orel's answer 6 of 15
 * November 2026). It is `schedule.edit` as the database answers it
 * (`public.my_permissions`): owners always, managers by default, and anyone
 * whose role an owner raised (the roles plan's R3). The database asks the same
 * (`private.builds_schedule`), at every read of a draft and every write.
 */
export function buildsSchedule(viewer: Viewer): boolean {
  return holdsPermission(viewer, "schedule.edit");
}

/**
 * Whether the viewer publishes the schedule: they build it and hold
 * `schedule.publish`, a switch under building, on by default (Q3). Someone
 * who builds without it saves drafts only, and can't change a published week,
 * which is only ever published again (`private.publishes_schedule`).
 */
export function publishesSchedule(viewer: Viewer): boolean {
  return buildsSchedule(viewer) && holdsPermission(viewer, "schedule.publish");
}

/**
 * Whether someone who builds the schedule changes a week: a draft always,
 * a published week only if they publish too, since it changes only by being
 * published again (Q3). Otherwise the builder only shows it, and what it
 * lacks (open places, short shifts) is not theirs to fill: no count or link
 * sends them there to fill it.
 */
export function changesWeek(
  publishes: boolean,
  week: { published: boolean },
): boolean {
  return publishes || !week.published;
}
