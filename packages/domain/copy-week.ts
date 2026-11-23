import { type AvailabilityRange, addDays, weekDates } from "./availability";
import { minutesOf, rangeMinutes } from "./hours";
import { weekBuilt } from "./running-week";
import {
  availableFor,
  type ScheduledShift,
  shiftSlot,
  shiftStarted,
  withKnownPositions,
} from "./schedule";
import { MAX_SHIFTS_IN_A_WEEK } from "./staffing";

/**
 * Copying last week into the week on the builder's screen ("העתקה מהשבוע
 * שעבר"). It only changes the screen: nothing is saved or sent until the
 * dock's own buttons send the week, through the same write as any other
 * change, so every rule of the database still applies then. Each day takes
 * the shifts the same day had last week, with their names, hours, people
 * needed, pattern and people in their positions, and never a shift that
 * would start at or before now.
 */

/** Last week as the copy reads it: its first day, whether it went out, its shifts. */
export type CopySource = {
  /** Its first day: the week on the screen less seven days. */
  start: string;
  /** False for a draft only saved, which the sheet says it copies. */
  published: boolean;
  /** As stored, without ids, in positions the business still has. */
  shifts: ScheduledShift[];
};

/**
 * Last week, when there is something to copy from it: someone built it
 * (saved or published, `weekBuilt`) and it has shifts in it. Each shift
 * loses its id, since a copy is a new shift, and a position the business no
 * longer has comes off the person in it, as on every read of a week.
 */
export function copySourceOf(
  week: {
    start: string;
    savedAt: string | null;
    publishedAt: string | null;
    shifts: readonly ScheduledShift[];
  },
  positionKeys: readonly string[],
): CopySource | null {
  if (!weekBuilt(week)) return null;
  const days = new Set(weekDates(week.start));
  const shifts = withKnownPositions(
    week.shifts
      .filter((shift) => days.has(shift.day))
      .map(({ day, name, start, end, needed, pattern, assignees }) => ({
        day,
        name,
        start,
        end,
        needed,
        pattern,
        assignees: assignees.map(({ user, position }) => ({ user, position })),
      })),
    positionKeys,
  );
  if (shifts.length === 0) return null;
  return { start: week.start, published: week.publishedAt !== null, shifts };
}

/**
 * Why someone on a shift last week isn't on its copy:
 * - `gone`: no longer on the team (counted, never named: their name is no
 *   longer the builder's to read);
 * - `offStaff`: on the team but off the staff (an accountant now);
 * - `unavailable`: they sent availability for this week, and it doesn't
 *   cover the shift (someone who sent nothing is copied);
 * - `busy`: they would be on two shifts at once, with one that stays on the
 *   screen or with last week's night that runs into this week's first day.
 */
export type CopySkipReason = "gone" | "offStaff" | "unavailable" | "busy";

export type CopySkip = {
  reason: CopySkipReason;
  user: string;
  /** The shift as copied: this week's day, its name and hours. */
  shift: Pick<ScheduledShift, "day" | "name" | "start" | "end">;
};

/**
 * What the copy does to one day of the week on the screen:
 * - `copied`: last week's shifts take the place of its own still to start;
 * - `kept`: someone is on one of its shifts still to start, so it stays as
 *   it is (unless the manager chose to replace those days too);
 * - `none`: last week had no shift that day, so it stays as it is;
 * - `past`: every shift it had last week would start at or before now.
 */
export type CopyDay = {
  date: string;
  state: "copied" | "kept" | "none" | "past";
  /** Shifts copied onto it. */
  copied: number;
  /** Its own shifts that make way for them. */
  replaced: number;
};

/** A place in the week as it will stand: a screen shift by its index, or a copy. */
export type CopyPlace = { kept: number } | { copied: ScheduledShift };

