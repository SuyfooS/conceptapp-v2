import { type AwaySpan, awayDuring, daysApart } from "./absences";
import {
  type AvailabilityRange,
  addDays,
  instantIn,
  weekDates,
  weekdayOf,
} from "./availability";
import {
  type ShabbatConflict,
  type ShabbatLimits,
  shabbatConflict,
} from "./availability-form";
import type { CopySource } from "./copy-week";
import { minutesOf, rangeMinutes } from "./hours";
import { WEEK_MINUTES } from "./payroll";
import { LIMITS } from "./payroll-flags";
import { PAYROLL_READINGS } from "./payroll-readings";
import {
  availableFor,
  type ScheduledShift,
  shiftSpan,
  shiftStarted,
  stillNeeded,
} from "./schedule";
import { isMinorOn } from "./youth";

/**
 * Filling the week on the builder's screen from the staff's availability
 * ("מילוי מהזמינות"). Like the copy, it only changes the screen: nothing is
 * saved or sent until the dock's own buttons send the week, through the same
 * write as any other change. The database then checks only that nobody works
 * two shifts at once (in the week and across its edges), never these rules:
 * they are the fill's own, and the screen's warnings stay the check of what a
 * manager does by hand.
 */

/** Days a week the fill gives anyone at most. */
export const FILL_MAX_DAYS = 6;
/** 42: the regular week (`WEEK_MINUTES` in payroll.ts). */
export const FILL_WEEK_HOURS = WEEK_MINUTES / 60;
/** 58: the regular week and the general permit's overtime (`LIMITS.weekOvertime`). */
export const FILL_WEEK_HOURS_MAX = (WEEK_MINUTES + LIMITS.weekOvertime) / 60;
/**
 * The hours a minor may be placed in, on the shift's own day: outside the
 * night the stricter reading gives one still at school
 * (`PAYROLL_READINGS.minorNight.school`, 20:00 to 08:00), which is payroll's
 * default too.
 */
export const FILL_MINOR_HOURS = {
  from: PAYROLL_READINGS.minorNight.school.to,
  to: PAYROLL_READINGS.minorNight.school.from,
} as const;

/**
 * Why someone whose availability covers a shift wasn't put on it, the first
 * of these that holds, in this order:
 * - `away`: recorded as away during it (`awayDuring`: its day, and the day
 *   after for a night past midnight);
 * - `minorHours`: a minor, and it isn't inside `FILL_MINOR_HOURS`;
 * - `minorLong`: a minor, and it is longer than 8 hours (7 on a Friday);
 * - `busy`: on another shift at the same time, the weeks either side
 *   included;
 * - `sameDay`: already on another shift that day;
 * - `rest`: less than 8 hours from another shift, before or after it, the
 *   weeks either side included, in real time as payroll's
 *   `restBetweenUnder8` measures it: a night the clocks go forward in is an
 *   hour shorter than its wall times say, one they go back in an hour longer;
 * - `days`: already working `FILL_MAX_DAYS` days of the week;
 * - `hours`: it would take them past the week's hours, or a minor's 40 when
 *   that is less (`fillWeekCap`, the number the sheet names).
 */
export type FillRule =
  | "away"
  | "minorHours"
  | "minorLong"
  | "busy"
  | "sameDay"
  | "rest"
  | "days"
  | "hours";

/**
 * Why a place stays open, the first that holds:
 * - `shabbat`: the shift reaches into Shabbat while the business is closed
 *   then, and no answer covers it: of nobody on it, whether the fill or the
 *   manager put them there, and of nobody else (an answer sent before the
 *   business closed on Shabbat still can);
 * - `nobody`: nobody who answered, and isn't on it already, covers it;
 * - `blocked`: some do, and each was stopped by a rule (`FillShift.blocked`).
 * A shift that reaches into Shabbat names it in `FillShift.shabbat` with the
 * other two as well.
 */
export type FillWhy = "shabbat" | "nobody" | "blocked";

export type FillShift = {
  /** Its index on the screen. */
  index: number;
  /** Who the fill puts on it, in the order they went on. */
  added: { user: string; position: string | null }[];
  /** Places still open after the fill. */
  open: number;
  /**
   * Null when nothing stays open. `nobody` means nobody else: when the shift
   * has anyone on it after the fill (`WeekFill.week[index].assignees`),
   * whoever put them there, the sheet says nobody else covers it, not
   * nobody.
   */
  why: FillWhy | null;
  /**
   * While places stay open on a shift that reaches into Shabbat while the
   * business is closed then: which side, and candle lighting or havdalah,
   * whatever `why` is. Beside a `why` other than `shabbat` an answer covers
   * the shift, so the sheet names the time without saying it has none.
   */
  shabbat: { side: ShabbatConflict; time: string } | null;
  /**
   * While places stay open: people who answered, not on it, whose ranges
   * that day overlap it without covering it.
   */
  partial: number;
  /**
   * While places stay open: everyone not on it whose ranges cover it, each
   * with the first rule that stopped them, by id.
   */
  blocked: { user: string; rule: FillRule }[];
};

export type FillPerson = {
  user: string;
  /** Shifts and minutes in the week after the fill, the fill's included. */
  shifts: number;
  minutes: number;
  /** Shifts the fill gave them. */
  added: number;
};

export type WeekFill = {
  /** The same length, order and ids as `screen`, with people only appended. */
  week: ScheduledShift[];
  /** Every shift that had an open place, by day, then start, then index. */
  shifts: FillShift[];
  /** Places the fill filled. */
  places: number;
  /** Different people it put on them. */
  people: number;
  /** People still needed on the shifts to start, before and after. */
  openBefore: number;
  openAfter: number;
  /** Staff who sent an answer for the week. */
  answered: number;
  /**
   * Everyone who answered, after the fill, fewest shifts first, then by id
   * (the screen orders those by name).
   */
  byPerson: FillPerson[];
  /** Answered with at least one range, and has no shift in the week after the fill. */
  unplaced: string[];
};

/**
 * Who of the team is a minor on some day of the week starting on
 * `weekStart`, from each one's 18th birthday (`youth_until`): someone who
 * turns 18 during the week counts as a minor for all of it, the stricter
 * choice. `youth` is id to `youth_until`, as `getTeamYouth` gives it. Ids
 * only, sorted: the day itself never needs to reach a browser.
 */
export function weekMinors(
  weekStart: string,
  youth: Iterable<readonly [userId: string, youthUntil: string | null]>,
): string[] {
  const minors = new Set<string>();
  for (const [userId, youthUntil] of youth) {
    if (isMinorOn(weekStart, youthUntil)) minors.add(userId);
  }
  return [...minors].sort(byText);
}

/**
 * The most hours a week the fill gives someone: the week's hours
 * (`weekHours`), or a minor's 40 (`LIMITS.minorWeek`) when that is less. It
 * is the number the sheet names when `hours` stopped someone.
 */
export function fillWeekCap(weekHours: number, minor: boolean): number {
  return minor ? Math.min(weekHours, LIMITS.minorWeek / 60) : weekHours;
}

const byText = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

/**
 * The week's tie-break that changes every week: FNV-1a (32 bits) of the
 * week's first day and the person's id. Neither the team's order nor the
 * alphabet decides, and an exact tie goes to someone else another week.
 */