export type WeekCopy = {
  /** The week as it will stand, day by day and earliest first. */
  week: CopyPlace[];
  days: CopyDay[];
  /** Shifts copied. */
  shifts: number;
  /** Different people copied onto them. */
  people: number;
  /** Places those people fill, all told. */
  places: number;
  /** Who wasn't copied, and why: day by day, then by start, then by person. */
  skipped: CopySkip[];
  /**
   * Days with someone on a shift still to start, onto which last week has
   * shifts to copy: what the switch to replace them decides, counted the same
   * with it on or off.
   */
  staffedDays: number;
  /** The week would hold more than `MAX_SHIFTS_IN_A_WEEK`: nothing copies. */
  tooMany: boolean;
};

const byDayAndStart = (a: ScheduledShift, b: ScheduledShift) =>
  a.day.localeCompare(b.day) || minutesOf(a.start) - minutesOf(b.start);

/**
 * Last week copied onto the week on the screen, by weekday, as the copy
 * sheet shows it and the builder puts it in place:
 * 1. each of last week's shifts goes to the same day of this week, and one
 *    outside last week is ignored;
 * 2. a copy that would start at or before `now` isn't made, and a day whose
 *    copies all would is `past`;
 * 3. a day last week had no shift on is `none`, and stays as it is;
 * 4. a shift on the screen that has begun at `now` is never touched, and
 *    doesn't make its day `kept`;
 * 5. a day with someone on a shift still to start is `kept`, unless
 *    `replace`;
 * 6. otherwise its shifts still to start make way, and last week's come in;
 * 7. on each copy, someone not on the team is `gone`, someone off the staff
 *    `offStaff`, someone whose answer for this week doesn't cover it
 *    `unavailable`, and someone who sent no answer is copied;
 * 8. then someone who would work another shift at the same time, in the week
 *    as it will stand or last week's night into this week's first day, is
 *    `busy`: taken off the copy, never off a shift that stays;
 * 9. positions are as `copySourceOf` left them, the business's own;
 * 10. the screen's shifts keep their order, and each copy goes in its place
 *    in the day (`shiftSlot`);
 * 11. a week that would hold more than `MAX_SHIFTS_IN_A_WEEK` is `tooMany`.
 * A copied shift keeps its place open for whoever was taken off it: the
 * builder's counts show it. Spans are in minutes from the week's first
 * midnight, as the builder's own check of two shifts at once reads them.
 */
export function copyLastWeek(input: {
  weekStart: string;
  /** The screen's shifts as they stand, in the builder's order. */
  screen: readonly ScheduledShift[];
  source: CopySource;
  /** Who may be put on a shift: the builder's staff. */
  staff: readonly string[];
  /** Everyone on the team, the staff included. */
  people: readonly string[];
  answers: readonly { userId: string; ranges: readonly AvailabilityRange[] }[];
  /** Days with people on them take last week's shifts too. */
  replace: boolean;
  /** The builder's clock; null for a screen where nothing is past. */
  now: Date | null;
  timeZone: string;
}): WeekCopy {
  const { weekStart, screen, source, now, timeZone } = input;
  const dates = weekDates(weekStart);
  const sourceDates = weekDates(source.start);
  const begun = (shift: Pick<ScheduledShift, "day" | "start">) =>
    now !== null && shiftStarted(shift, now, timeZone);

  // Rule 1: by weekday, the same day of this week.
  const moved = source.shifts
    .flatMap((shift) => {
      const day = dates[sourceDates.indexOf(shift.day)];
      return day === undefined ? [] : [{ ...shift, day }];
    })
    .sort(byDayAndStart);

  const days: CopyDay[] = [];
  const makesWay = new Set<number>();
  const copies: ScheduledShift[] = [];
  let staffedDays = 0;
  for (const date of dates) {
    const from = moved.filter((shift) => shift.day === date);
    if (from.length === 0) {
      days.push({ date, state: "none", copied: 0, replaced: 0 });
      continue;
    }
    const ahead = from.filter((shift) => !begun(shift));
    if (ahead.length === 0) {
      days.push({ date, state: "past", copied: 0, replaced: 0 });
      continue;
    }
    const own = screen.flatMap((shift, i) =>
      shift.day === date && !begun(shift) ? [i] : [],
    );
    const staffed = own.some((i) => (screen[i]?.assignees.length ?? 0) > 0);
    if (staffed) staffedDays += 1;
    if (staffed && !input.replace) {
      days.push({ date, state: "kept", copied: 0, replaced: 0 });
      continue;
    }
    for (const i of own) makesWay.add(i);
    copies.push(...ahead);
    days.push({
      date,
      state: "copied",
      copied: ahead.length,
      replaced: own.length,
    });
  }

  const stays = screen.flatMap((_, i) => (makesWay.has(i) ? [] : [i]));
  const spanOf = (
    shift: Pick<ScheduledShift, "day" | "start" | "end">,
  ): [number, number] => {
    const from = dates.indexOf(shift.day) * 1440 + minutesOf(shift.start);
    return [from, from + rangeMinutes(shift.start, shift.end)];
  };
  // Whom the week as it will stand has where: every shift that stays, and
  // last week's night that runs past midnight into this week's first day.
  const taken = new Map<string, [number, number][]>();
  const take = (user: string, at: [number, number]) =>
    taken.set(user, [...(taken.get(user) ?? []), at]);
  for (const i of stays) {
    const shift = screen[i];
    if (!shift) continue;
    for (const person of shift.assignees) take(person.user, spanOf(shift));
  }
  if (addDays(source.start, 7) === weekStart) {
    for (const shift of source.shifts) {
      const index = sourceDates.indexOf(shift.day);
      if (index === -1) continue;
      const from = (index - 7) * 1440 + minutesOf(shift.start);
      const to = from + rangeMinutes(shift.start, shift.end);
      if (to <= 0) continue;
      for (const person of shift.assignees) take(person.user, [from, to]);
    }
  }
  const busy = (user: string, at: [number, number]) =>
    (taken.get(user) ?? []).some(([from, to]) => from < at[1] && at[0] < to);

  const named = new Set(input.people);
  const onStaff = new Set(input.staff);
  const rangesOf = new Map(input.answers.map((a) => [a.userId, a.ranges]));
  const skipped: CopySkip[] = [];
  const copied = copies.map((shift): ScheduledShift => {
    const at = spanOf(shift);
    const assignees = shift.assignees.filter((person) => {
      const ranges = rangesOf.get(person.user);
      const reason: CopySkipReason | null = !named.has(person.user)
        ? "gone"
        : !onStaff.has(person.user)
          ? "offStaff"
          : ranges && !availableFor(shift, ranges)
            ? "unavailable"
            : busy(person.user, at)
              ? "busy"
              : null;
      if (reason) {
        const { day, name, start, end } = shift;
        skipped.push({
          reason,
          user: person.user,
          shift: { day, name, start, end },
        });
        return false;
      }
      take(person.user, at);
      return true;
    });
    return { ...shift, assignees };
  });

  // Rule 10: the screen's order, each copy slotted into its day.
  const week: CopyPlace[] = stays.map((kept) => ({ kept }));
  const shiftOf = (place: CopyPlace) =>
    "kept" in place
      ? (screen[place.kept] ?? { day: "", start: "" })
      : place.copied;
  for (const shift of copied) {
    week.splice(shiftSlot(week.map(shiftOf), shift), 0, { copied: shift });
  }

  const placed = copied.flatMap((shift) => shift.assignees.map((a) => a.user));
  return {
    week,
    days,
    shifts: copied.length,
    people: new Set(placed).size,
    places: placed.length,
    skipped: skipped.sort(
      (a, b) =>
        a.shift.day.localeCompare(b.shift.day) ||
        minutesOf(a.shift.start) - minutesOf(b.shift.start) ||
        a.user.localeCompare(b.user),
    ),
    staffedDays,
    tooMany: week.length > MAX_SHIFTS_IN_A_WEEK,
  };
}

/**
 * Whether the week was saved since the screen that copied into it read it:
 * `read` is the save moment the screen read ("" for a week never saved),
 * `savedAt` the one stored now. Saving that copy would write a second copy
 * over whatever was saved meanwhile, so it is refused instead.
 */
export function copiedOver(read: string, savedAt: string | null): boolean {
  return read !== (savedAt ?? "");
}