function rotation(weekStart: string, userId: string): number {
  const text = `${weekStart}:${userId}`;
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

/**
 * The kind of a shift, for sharing out evenings, Fridays and nights: its
 * pattern, or its name and start for one added by hand.
 */
function kindOf(shift: Pick<ScheduledShift, "pattern" | "name" | "start">) {
  return shift.pattern !== null
    ? `pattern:${shift.pattern}`
    : `hand:${shift.name.trim()}|${shift.start}`;
}

type Span = [number, number];

/**
 * A shift in time, twice: `at` on the wall clock, in minutes from the week's
 * first midnight (`shiftSpan`), for `busy`; `real` in minutes of real time,
 * as `private.shift_span` places it, for `rest`.
 */
type Timed = { at: Span; real: Span };

/** What one person who answered has in the week as it stands. */
type Person = {
  id: string;
  ranges: AvailabilityRange[];
  minor: boolean;
  /** The most minutes the fill lets them reach. */
  cap: number;
  /** Their shifts, edges included. */
  spans: Timed[];
  /** The days of the week they work. */
  days: Set<string>;
  minutes: number;
  shifts: number;
  kinds: Map<string, number>;
  /** Minutes last week, when it is the week just before; else 0. */
  lastMinutes: number;
  turn: number;
  added: number;
};

/** One shift with an open place, as the rules read it. */
type Place = Timed & {
  index: number;
  shift: ScheduledShift;
  minutes: number;
  kind: string;
  /** Within a minor's hours (`FILL_MINOR_HOURS`). */
  minorHours: boolean;
  /** No longer than a minor's day (7 hours on a Friday). */
  minorLong: boolean;
  added: { user: string; position: string | null }[];
  /**
   * Who covers it and isn't on it, with the first rule that stops them
   * (null: they may take a place). Kept up to date as people go on shifts.
   */
  candidates: Map<string, FillRule | null>;
  eligible: number;
};

const overlaps = (a: Span, b: Span) => a[0] < b[1] && b[0] < a[1];

/**
 * Open places on the screen's week filled from what the staff sent:
 * 1. a place is open on a shift that hasn't begun at `now` and needs more
 *    people; a shift that has begun, is full or is over-full is never
 *    touched;
 * 2. the fill only ever appends someone to an open shift's people: it never
 *    moves, removes or re-positions anyone, never changes a shift and never
 *    passes `needed`;
 * 3. only staff who sent an answer for the week take a place (owners, who owe
 *    none, only when they sent one), and only on a shift their ranges that
 *    day cover whole, joined where they touch (`availableFor`); an answer
 *    without ranges covers nothing;
 * 4. each person's shifts, days, minutes and kinds come from the whole week
 *    as it stands (begun shifts and the manager's placements included), with
 *    last week's shifts (when `lastWeek` is the week just before) and
 *    `nextDays` as spans only, so a night or a morning across the edge is
 *    seen;
 * 5. someone may take a place only while every `FillRule` holds; the first
 *    that fails is why they didn't;
 * 6. the place with the least slack (people who may take it, less people it
 *    needs) is filled first, ties by day, then start, then the screen's
 *    order; the fill stops when no open place has anyone who may take it;
 * 7. who takes it: fewest minutes in the week so far, then fewest shifts of
 *    the same kind, then fewest shifts, then fewest minutes last week, then
 *    the week's rotation (`rotation`), then the id;
 * 8. each goes on in the position they held most last week on shifts of the
 *    same kind, else the one they held most last week, ties by the
 *    business's order, else none;
 * 9. each place left open says why (`FillWhy`).
 * The order of `staff`, `answers` and `away` never matters, and the same
 * screen, answers and days away always give the same fill.
 */
export function fillFromAvailability(input: {
  weekStart: string;
  /** The screen's shifts as they stand, in the builder's order. */
  screen: readonly ScheduledShift[];
  /** Who may be put on a shift: the builder's staff. Order never matters. */
  staff: readonly string[];
  answers: readonly { userId: string; ranges: readonly AvailabilityRange[] }[];
  /** Days away (`public.team_away`), read to the day after the week. */
  away: readonly AwaySpan[];
  /** Who is a minor on any day of the week, ids only; empty while the clock is off. */
  minors: ReadonlySet<string>;
  /** The week before (`currentCopySource`); null when nobody built it. */
  lastWeek: CopySource | null;
  /** Next week's first two days, when the screen is the week running now; else []. */
  nextDays: readonly ScheduledShift[];
  /** Most hours a week the fill gives anyone (`fillWeekHours`). */
  weekHours: number;
  /** `week.shabbat`: set only while `closedOnShabbat` is on. */
  shabbat: ShabbatLimits | null;
  positionKeys: readonly string[];
  /** The builder's clock; null where nothing is past (the design twins). */
  now: Date | null;
  timeZone: string;
}): WeekFill {
  const { weekStart, screen, away, minors, lastWeek, now, timeZone } = input;

  // A shift in time, on the wall clock and in real time. Each date and time
  // is read once: a week has a few hundred.
  const instants = new Map<string, number>();
  const realMinute = (date: string, time: string) => {
    const key = `${date} ${time}`;
    let minute = instants.get(key);
    if (minute === undefined) {
      minute = instantIn(date, time, timeZone).getTime() / 60_000;
      instants.set(key, minute);
    }
    return minute;
  };
  const timed = (shift: ScheduledShift): Timed => ({
    at: shiftSpan(weekStart, shift),
    real: [
      realMinute(shift.day, shift.start),
      // Past midnight it ends the next day, as `rangeMinutes` reads it.
      realMinute(
        minutesOf(shift.end) <= minutesOf(shift.start)
          ? addDays(shift.day, 1)
          : shift.day,
        shift.end,
      ),
    ],
  });

  // Rule 3: the pool, staff who answered. Two answers of one person join.
  const staff = new Set(input.staff);
  const rangesOf = new Map<string, AvailabilityRange[]>();
  for (const answer of input.answers) {
    if (!staff.has(answer.userId)) continue;
    rangesOf.set(answer.userId, [
      ...(rangesOf.get(answer.userId) ?? []),
      ...answer.ranges,
    ]);
  }
  const people = new Map<string, Person>(
    [...rangesOf.keys()].sort(byText).map((id) => {
      const minor = minors.has(id);
      return [
        id,
        {
          id,
          ranges: rangesOf.get(id) ?? [],
          minor,
          cap: fillWeekCap(input.weekHours, minor) * 60,
          spans: [],
          days: new Set(),
          minutes: 0,
          shifts: 0,
          kinds: new Map(),
          lastMinutes: 0,
          turn: rotation(weekStart, id),
          added: 0,
        },
      ];
    }),
  );

  // Rule 4: what each person already has.
  const takes = (person: Person, shift: ScheduledShift, time: Timed) => {
    const kind = kindOf(shift);
    person.spans.push(time);
    person.days.add(shift.day);
    person.minutes += rangeMinutes(shift.start, shift.end);
    person.shifts += 1;
    person.kinds.set(kind, (person.kinds.get(kind) ?? 0) + 1);
  };
  for (const shift of screen) {
    const time = timed(shift);
    for (const { user } of shift.assignees) {
      const person = people.get(user);
      if (person) takes(person, shift, time);
    }
  }
  if (lastWeek && addDays(lastWeek.start, 7) === weekStart) {
    const days = new Set(weekDates(lastWeek.start));
    const begins = realMinute(weekStart, "00:00");
    for (const shift of lastWeek.shifts) {
      if (!days.has(shift.day)) continue;
      const time = timed(shift);
      for (const { user } of shift.assignees) {
        const person = people.get(user);
        if (!person) continue;
        person.lastMinutes += rangeMinutes(shift.start, shift.end);
        // Only one that ends less than 8 hours before the week begins can
        // stop anyone.
        if (time.real[1] > begins - LIMITS.restBetween) {
          person.spans.push(time);
        }
      }
    }
  }
  for (const shift of input.nextDays) {
    if (daysApart(weekStart, shift.day) < 7) continue;
    const time = timed(shift);
    for (const { user } of shift.assignees) people.get(user)?.spans.push(time);
  }

  // Rule 8: the positions each held last week, by kind and in all.
  const keys = new Set(input.positionKeys);
  const order = new Map(input.positionKeys.map((key, i) => [key, i]));
  const held = new Map<string, Map<string, Map<string, number>>>();
  for (const shift of lastWeek?.shifts ?? []) {
    for (const { user, position } of shift.assignees) {
      if (position === null || !keys.has(position) || !people.has(user)) {
        continue;
      }
      const own = held.get(user) ?? new Map<string, Map<string, number>>();
      held.set(user, own);
      for (const kind of [kindOf(shift), ""]) {
        const counts = own.get(kind) ?? new Map<string, number>();
        own.set(kind, counts);
        counts.set(position, (counts.get(position) ?? 0) + 1);
      }
    }
  }
  const mostOf = (counts: Map<string, number> | undefined) =>
    [...(counts ?? new Map<string, number>())].sort(
      ([a, x], [b, y]) => y - x || (order.get(a) ?? 0) - (order.get(b) ?? 0),
    )[0]?.[0] ?? null;
  const positionFor = (user: string, kind: string): string | null => {
    const own = held.get(user);
    return mostOf(own?.get(kind)) ?? mostOf(own?.get(""));
  };

  // Rule 5, in `FillRule`'s order. The first three never change; the rest
  // only ever start to fail as the person takes shifts.
  const ruleOf = (place: Place, person: Person): FillRule | null => {
    if (awayDuring(away, person.id, place.shift)) return "away";
    if (person.minor && !place.minorHours) return "minorHours";
    if (person.minor && !place.minorLong) return "minorLong";
    if (person.spans.some(({ at }) => overlaps(at, place.at))) return "busy";
    if (person.days.has(place.shift.day)) return "sameDay";
    if (
      person.spans.some(
        ({ real: [from, to] }) =>
          Math.max(from - place.real[1], place.real[0] - to) <
          LIMITS.restBetween,
      )
    ) {
      return "rest";
    }
    if (person.days.size >= FILL_MAX_DAYS) return "days";
    if (person.minutes + place.minutes > person.cap) return "hours";
    return null;
  };

  // Rule 1: the open places, by day, then start, then the screen's order.
  const minorFrom = minutesOf(FILL_MINOR_HOURS.from);
  const minorTo = minutesOf(FILL_MINOR_HOURS.to);
  const week = screen.map((shift) => ({
    ...shift,
    assignees: [...shift.assignees],
  }));
  const places: Place[] = [];
  week.forEach((shift, index) => {
    if (stillNeeded(shift) === 0) return;
    if (now !== null && shiftStarted(shift, now, timeZone)) return;
    const start = minutesOf(shift.start);
    const minutes = rangeMinutes(shift.start, shift.end);
    places.push({
      ...timed(shift),
      index,
      shift,
      minutes,
      kind: kindOf(shift),
      minorHours: start >= minorFrom && start + minutes <= minorTo,
      minorLong:
        minutes <=
        (weekdayOf(shift.day) === 5 ? LIMITS.minorEve : LIMITS.minorDay),
      added: [],
      candidates: new Map(),
      eligible: 0,
    });
  });
  places.sort(
    (a, b) =>
      byText(a.shift.day, b.shift.day) ||
      a.at[0] - b.at[0] ||
      a.index - b.index,
  );
  const openBefore = places.reduce((sum, p) => sum + stillNeeded(p.shift), 0);

  // Who covers what, with their rule, worked out once (rule 5's cache).
  const covering = new Map<string, Place[]>();
  for (const place of places) {
    const on = new Set(place.shift.assignees.map((a) => a.user));
    for (const person of people.values()) {
      if (on.has(person.id) || !availableFor(place.shift, person.ranges)) {
        continue;
      }
      const rule = ruleOf(place, person);
      place.candidates.set(person.id, rule);
      if (rule === null) place.eligible += 1;
      const theirs = covering.get(person.id) ?? [];
      theirs.push(place);
      covering.set(person.id, theirs);
    }
  }

  // Rule 7: who goes first.
  const before = (a: Person, b: Person, kind: string) =>
    a.minutes - b.minutes ||
    (a.kinds.get(kind) ?? 0) - (b.kinds.get(kind) ?? 0) ||
    a.shifts - b.shifts ||
    a.lastMinutes - b.lastMinutes ||
    a.turn - b.turn ||
    byText(a.id, b.id);

  // Rule 6: the scarcest place first, until nobody may take one.
  for (;;) {
    let next: Place | null = null;
    let least = Number.POSITIVE_INFINITY;
    for (const place of places) {
      const needs = stillNeeded(place.shift);
      if (needs === 0 || place.eligible === 0) continue;
      if (place.eligible - needs < least) {
        least = place.eligible - needs;
        next = place;
      }
    }
    if (!next) break;
    let pick: Person | null = null;
    for (const [id, rule] of next.candidates) {
      const person = people.get(id);
      if (rule !== null || !person) continue;
      if (!pick || before(person, pick, next.kind) < 0) pick = person;
    }
    if (!pick) break;

    const added = { user: pick.id, position: positionFor(pick.id, next.kind) };
    next.shift.assignees.push(added);
    next.added.push(added);
    next.candidates.delete(pick.id);
    next.eligible -= 1;
    takes(pick, next.shift, { at: next.at, real: next.real });
    pick.added += 1;
    // Only the person placed reads differently now, on every place they cover.
    for (const place of covering.get(pick.id) ?? []) {
      const was = place.candidates.get(pick.id);
      if (was === undefined) continue;
      const rule = ruleOf(place, pick);
      place.candidates.set(pick.id, rule);
      place.eligible += (rule === null ? 1 : 0) - (was === null ? 1 : 0);
    }
  }

  // Rule 9: why each place left open is open.
  const shifts = places.map((place): FillShift => {
    const open = stillNeeded(place.shift);
    if (open === 0) {
      return {
        index: place.index,
        added: place.added,
        open,
        why: null,
        shabbat: null,
        partial: 0,
        blocked: [],
      };
    }
    const blocked = [...place.candidates]
      .flatMap(([user, rule]) => (rule === null ? [] : [{ user, rule }]))
      .sort((a, b) => byText(a.user, b.user));
    // In minutes of the shift's own day, as availability reads it.
    const from = minutesOf(place.shift.start);
    const hours: Span = [from, from + place.minutes];
    const on = new Set(place.shift.assignees.map((a) => a.user));
    const partial = [...people.values()].filter(
      (person) =>
        !on.has(person.id) &&
        !place.candidates.has(person.id) &&
        person.ranges.some((range) => {
          if (range.day !== place.shift.day) return false;
          const start = minutesOf(range.start);
          const span: Span = [
            start,
            start + rangeMinutes(range.start, range.end),
          ];
          return overlaps(span, hours);
        }),
    ).length;
    const side = input.shabbat
      ? shabbatConflict(place.shift, input.shabbat)
      : null;
    const shabbat =
      side && input.shabbat
        ? {
            side,
            time:
              side === "friday"
                ? input.shabbat.candleLighting
                : input.shabbat.havdalah,
          }
        : null;
    // Shabbat is the reason only while no answer covers the shift: of nobody
    // on it, whoever put them there, and of nobody a rule stopped. So the same
    // week gives the same reason, whether the fill or the manager placed them.
    const covered = [...on].some((user) => {
      const ranges = people.get(user)?.ranges;
      return ranges !== undefined && availableFor(place.shift, ranges);
    });
    const why: FillWhy =
      shabbat && !covered && blocked.length === 0
        ? "shabbat"
        : blocked.length > 0
          ? "blocked"
          : "nobody";
    return {
      index: place.index,
      added: place.added,
      open,
      why,
      shabbat,
      partial,
      blocked,
    };
  });

  const filled = new Set(
    places.flatMap((place) => (place.added.length > 0 ? [place.index] : [])),
  );
  const result = week.map((shift, i) =>
    filled.has(i) ? shift : (screen[i] ?? shift),
  );
  const everyone = [...people.values()];
  return {
    week: result,
    shifts,
    places: places.reduce((sum, place) => sum + place.added.length, 0),
    people: everyone.filter((person) => person.added > 0).length,
    openBefore,
    openAfter: places.reduce((sum, p) => sum + stillNeeded(p.shift), 0),
    answered: everyone.length,
    byPerson: everyone
      .map(({ id, shifts, minutes, added }) => ({
        user: id,
        shifts,
        minutes,
        added,
      }))
      .sort((a, b) => a.shifts - b.shifts || byText(a.user, b.user)),
    unplaced: everyone
      .filter((person) => person.ranges.length > 0 && person.shifts === 0)
      .map((person) => person.id),
  };
}
