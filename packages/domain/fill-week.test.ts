import { describe, expect, it } from "vitest";
import { type AwaySpan, awayDuring } from "./absences";
import {
  type AvailabilityRange,
  addDays,
  instantIn,
  weekDates,
  weekdayOf,
} from "./availability";
import {
  parseAvailabilityForm,
  type ShabbatLimits,
  shabbatLimits,
  shiftHoursOf,
  suggestedDay,
} from "./availability-form";
import type { CopySource } from "./copy-week";
import {
  FILL_MAX_DAYS,
  FILL_REST_HOURS,
  FILL_WEEK_HOURS,
  FILL_WEEK_HOURS_MAX,
  fillFromAvailability,
  type WeekFill,
} from "./fill-week";
import { minutesOf } from "./hours";
import { LIMITS } from "./payroll-flags";
import {
  availableFor,
  doubleBooked,
  draftWeek,
  overlappingShift,
  type ScheduledShift,
  shiftCandidates,
  shiftSlot,
  weekSchedule,
} from "./schedule";
import { ISRAEL_TIME_ZONE, ISRAELI_CITIES } from "./shabbat";
import { shabbatTimes } from "./shabbat-times";
import type { ShiftPattern } from "./staffing";

const zone = ISRAEL_TIME_ZONE;
// Sunday 6 December 2026 to Saturday 12 December; winter time (UTC+2).
const WEEK = "2026-12-06";
const D = weekDates(WEEK);
const day = (n: number) => addDays(WEEK, n);

const noa = "65000000-0000-4000-a000-000000000001";
const yoav = "65000000-0000-4000-a000-000000000002";
const maya = "65000000-0000-4000-a000-000000000003";
const itay = "65000000-0000-4000-a000-000000000004";
const shiran = "65000000-0000-4000-a000-000000000005";
const uri = "65000000-0000-4000-a000-000000000006";
const tamar = "65000000-0000-4000-a000-000000000007";
const omer = "65000000-0000-4000-a000-000000000008";
const liya = "65000000-0000-4000-a000-000000000009";
const STAFF = [noa, yoav, maya, itay, shiran, uri, tamar, omer];
const ID = (n: number) => `7a000000-0000-4000-a000-${`${n}`.padStart(12, "0")}`;

type Person = string | [string, string | null];

const shift = (
  on: string,
  start: string,
  end: string,
  people: Person[] = [],
  extra: Partial<ScheduledShift> = {},
): ScheduledShift => ({
  day: on,
  name: start < "12:00" ? "בוקר" : start < "19:00" ? "ערב" : "לילה",
  start,
  end,
  needed: 1,
  pattern: start < "12:00" ? "morning" : start < "19:00" ? "evening" : "night",
  assignees: people.map((p) =>
    typeof p === "string"
      ? { user: p, position: null }
      : { user: p[0], position: p[1] },
  ),
  ...extra,
});

const answer = (userId: string, ...ranges: [string, string, string][]) => ({
  userId,
  ranges: ranges.map(([on, start, end]) => ({ day: on, start, end })),
});

const away = (userId: string, from: string, to = from): AwaySpan => ({
  userId,
  from,
  to,
});

type FillInput = Parameters<typeof fillFromAvailability>[0];

const fillOf = (input: Partial<FillInput> & { screen: ScheduledShift[] }) =>
  fillFromAvailability({
    weekStart: WEEK,
    staff: STAFF,
    answers: [],
    away: [],
    lastWeek: null,
    nextDays: [],
    weekHours: FILL_WEEK_HOURS,
    shabbat: null,
    positionKeys: [],
    now: null,
    timeZone: zone,
    ...input,
  });

const who = (fill: WeekFill, index: number) =>
  (fill.week[index]?.assignees ?? []).map((a) => a.user);
const added = (fill: WeekFill, index: number) =>
  (fill.shifts.find((s) => s.index === index)?.added ?? []).map((a) => a.user);
const ruleOf = (fill: WeekFill, index: number, user: string) =>
  fill.shifts
    .find((s) => s.index === index)
    ?.blocked.find((b) => b.user === user)?.rule ?? null;

/** Free all day on each of the week's days. */
const allWeek = (userId: string, start = "06:00", end = "23:59") =>
  answer(userId, ...D.map((on): [string, string, string] => [on, start, end]));

describe("the fill's limits", () => {
  it("are the regular week, with the general permit's overtime at most", () => {
    expect(FILL_WEEK_HOURS).toBe(42);
    expect(FILL_WEEK_HOURS_MAX).toBe(58);
    expect(FILL_MAX_DAYS).toBe(6);
  });

  // The sheet names it; the rule measures it in minutes.
  it("rests 8 hours between shifts, as `rest` measures it", () => {
    expect(FILL_REST_HOURS).toBe(8);
    expect(FILL_REST_HOURS * 60).toBe(LIMITS.restBetween);
  });
});

describe("fillFromAvailability", () => {
  describe("what it keeps", () => {
    it("only appends people: the same length, order, ids and shifts, with everyone on them first", () => {
      const screen = [
        shift(day(0), "09:00", "16:00", [[itay, "cook"]], {
          id: ID(1),
          needed: 3,
        }),
        shift(day(0), "16:00", "23:30", [], { id: ID(2), needed: 2 }),
        shift(day(1), "09:00", "16:00", [], { needed: 2 }),
      ];
      const fill = fillOf({
        screen,
        answers: [allWeek(noa), allWeek(yoav), allWeek(maya)],
        positionKeys: ["cook", "waiter"],
      });
      expect(fill.week).toHaveLength(screen.length);
      fill.week.forEach((after, i) => {
        const was = screen[i] as ScheduledShift;
        const { assignees, ...rest } = after;
        const { assignees: before, ...wasRest } = was;
        expect(rest).toEqual(wasRest);
        expect(assignees.slice(0, before.length)).toEqual(before);
        expect(assignees.length).toBeLessThanOrEqual(was.needed);
      });
      // Sunday's four places take three people, one shift a day each.
      expect(fill.places).toBe(5);
      expect(fill.openAfter).toBe(1);
      // The screen itself is never changed.
      expect(screen[0]?.assignees).toEqual([{ user: itay, position: "cook" }]);
    });

    it("never touches a shift that has begun, or one full or over-full", () => {
      // Tuesday 8 December at 12:00 in Israel.
      const now = instantIn(day(2), "12:00", zone);
      const screen = [
        shift(day(1), "09:00", "16:00"),
        shift(day(2), "08:00", "16:00"),
        shift(day(3), "09:00", "16:00"),
        shift(day(4), "09:00", "16:00", [maya]),
        shift(day(4), "16:00", "23:00", [itay, omer]),
      ];
      const fill = fillOf({
        screen,
        now,
        answers: [allWeek(noa), allWeek(yoav)],
      });
      for (const i of [0, 1, 3, 4]) expect(fill.week[i]).toBe(screen[i]);
      expect(fill.shifts.map((s) => s.index)).toEqual([2]);
      expect(added(fill, 2)).toHaveLength(1);
      expect(fill.openBefore).toBe(1);
      expect(fill.openAfter).toBe(0);
    });

    it("still counts a shift that has begun: no second shift that day", () => {
      // Tuesday at 12:00: Noa's morning has begun, and ended.
      const fill = fillOf({
        screen: [
          shift(day(2), "07:00", "11:00", [noa]),
          shift(day(2), "19:00", "23:00"),
        ],
        now: instantIn(day(2), "12:00", zone),
        answers: [allWeek(noa)],
      });
      expect(ruleOf(fill, 1, noa)).toBe("sameDay");
    });

    it("never passes the people a shift needs", () => {
      const fill = fillOf({
        screen: [shift(day(0), "09:00", "16:00", [], { needed: 2 })],
        answers: [allWeek(noa), allWeek(yoav), allWeek(maya), allWeek(itay)],
      });
      expect(who(fill, 0)).toHaveLength(2);
      expect(fill.shifts[0]).toMatchObject({ open: 0, why: null });
    });
  });

  describe("who it places", () => {
    it("only someone whose ranges cover the whole shift, joined where they touch", () => {
      const fill = fillOf({
        screen: [shift(day(0), "09:00", "16:00", [], { needed: 3 })],
        answers: [
          answer(noa, [day(0), "09:00", "12:00"], [day(0), "12:00", "16:00"]),
          // An hour short at the start, and a gap in the middle.
          answer(yoav, [day(0), "10:00", "16:00"]),
          answer(maya, [day(0), "09:00", "15:00"], [day(0), "15:30", "16:00"]),
          // Another day only.
          answer(itay, [day(1), "09:00", "16:00"]),
        ],
      });
      expect(who(fill, 0)).toEqual([noa]);
      expect(fill.shifts[0]).toMatchObject({
        open: 2,
        why: "nobody",
        partial: 2,
        blocked: [],
      });
    });

    it("never places someone who sent nothing, owners included, or anyone off the staff", () => {
      const fill = fillOf({
        screen: [shift(day(0), "09:00", "16:00", [], { needed: 4 })],
        staff: [noa, maya, uri, yoav],
        answers: [
          allWeek(noa),
          // Sent, without a single range: never covers.
          answer(maya),
          // Not on the staff (left, or an accountant now).
          allWeek(liya),
        ],
      });
      expect(who(fill, 0)).toEqual([noa]);
      expect(fill.answered).toBe(2);
      expect(fill.byPerson.map((p) => p.user)).toEqual([maya, noa]);
      // Maya sent no range, so she isn't one who answered and got nothing.
      expect(fill.unplaced).toEqual([]);
    });

    it("names who sent ranges and got no shift in the week, and counts everyone who answered", () => {
      const fill = fillOf({
        screen: [
          shift(day(0), "09:00", "16:00"),
          // Maya's own shift, placed by hand on Tuesday.
          shift(day(2), "09:00", "16:00", [maya]),
        ],
        answers: [
          allWeek(noa),
          // Free only on Monday, which has no shift.
          answer(yoav, [day(1), "09:00", "16:00"]),
          answer(maya, [day(0), "09:00", "16:00"]),
        ],
      });
      // Maya already has seven hours; Noa none.
      expect(who(fill, 0)).toEqual([noa]);
      expect(fill.unplaced).toEqual([yoav]);
      expect(fill.byPerson).toEqual([
        { user: yoav, shifts: 0, minutes: 0, added: 0 },
        { user: noa, shifts: 1, minutes: 7 * 60, added: 1 },
        { user: maya, shifts: 1, minutes: 7 * 60, added: 0 },
      ]);
    });
  });

  describe("the rules", () => {
    it("skips someone away on the shift's day", () => {
      const fill = fillOf({
        screen: [shift(day(1), "09:00", "16:00")],
        answers: [allWeek(noa)],
        away: [away(noa, day(1))],
      });
      expect(who(fill, 0)).toEqual([]);
      // Stopped, so not one who covers only part of it.
      expect(fill.shifts[0]).toMatchObject({
        why: "blocked",
        blocked: [{ user: noa, rule: "away" }],
        partial: 0,
      });
    });

    it("skips a night past midnight into a day away, but not one that ends at 00:00", () => {
      const nextSunday = day(7);
      const fill = fillOf({
        screen: [
          shift(day(6), "19:00", "01:00"),
          shift(day(6), "19:30", "00:00", [], { pattern: "saturday-night" }),
        ],
        answers: [answer(noa, [day(6), "19:00", "01:00"])],
        away: [away(noa, nextSunday)],
      });
      expect(ruleOf(fill, 0, noa)).toBe("away");
      expect(who(fill, 1)).toEqual([noa]);
    });

    // Minors are placed like everyone else (Orel, 25 November 2026): the
    // fill has no hours of the day, no length of a shift and no weekly cap
    // of its own for them, and the manager is responsible, as by hand.
    it("places anyone at any hour of the day and for any length of shift", () => {
      // Thursday 10 and Friday 11 December.
      expect(weekdayOf(day(5))).toBe(5);
      const screen = [
        // Past 20:00, and from before 08:00.
        shift(day(0), "16:00", "23:30"),
        shift(day(2), "07:00", "15:00"),
        // Nine hours, and seven and a half on a Friday.
        shift(day(3), "08:00", "17:00"),
        shift(day(5), "08:00", "15:30"),
        // A night past midnight.
        shift(day(6), "20:00", "02:00"),
      ];
      const fill = fillOf({
        screen,
        answers: [
          answer(
            tamar,
            ...screen.map((s): [string, string, string] => [
              s.day,
              s.start,
              s.end,
            ]),
          ),
        ],
      });
      expect(fill.week.map((s) => s.assignees.map((a) => a.user))).toEqual(
        screen.map(() => [tamar]),
      );
      expect(fill.shifts.flatMap((s) => s.blocked)).toEqual([]);
    });

    it("lets anyone reach the week's hours, past 40", () => {
      // Five mornings placed by hand, 35 hours; Friday's 6 make 41.
      const screen = [
        ...[0, 1, 2, 3, 4].map((n) =>
          shift(day(n), "08:00", "15:00", [tamar, noa], { needed: 2 }),
        ),
        shift(day(5), "08:00", "14:00", [], { needed: 2 }),
      ];
      const answers = [allWeek(tamar), allWeek(noa)];
      for (const weekHours of [FILL_WEEK_HOURS, FILL_WEEK_HOURS_MAX]) {
        const fill = fillOf({ screen, answers, weekHours });
        expect(who(fill, 5).sort()).toEqual([noa, tamar].sort());
        expect(fill.byPerson.map((p) => p.minutes)).toEqual([41 * 60, 41 * 60]);
      }
    });

    it("stops anyone at the week's hours when the business sets fewer", () => {
      // Four mornings placed by hand, 28 hours; Friday's 5 would make 33.
      const screen = (end: string) => [
        ...[0, 1, 2, 3].map((n) => shift(day(n), "08:00", "15:00", [tamar])),
        shift(day(5), "08:00", end),
      ];
      const input = { answers: [allWeek(tamar)], weekHours: 30 };
      expect(
        ruleOf(fillOf({ screen: screen("13:00"), ...input }), 4, tamar),
      ).toBe("hours");
      // Friday's 2 make 30 exactly, which she may reach.
      expect(who(fillOf({ screen: screen("10:00"), ...input }), 4)).toEqual([
        tamar,
      ]);
    });

    it("never puts anyone on two shifts at once", () => {
      const fill = fillOf({
        screen: [
          shift(day(0), "12:00", "20:00", [noa], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(0), "16:00", "23:30"),
        ],
        answers: [allWeek(noa)],
      });
      expect(ruleOf(fill, 1, noa)).toBe("busy");
    });

    it("gives one shift a day, even with eight hours between them", () => {
      const fill = fillOf({
        screen: [
          shift(day(0), "07:00", "11:00"),
          shift(day(0), "19:00", "23:30"),
        ],
        answers: [answer(noa, [day(0), "07:00", "23:30"])],
      });
      expect([...who(fill, 0), ...who(fill, 1)]).toEqual([noa]);
      const other = who(fill, 0).length === 0 ? 0 : 1;
      expect(ruleOf(fill, other, noa)).toBe("sameDay");
    });

    it("keeps 8 hours between shifts: the café's evening, then 07:00 the next morning", () => {
      const evening = shift(day(0), "15:00", "00:00", [noa], {
        needed: 3,
      });
      const fill = fillOf({
        screen: [evening, shift(day(1), "07:00", "15:00")],
        answers: [allWeek(noa, "00:00", "23:59")],
      });
      // Seven hours from midnight to 07:00.
      expect(ruleOf(fill, 1, noa)).toBe("rest");
      const eight = fillOf({
        screen: [evening, shift(day(1), "08:00", "15:00")],
        answers: [allWeek(noa, "00:00", "23:59")],
      });
      expect(who(eight, 1)).toEqual([noa]);
    });

    describe("rest in real time, the nights the clocks change", () => {
      // Israel's clocks go forward on Friday 27 March 2026 at 02:00 (and
      // on Friday 26 March 2027), and back on Sunday 25 October 2026 at
      // 02:00.
      const spring = ["2026-03-22", "2027-03-21"];
      const autumn = "2026-10-25";
      const gap = (from: [string, string], to: [string, string]) =>
        (instantIn(to[0], to[1], zone).getTime() -
          instantIn(from[0], from[1], zone).getTime()) /
        60_000;

      it("are the nights these tests say", () => {
        for (const start of spring) {
          const [thursday, friday] = [addDays(start, 4), addDays(start, 5)];
          expect(weekdayOf(friday)).toBe(5);
          expect(gap([thursday, "23:30"], [friday, "08:00"])).toBe(450);
        }
        expect(gap([autumn, "00:30"], [autumn, "07:30"])).toBe(480);
      });

      it("keeps the restaurant's Thursday evening off Friday's 08:00 when the clocks go forward: 7½ hours", () => {
        for (const start of [...spring, "2026-03-29"]) {
          const [thursday, friday] = [addDays(start, 4), addDays(start, 5)];
          const evening = (people: string[]) =>
            shift(thursday, "16:00", "23:30", people, { pattern: "evening" });
          const morning = shift(friday, "08:00", "14:30", [], {
            name: "שישי",
            pattern: "friday",
          });
          const answers = [
            answer(
              noa,
              [thursday, "16:00", "23:30"],
              [friday, "08:00", "14:30"],
            ),
          ];
          const byHand = fillOf({
            weekStart: start,
            screen: [evening([noa]), morning],
            answers,
          });
          const both = fillOf({
            weekStart: start,
            screen: [evening([]), morning],
            answers,
          });
          if (start === "2026-03-29") {
            // A week later the clocks don't change: 8½ hours, and she's placed.
            expect(who(byHand, 1)).toEqual([noa]);
            expect([...who(both, 0), ...who(both, 1)]).toEqual([noa, noa]);
            continue;
          }
          // 8½ hours on the wall clock.
          expect(who(byHand, 1)).toEqual([]);
          expect(ruleOf(byHand, 1, noa)).toBe("rest");
          // Both open: the fill puts her on one of them only.
          expect([...who(both, 0), ...who(both, 1)]).toEqual([noa]);
        }
      });

      it("counts a night until 01:30, then 09:30, as 7 hours when the clocks go forward", () => {
        const start = spring[0] as string;
        const [thursday, friday] = [addDays(start, 4), addDays(start, 5)];
        const fill = fillOf({
          weekStart: start,
          screen: [
            shift(thursday, "17:30", "01:30", [noa]),
            shift(friday, "09:30", "14:00"),
          ],
          answers: [answer(noa, [friday, "09:30", "14:00"])],
        });
        // 8 hours on the wall clock.
        expect(ruleOf(fill, 1, noa)).toBe("rest");
      });

      it("counts last week's Saturday until 00:30, then Sunday's 07:30, as 8 hours when the clocks go back", () => {
        const lastWeek: CopySource = {
          start: addDays(autumn, -7),
          published: true,
          shifts: [shift(addDays(autumn, -1), "18:00", "00:30", [noa])],
        };
        const fill = fillOf({
          weekStart: autumn,
          screen: [shift(autumn, "07:30", "14:00")],
          answers: [answer(noa, [autumn, "07:00", "15:00"])],
          lastWeek,
        });
        expect(who(fill, 0)).toEqual([noa]);
        expect(fill.shifts[0]?.why).toBeNull();
        expect(fill.unplaced).toEqual([]);
        // At 07:00 it is 7½ hours, and she isn't.
        const seven = fillOf({
          weekStart: autumn,
          screen: [shift(autumn, "07:00", "14:00")],
          answers: [answer(noa, [autumn, "07:00", "15:00"])],
          lastWeek,
        });
        expect(ruleOf(seven, 0, noa)).toBe("rest");
      });
    });

    it("reads last week's Saturday night, and nothing two weeks back", () => {
      const saturday = addDays(WEEK, -1);
      const lastWeek: CopySource = {
        start: addDays(WEEK, -7),
        published: true,
        shifts: [shift(saturday, "19:00", "01:00", [noa])],
      };
      const sunday = [shift(day(0), "07:00", "15:00")];
      const answers = [answer(noa, [day(0), "07:00", "15:00"])];
      expect(
        ruleOf(fillOf({ screen: sunday, answers, lastWeek }), 0, noa),
      ).toBe("rest");
      // A night until 08:00 would be two shifts at once.
      const night: CopySource = {
        ...lastWeek,
        shifts: [shift(saturday, "22:00", "08:00", [noa])],
      };
      expect(
        ruleOf(fillOf({ screen: sunday, answers, lastWeek: night }), 0, noa),
      ).toBe("busy");
      // Two weeks back is no edge: `shiftSpan`, and real time for the rest,
      // put its Saturday a week before Sunday. (That only the week just
      // before counts at all is
      // pinned by last week's hours among the tie-breaks.)
      const older: CopySource = {
        start: addDays(WEEK, -14),
        published: true,
        shifts: [shift(addDays(WEEK, -8), "19:00", "01:00", [noa])],
      };
      expect(
        who(fillOf({ screen: sunday, answers, lastWeek: older }), 0),
      ).toEqual([noa]);
    });

    it("never reads a shift dated outside last week as last week's", () => {
      // As the copy's guard: a source holding a shift of this Sunday.
      const lastWeek: CopySource = {
        start: addDays(WEEK, -7),
        published: true,
        shifts: [shift(day(0), "07:00", "22:00", [noa], { pattern: null })],
      };
      const fill = fillOf({
        screen: [shift(day(0), "08:00", "15:00")],
        answers: [allWeek(noa)],
        lastWeek,
      });
      expect(who(fill, 0)).toEqual([noa]);
    });

    it("reads next week's first days: Sunday's 07:00 stops this Saturday's night", () => {
      const screen = [shift(day(6), "19:00", "01:00")];
      const answers = [answer(noa, [day(6), "19:00", "01:00"])];
      const next = (start: string) => [
        shift(day(7), start, "15:00", [noa]),
        // Inside the week: never an edge (it would leave an hour's rest).
        shift(day(6), "12:00", "18:00", [noa]),
      ];
      expect(
        ruleOf(fillOf({ screen, answers, nextDays: next("07:00") }), 0, noa),
      ).toBe("rest");
      expect(
        who(fillOf({ screen, answers, nextDays: next("09:00") }), 0),
      ).toEqual([noa]);
    });

    it("gives nobody a seventh day", () => {
      // Six short days placed by hand, 24 hours.
      const screen = [
        ...[1, 2, 3, 4, 5, 6].map((n) =>
          shift(day(n), "09:00", "13:00", [noa]),
        ),
        shift(day(0), "09:00", "13:00"),
      ];
      const fill = fillOf({ screen, answers: [allWeek(noa)] });
      expect(ruleOf(fill, 6, noa)).toBe("days");
    });

    it("counts the manager's placements toward the week's hours", () => {
      // Five days of 8 hours placed by hand: 40.
      const screen = [
        ...[1, 2, 3, 4, 5].map((n) => shift(day(n), "08:00", "16:00", [noa])),
        shift(day(0), "08:00", "15:00"),
      ];
      const answers = [allWeek(noa)];
      expect(ruleOf(fillOf({ screen, answers }), 5, noa)).toBe("hours");
      expect(who(fillOf({ screen, answers, weekHours: 58 }), 5)).toEqual([noa]);
      // Five days of 7 hours, 35: Sunday's 7 make 42 exactly, which she may reach.
      const exactly = [
        ...[1, 2, 3, 4, 5].map((n) => shift(day(n), "08:00", "15:00", [noa])),
        shift(day(0), "08:00", "15:00"),
      ];
      expect(who(fillOf({ screen: exactly, answers }), 5)).toEqual([noa]);
      // Someone already past the cap gets nothing, however short.
      const over = [
        ...[1, 2, 3, 4, 5].map((n) => shift(day(n), "07:00", "16:00", [noa])),
        shift(day(0), "10:00", "11:00"),
      ];
      expect(ruleOf(fillOf({ screen: over, answers }), 5, noa)).toBe("hours");
    });

    describe("in order: the first that fails is the reason", () => {
      it("away, then busy", () => {
        const middle = (on: string) =>
          shift(on, "09:00", "18:00", [tamar], {
            name: "אמצע",
            pattern: null,
          });
        const fill = fillOf({
          screen: [
            // At the same time as her own: on a day away, and on another.
            middle(day(1)),
            shift(day(1), "09:00", "18:00"),
            middle(day(3)),
            shift(day(3), "09:00", "18:00"),
          ],
          answers: [allWeek(tamar)],
          away: [away(tamar, day(1))],
        });
        expect(ruleOf(fill, 1, tamar)).toBe("away");
        expect(ruleOf(fill, 3, tamar)).toBe("busy");
      });

      it("the same day before rest", () => {
        // Seven hours apart on one day.
        const fill = fillOf({
          screen: [
            shift(day(1), "07:00", "11:00", [noa]),
            shift(day(1), "18:00", "22:00"),
          ],
          answers: [allWeek(noa)],
        });
        expect(ruleOf(fill, 1, noa)).toBe("sameDay");
      });

      it("rest, then days, then hours", () => {
        // Six days of 9 hours by hand, 54: Sunday's 8 would be a seventh day
        // and past 58; last week's Saturday night ends six hours before it.
        const screen = [
          ...[1, 2, 3, 4, 5].map((n) => shift(day(n), "08:00", "17:00", [noa])),
          shift(day(6), "14:00", "23:00", [noa]),
          shift(day(0), "08:00", "16:00"),
        ];
        const input = { screen, answers: [allWeek(noa)], weekHours: 58 };
        const lastWeek: CopySource = {
          start: addDays(WEEK, -7),
          published: true,
          shifts: [shift(addDays(WEEK, -1), "19:00", "02:00", [noa])],
        };
        expect(ruleOf(fillOf({ ...input, lastWeek }), 6, noa)).toBe("rest");
        expect(ruleOf(fillOf(input), 6, noa)).toBe("days");
        // Six days of 7 hours, 42: a seventh is past the hours as well.
        const seven = [
          ...[1, 2, 3, 4, 5, 6].map((n) =>
            shift(day(n), "08:00", "15:00", [noa]),
          ),
          shift(day(0), "08:00", "15:00"),
        ];
        expect(
          ruleOf(fillOf({ screen: seven, answers: [allWeek(noa)] }), 6, noa),
        ).toBe("days");
      });
    });
  });

  describe("order and fairness", () => {
    const place = (extra: Partial<ScheduledShift> = {}) =>
      shift(day(3), "16:00", "23:00", [], extra);

    // With nothing else between them the rotation gives Yoav this week, so
    // each tie-break below is set against the next one and, where it can,
    // expects Noa.
    it("gives Yoav a tie this week, by the rotation alone", () => {
      const fill = fillOf({
        screen: [place()],
        answers: [allWeek(noa), allWeek(yoav)],
      });
      expect(who(fill, 0)).toEqual([yoav]);
    });

    it("puts whoever has the fewest hours this week first, the manager's placements counted, before the fewest shifts", () => {
      // Noa: two shifts of 3 hours by hand; Yoav: one of 8.
      const fill = fillOf({
        screen: [
          shift(day(0), "10:00", "13:00", [noa], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(1), "10:00", "13:00", [noa], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(2), "08:00", "16:00", [yoav]),
          place(),
        ],
        answers: [allWeek(noa), allWeek(yoav)],
      });
      expect(who(fill, 3)).toEqual([noa]);
    });

    it("then whoever has the fewest of the same kind of shift", () => {
      const screen = (kind: "morning" | "evening") => [
        shift(day(0), "16:00", "23:00", [noa]),
        shift(day(1), "09:00", "16:00", [yoav]),
        shift(
          day(3),
          kind === "morning" ? "09:00" : "16:00",
          kind === "morning" ? "16:00" : "23:00",
        ),
      ];
      const answers = [allWeek(noa), allWeek(yoav)];
      expect(who(fillOf({ screen: screen("evening"), answers }), 2)).toEqual([
        yoav,
      ]);
      expect(who(fillOf({ screen: screen("morning"), answers }), 2)).toEqual([
        noa,
      ]);
    });

    it("the same kind before the fewest shifts", () => {
      // Eight hours each: Noa one evening, Yoav two mornings of 4.
      const fill = fillOf({
        screen: [
          shift(day(0), "16:00", "00:00", [noa]),
          shift(day(1), "08:00", "12:00", [yoav]),
          shift(day(2), "08:00", "12:00", [yoav]),
          place(),
        ],
        answers: [allWeek(noa), allWeek(yoav)],
      });
      expect(who(fill, 3)).toEqual([yoav]);
    });

    it("then whoever has the fewest shifts, before the rotation", () => {
      // Eight hours each and no evening: Yoav two shifts of 4, Noa one of 8.
      const fill = fillOf({
        screen: [
          shift(day(0), "10:00", "14:00", [yoav], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(1), "10:00", "14:00", [yoav], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(2), "08:00", "16:00", [noa]),
          place(),
        ],
        answers: [allWeek(noa), allWeek(yoav)],
      });
      expect(who(fill, 3)).toEqual([noa]);
    });

    it("then whoever worked the fewest hours last week, when it is the week just before", () => {
      const screen = [place()];
      const answers = [allWeek(noa), allWeek(yoav)];
      const first = who(fillOf({ screen, answers }), 0)[0] as string;
      const other = first === noa ? yoav : noa;
      const lastWeek = (start: string): CopySource => ({
        start,
        published: true,
        shifts: [shift(addDays(start, 2), "09:00", "17:00", [first])],
      });
      expect(
        who(
          fillOf({ screen, answers, lastWeek: lastWeek(addDays(WEEK, -7)) }),
          0,
        ),
      ).toEqual([other]);
      expect(
        who(
          fillOf({ screen, answers, lastWeek: lastWeek(addDays(WEEK, -14)) }),
          0,
        ),
      ).toEqual([first]);
    });

    it("then a rotation that changes from week to week, never the team's order or the alphabet", () => {
      const winners = Array.from({ length: 8 }, (_, n) => {
        const start = addDays(WEEK, 7 * n);
        const input = {
          weekStart: start,
          screen: [shift(addDays(start, 3), "16:00", "23:00")],
          answers: [allWeekOf(start, noa), allWeekOf(start, yoav)],
        };
        const one = who(fillOf({ ...input, staff: [noa, yoav] }), 0);
        // The same week gives the same, whatever the order.
        expect(who(fillOf({ ...input, staff: [yoav, noa] }), 0)).toEqual(one);
        expect(
          who(fillOf({ ...input, answers: [...input.answers].reverse() }), 0),
        ).toEqual(one);
        return one[0];
      });
      expect(new Set(winners)).toEqual(new Set([noa, yoav]));
    });

    it("leaves a team free alike within one shift of each other", () => {
      const screen = D.flatMap((on) => [
        shift(on, "07:00", "15:00"),
        shift(on, "15:00", "23:00"),
      ]);
      const fill = fillOf({
        screen,
        answers: [noa, yoav, maya].map((p) => allWeek(p, "07:00", "23:00")),
        staff: [noa, yoav, maya],
      });
      expect(fill.openAfter).toBe(0);
      const minutes = fill.byPerson.map((p) => p.minutes);
      expect(Math.max(...minutes) - Math.min(...minutes)).toBeLessThanOrEqual(
        8 * 60,
      );
    });

    it("shares the evenings out", () => {
      const screen = [0, 1, 2, 3, 4].flatMap((n) => [
        shift(day(n), "07:00", "15:00"),
        shift(day(n), "15:00", "23:00"),
      ]);
      const fill = fillOf({
        screen,
        answers: [
          allWeek(noa, "07:00", "23:00"),
          allWeek(yoav, "07:00", "23:00"),
        ],
        staff: [noa, yoav],
      });
      const evenings = (p: string) =>
        fill.week.filter(
          (s) =>
            s.pattern === "evening" && s.assignees.some((a) => a.user === p),
        ).length;
      expect(evenings(noa) + evenings(yoav)).toBe(5);
      expect(Math.abs(evenings(noa) - evenings(yoav))).toBeLessThanOrEqual(1);
    });

    it("fills the scarcest place first: the only one free on Saturday night isn't used up on Sunday", () => {
      // Five days each by hand; Yoav's are longer, so on Sunday alone Noa,
      // with fewer hours, would go first and have no sixth day for Saturday.
      const screen = [
        shift(day(0), "09:00", "16:00"),
        ...[1, 2, 3, 4].map((n) => shift(day(n), "09:00", "16:00", [noa])),
        shift(day(5), "08:00", "14:30", [noa]),
        ...[1, 2, 3, 4, 5].map((n) => shift(day(n), "16:00", "23:30", [yoav])),
        shift(day(6), "19:00", "01:00"),
      ];
      const fill = fillOf({
        screen,
        answers: [
          answer(noa, [day(0), "09:00", "16:00"], [day(6), "19:00", "01:00"]),
          answer(yoav, [day(0), "09:00", "16:00"]),
        ],
        weekHours: 58,
      });
      expect(who(fill, 0)).toEqual([yoav]);
      expect(who(fill, 11)).toEqual([noa]);
      expect(fill.openAfter).toBe(0);
    });
  });

  describe("positions", () => {
    const KEYS = ["waiter", "bartender", "cook", "host"];
    const lastWeek: CopySource = {
      start: addDays(WEEK, -7),
      published: true,
      shifts: [
        shift(addDays(WEEK, -7), "09:00", "16:00", [[noa, "waiter"]]),
        shift(addDays(WEEK, -6), "09:00", "16:00", [[noa, "waiter"]]),
        shift(addDays(WEEK, -5), "16:00", "23:00", [[noa, "bartender"]]),
        shift(addDays(WEEK, -4), "09:00", "16:00", [
          [yoav, "cook"],
          [maya, "sommelier"],
        ]),
        shift(addDays(WEEK, -3), "09:00", "16:00", [[yoav, "waiter"]]),
      ],
    };

    it("is the one held most last week on the same kind of shift, else the one held most", () => {
      const fill = fillOf({
        screen: [
          shift(day(0), "16:00", "23:00", [], { needed: 1 }),
          shift(day(1), "09:00", "16:00", [yoav]),
          shift(day(5), "08:00", "14:30", [], { pattern: "friday" }),
        ],
        answers: [
          answer(noa, [day(0), "16:00", "23:00"], [day(5), "08:00", "14:30"]),
        ],
        lastWeek,
        positionKeys: KEYS,
      });
      expect(fill.week[0]?.assignees).toEqual([
        { user: noa, position: "bartender" },
      ]);
      expect(fill.week[2]?.assignees).toEqual([
        { user: noa, position: "waiter" },
      ]);
    });

    it("breaks a tie by the business's own order", () => {
      const screen = [shift(day(0), "09:00", "16:00")];
      const answers = [allWeek(yoav)];
      expect(
        fillOf({ screen, answers, lastWeek, positionKeys: KEYS }).week[0]
          ?.assignees,
      ).toEqual([{ user: yoav, position: "waiter" }]);
      expect(
        fillOf({
          screen,
          answers,
          lastWeek,
          positionKeys: ["cook", "waiter"],
        }).week[0]?.assignees,
      ).toEqual([{ user: yoav, position: "cook" }]);
    });

    it("never gives a position the business no longer has, and none without last week or positions", () => {
      const screen = [shift(day(0), "09:00", "16:00")];
      const position = (
        input: Pick<FillInput, "lastWeek" | "positionKeys">,
        user: string,
      ) =>
        fillOf({ screen, answers: [allWeek(user)], ...input }).week[0]
          ?.assignees[0]?.position;
      expect(position({ lastWeek, positionKeys: KEYS }, maya)).toBeNull();
      expect(position({ lastWeek: null, positionKeys: KEYS }, noa)).toBeNull();
      expect(position({ lastWeek, positionKeys: [] }, noa)).toBeNull();
    });
  });

  describe("why a place stays open", () => {
    // Summer: candle lighting at 16:12 would be winter's, havdalah at 20:21
    // summer's; each side is read on its own.
    const shabbat: ShabbatLimits = {
      friday: day(5),
      candleLighting: "16:12",
      saturday: day(6),
      havdalah: "20:21",
    };

    it("names Shabbat, with havdalah or candle lighting, as the reason only where no answer covers the shift", () => {
      const screen = [
        shift(day(6), "19:30", "00:00", [], { needed: 2 }),
        shift(day(5), "07:00", "16:30"),
      ];
      // Sent before the business closed on Shabbat.
      const answers = [answer(noa, [day(6), "19:30", "00:30"])];
      const fill = fillOf({ screen, answers, shabbat });
      expect(who(fill, 0)).toEqual([noa]);
      expect(fill.shifts).toEqual([
        expect.objectContaining({
          index: 1,
          why: "shabbat",
          shabbat: { side: "friday", time: "16:12" },
        }),
        // Noa's answer covers it, so it isn't true that none can: nobody
        // else does, and Shabbat is still named beside that.
        expect.objectContaining({
          index: 0,
          added: [{ user: noa, position: null }],
          open: 1,
          why: "nobody",
          shabbat: { side: "saturday", time: "20:21" },
          blocked: [],
        }),
      ]);
      const open = fillOf({ screen, answers, shabbat: null });
      expect(open.shifts.map((s) => [s.why, s.shabbat])).toEqual([
        ["nobody", null],
        ["nobody", null],
      ]);
    });

    it("gives the same reason whether the fill or the manager put on the one whose answer covers it", () => {
      const answers = [answer(noa, [day(6), "19:30", "00:30"])];
      const saturday = (people: string[]) => [
        shift(day(6), "19:30", "00:00", people, { needed: 2 }),
      ];
      const night = { side: "saturday", time: "20:21" } as const;
      const byFill = fillOf({ screen: saturday([]), answers, shabbat });
      const byHand = fillOf({ screen: saturday([noa]), answers, shabbat });
      // The same week either way: Noa on it, one place open, nobody else.
      expect(byFill.week).toEqual(byHand.week);
      expect(byFill.shifts[0]).toMatchObject({
        added: [{ user: noa, position: null }],
        open: 1,
        why: "nobody",
        shabbat: night,
      });
      expect(byHand.shifts[0]).toEqual({
        index: 0,
        added: [],
        open: 1,
        why: "nobody",
        shabbat: night,
        partial: 0,
        blocked: [],
      });
      // Someone on it whose answer doesn't cover it, or who sent none, leaves
      // Shabbat the reason.
      const short: [string, string, string][][] = [
        [[day(6), "20:30", "00:30"]],
        [],
      ];
      for (const ranges of short) {
        const fill = fillOf({
          screen: saturday([noa]),
          answers: [answer(noa, ...ranges)],
          shabbat,
        });
        expect(fill.shifts[0]).toMatchObject({
          added: [],
          open: 1,
          why: "shabbat",
          shabbat: night,
          partial: 0,
        });
      }
      expect(fillOf({ screen: saturday([noa]), shabbat }).shifts[0]?.why).toBe(
        "shabbat",
      );
    });

    it("names whoever covers a shift into Shabbat and was stopped, with Shabbat beside them", () => {
      const fill = fillOf({
        screen: [shift(day(6), "19:30", "00:00")],
        answers: [answer(noa, [day(6), "19:30", "00:30"])],
        away: [away(noa, day(6))],
        shabbat,
      });
      expect(fill.shifts[0]).toMatchObject({
        open: 1,
        why: "blocked",
        shabbat: { side: "saturday", time: "20:21" },
        blocked: [{ user: noa, rule: "away" }],
      });
    });

    it("counts someone already on the shift as neither stopped nor covering part of it", () => {
      const fill = fillOf({
        screen: [shift(day(1), "09:00", "16:00", [noa], { needed: 2 })],
        answers: [allWeek(noa), answer(yoav, [day(1), "10:00", "16:00"])],
      });
      expect(fill.shifts[0]).toMatchObject({
        open: 1,
        why: "nobody",
        blocked: [],
        partial: 1,
      });
    });

    it("lists everyone who covers it, each with the first rule that stopped them", () => {
      const fill = fillOf({
        screen: [
          shift(day(1), "12:00", "20:00", [yoav], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(1), "09:00", "16:00", [], { needed: 2 }),
          ...[2, 3, 4, 5, 6].map((n) =>
            shift(day(n), "07:00", "16:00", [maya]),
          ),
        ],
        answers: [allWeek(noa), allWeek(yoav), allWeek(maya)],
        // Maya is away and over the hours: away comes first.
        away: [away(noa, day(1)), away(maya, day(1))],
      });
      expect(fill.shifts[0]).toMatchObject({
        index: 1,
        open: 2,
        why: "blocked",
        blocked: [
          { user: noa, rule: "away" },
          { user: yoav, rule: "busy" },
          { user: maya, rule: "away" },
        ].sort((a, b) => (a.user < b.user ? -1 : 1)),
      });
    });

    it("says nobody answered when nobody did", () => {
      const fill = fillOf({
        screen: draftWeek(WEEK, RETAIL),
        answers: [],
      });
      expect(fill.answered).toBe(0);
      expect(fill.places).toBe(0);
      expect(fill.openAfter).toBe(fill.openBefore);
      expect(fill.byPerson).toEqual([]);
      expect(fill.unplaced).toEqual([]);
      expect(new Set(fill.shifts.map((s) => s.why))).toEqual(
        new Set(["nobody"]),
      );
    });
  });

  describe("for every kind of business", () => {
    it("fills a template with no positions", () => {
      const fill = fillOf({
        screen: draftWeek(WEEK, RETAIL),
        answers: [allWeek(noa), allWeek(yoav), allWeek(maya)],
      });
      expect(fill.places).toBeGreaterThan(0);
      expect(
        fill.week.every((s) => s.assignees.every((a) => a.position === null)),
      ).toBe(true);
      expect(weekSchedule(WEEK, []).safeParse(fill.week).success).toBe(true);
    });

    it("fills a week that starts on Monday, last week's Sunday night its edge", () => {
      const monday = "2026-12-07";
      const fill = fillOf({
        weekStart: monday,
        screen: draftWeek(monday, RETAIL),
        answers: [
          allWeekOf(monday, tamar),
          answer(noa, [monday, "08:00", "15:00"]),
        ],
        lastWeek: {
          start: addDays(monday, -7),
          published: true,
          // Sunday night, the last day of last week.
          shifts: [shift(addDays(monday, -1), "22:00", "02:00", [noa])],
        },
      });
      // Monday's morning at 08:00 is six hours after Noa's night.
      expect(ruleOf(fill, 0, noa)).toBe("rest");
      expect(who(fill, 0)).toEqual([tamar]);
      expect(weekSchedule(monday, []).safeParse(fill.week).success).toBe(true);
    });

    it("fills shifts added by hand with no pattern, sharing them out by name and start", () => {
      const opening = (n: number) =>
        shift(day(n), "08:00", "12:00", [], { name: "פתיחה", pattern: null });
      const fill = fillOf({
        screen: [
          opening(0),
          shift(day(0), "14:00", "18:00", [], { name: "סגירה", pattern: null }),
          opening(1),
          opening(2),
          opening(3),
        ],
        answers: [allWeek(noa), allWeek(yoav)],
        staff: [noa, yoav],
      });
      expect(fill.openAfter).toBe(0);
      const openings = (p: string) =>
        fill.week.filter(
          (s) => s.name === "פתיחה" && s.assignees.some((a) => a.user === p),
        ).length;
      expect(openings(noa)).toBe(2);
      expect(openings(yoav)).toBe(2);
    });

    it("tells two shifts added by hand with one name apart by their start", () => {
      const middle = (
        on: string,
        start: string,
        end: string,
        people: string[],
      ) => shift(on, start, end, people, { name: "אמצע", pattern: null });
      const fill = fillOf({
        screen: [
          middle(day(0), "10:00", "14:00", [noa]),
          middle(day(1), "14:00", "18:00", [yoav]),
          middle(day(3), "14:00", "18:00", []),
        ],
        answers: [allWeek(noa), allWeek(yoav)],
      });
      // Yoav already has an afternoon one; Noa only a morning one.
      expect(who(fill, 2)).toEqual([noa]);
    });

    it("fills the café's and the shop's patterns, a night on the week's last day included", () => {
      for (const patterns of [CAFE, RETAIL]) {
        const fill = fillOf({
          screen: draftWeek(WEEK, patterns),
          answers: [noa, yoav, maya, itay, omer].map((p) =>
            answer(
              p,
              ...D.flatMap((on): [string, string, string][] => [
                [on, "07:00", "15:00"],
                [on, "15:00", "01:00"],
              ]),
            ),
          ),
        });
        expect(weekSchedule(WEEK, []).safeParse(fill.week).success).toBe(true);
        expect(fill.places).toBeGreaterThan(0);
      }
      const cafe = fillOf({
        screen: draftWeek(WEEK, CAFE),
        answers: [answer(noa, [day(6), "19:00", "01:00"])],
      });
      const night = cafe.week.findIndex((s) => s.pattern === "saturday-night");
      expect(who(cafe, night)).toEqual([noa]);
    });

    it("covers every templated shift from answers kept as the form suggests them", () => {
      // The form opens an empty day with the business's shifts that day, from
      // the earliest start to the latest end, each cut by Shabbat
      // (`suggestedDay`). Whoever keeps it is free for every shift that day,
      // so the fill can put them on any of them: with enough people every
      // place is filled, and with fewer each place left open is a rule's,
      // never for want of an answer. Tel Aviv, 11–12 December 2026, when every
      // templated shift is clear of Shabbat.
      const december: ShabbatLimits = {
        friday: day(5),
        candleLighting: "16:17",
        saturday: day(6),
        havdalah: "17:14",
      };
      const both = [december, null];
      const cases: [string, ShiftPattern[], (ShabbatLimits | null)[]][] = [
        ["restaurant", RESTAURANT, both],
        ["café", CAFE, both],
        ["shop", RETAIL, both],
        // Open all week, Shabbat too: two ranges a day.
        ["day and night", AROUND_THE_CLOCK, [null]],
      ];
      for (const [name, patterns, limits] of cases) {
        const screen = draftWeek(WEEK, patterns);
        const places = screen.reduce((sum, s) => sum + s.needed, 0);
        for (const closed of limits) {
          const label = `${name}, ${closed ? "closed" : "open"} on Shabbat`;
          const answers = keptAsSuggested(WEEK, patterns, closed, MANY);
          // What the form would send, as it would send it.
          expect(
            parseAvailabilityForm(
              { ranges: answers[0]?.ranges, note: "" },
              WEEK,
              closed,
            ).ok,
            label,
          ).toBe(true);
          for (const s of screen) {
            for (const a of answers) {
              expect(
                availableFor(s, a.ranges),
                `${label}: ${s.day} ${s.start}`,
              ).toBe(true);
            }
          }
          const full = fillOf({
            screen,
            staff: MANY,
            answers,
            shabbat: closed,
          });
          expect(full.openBefore, label).toBe(places);
          expect(full.places, label).toBe(places);
          expect(full.openAfter, label).toBe(0);
          // Three people can't fill any of these weeks.
          const few = [noa, yoav, maya];
          const short = fillOf({
            screen,
            staff: few,
            answers: answers.filter((a) => few.includes(a.userId)),
            shabbat: closed,
          });
          expect(short.places, label).toBeGreaterThan(0);
          expect(short.openAfter, label).toBeGreaterThan(0);
          // Where places stay open, everyone not on the shift covers it and
          // was stopped by a rule; on a shift that has all three, nobody else.
          for (const s of short.shifts) {
            if (s.open === 0) continue;
            const off = few.filter((p) => !who(short, s.index).includes(p));
            expect(s.partial, label).toBe(0);
            expect(s.blocked.map((b) => b.user).sort(), label).toEqual(
              [...off].sort(),
            );
            expect(s.why, label).toBe(off.length > 0 ? "blocked" : "nobody");
          }
        }
      }
    });

    it("leaves open, from answers kept as suggested, only the shifts Shabbat cuts", () => {
      // In summer havdalah comes after the restaurant's 19:30 and the café's
      // 19:00, so Saturday's suggestion starts at havdalah and their Saturday
      // night stays open, its time named; in Jerusalem's December, candles are
      // lit before the café's Friday ends at 16:00 (the plan's risk 2). Every
      // other shift is covered and filled.
      const june = "2027-06-13";
      const summer = shabbatLimits(
        shabbatTimes(ISRAELI_CITIES.telAviv, addDays(june, 5)),
        zone,
      );
      const jerusalem = shabbatLimits(
        shabbatTimes(ISRAELI_CITIES.jerusalem, day(5)),
        zone,
      );
      // What the cases rest on.
      expect(summer.havdalah > "19:30").toBe(true);
      expect(jerusalem.candleLighting < "16:00").toBe(true);
      const cases: [
        string,
        string,
        ShiftPattern[],
        ShabbatLimits,
        string,
        { side: "friday" | "saturday"; time: string },
      ][] = [
        [
          "restaurant in summer",
          june,
          RESTAURANT,
          summer,
          "saturday-night",
          { side: "saturday", time: summer.havdalah },
        ],
        [
          "café in summer",
          june,
          CAFE,
          summer,
          "saturday-night",
          { side: "saturday", time: summer.havdalah },
        ],
        [
          "café in Jerusalem's December",
          WEEK,
          CAFE,
          jerusalem,
          "friday",
          { side: "friday", time: jerusalem.candleLighting },
        ],
      ];
      for (const [label, weekStart, patterns, closed, cut, side] of cases) {
        const screen = draftWeek(weekStart, patterns);
        const answers = keptAsSuggested(weekStart, patterns, closed, MANY);
        const fill = fillOf({
          weekStart,
          screen,
          staff: MANY,
          answers,
          shabbat: closed,
        });
        for (const s of fill.shifts) {
          const shift = screen[s.index];
          if (shift?.pattern === cut) {
            // Each answer reaches the shift up to Shabbat's edge, never over.
            expect(s.added, label).toEqual([]);
            expect(s.why, label).toBe("shabbat");
            expect(s.shabbat, label).toEqual(side);
            expect(s.partial, label).toBe(MANY.length);
          } else {
            expect(s.open, `${label}: ${shift?.day} ${shift?.start}`).toBe(0);
          }
        }
        expect(fill.openAfter, label).toBe(
          screen
            .filter((s) => s.pattern === cut)
            .reduce((sum, s) => sum + s.needed, 0),
        );
      }
    });

    it("never puts a night worker on the next morning, with 12-hour shifts", () => {
      const screen = D.flatMap((on) => [
        shift(on, "07:00", "19:00", [], { pattern: "day" }),
        shift(on, "19:00", "07:00", [], { pattern: "night" }),
      ]);
      const fill = fillOf({
        screen,
        answers: [noa, yoav, maya].map((p) =>
          answer(
            p,
            ...D.flatMap((on): [string, string, string][] => [
              [on, "07:00", "19:00"],
              [on, "19:00", "07:00"],
            ]),
          ),
        ),
        staff: [noa, yoav, maya],
        weekHours: 58,
      });
      expect(fill.places).toBeGreaterThan(0);
      for (const p of [noa, yoav, maya]) {
        D.forEach((on, n) => {
          const nights = fill.week.find(
            (s) => s.day === on && s.pattern === "night",
          );
          const nextDay = fill.week.find(
            (s) => s.day === D[n + 1] && s.pattern === "day",
          );
          if (nights?.assignees.some((a) => a.user === p)) {
            expect(nextDay?.assignees.some((a) => a.user === p) ?? false).toBe(
              false,
            );
          }
        });
      }
    });

    it("fills the restaurant's 44 places from a team free all week", () => {
      const team = [
        noa,
        yoav,
        maya,
        itay,
        shiran,
        tamar,
        omer,
        liya,
        uri,
      ].concat(ID(90));
      const fill = fillOf({
        screen: draftWeek(WEEK, RESTAURANT),
        staff: team,
        answers: team.map((p) => allWeek(p, "07:00", "00:30")),
        positionKeys: ["waiter", "bartender", "cook", "host"],
      });
      expect(fill.openBefore).toBe(44);
      expect(fill.places).toBe(44);
      expect(fill.openAfter).toBe(0);
      expect(fill.people).toBe(10);
      expect(
        weekSchedule(WEEK, ["waiter", "bartender", "cook", "host"]).safeParse(
          fill.week,
        ).success,
      ).toBe(true);
    });
  });

  it("is the same whatever the order of the staff, the answers and the days away", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const input = generated(seed);
      const random = mulberry32(seed * 7919);
      const shuffled = {
        ...input,
        staff: shuffle(input.staff, random),
        answers: shuffle(input.answers, random),
        away: shuffle(input.away, random),
      };
      expect(fillFromAvailability(shuffled)).toEqual(
        fillFromAvailability(input),
      );
    }
  });

  it("never leaves a week the schedule's rules refuse, and never breaks its own", () => {
    const seen = new Set<string>();
    let places = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const input = generated(seed);
      const fill = fillFromAvailability(input);
      checkFill(input, fill);
      places += fill.places;
      for (const s of fill.shifts) {
        if (s.why) seen.add(s.why);
        for (const b of s.blocked) seen.add(b.rule);
      }
    }
    // The generated weeks reach every rule and every reason.
    expect(places).toBeGreaterThan(1000);
    expect([...seen].sort()).toEqual(
      [
        "away",
        "busy",
        "sameDay",
        "rest",
        "days",
        "hours",
        "shabbat",
        "nobody",
        "blocked",
      ].sort(),
    );
  });

  it("fills 200 shifts from 50 people in good time", () => {
    const random = mulberry32(42);
    const screen: ScheduledShift[] = [];
    for (let n = 0; n < 200; n++) {
      const on = D[Math.floor(random() * 7)] as string;
      const start = `${`${6 + Math.floor(random() * 15)}`.padStart(2, "0")}:00`;
      const end = `${`${(minutesOf(start) / 60 + 4 + Math.floor(random() * 6)) % 24}`.padStart(2, "0")}:30`;
      const one = shift(on, start, end, [], {
        needed: 1 + Math.floor(random() * 5),
        pattern: null,
        name: `משמרת ${n}`,
      });
      screen.splice(shiftSlot(screen, one), 0, one);
    }
    const team = Array.from({ length: 50 }, (_, n) => ID(100 + n));
    const answers = team.map((p) => allWeek(p, "05:00", "04:59"));
    const started = performance.now();
    const fill = fillOf({ screen, staff: team, answers, weekHours: 58 });
    expect(performance.now() - started).toBeLessThan(3000);
    expect(fill.places).toBeGreaterThan(200);
    checkFill(
      { ...defaults(), screen, staff: team, answers, weekHours: 58 },
      fill,
    );
  });
});

describe("the twins, as the PR shows them", () => {
  it("fills the restaurant twin's week of 1–7 November, and nothing at 7 hours a week", () => {
    const start = "2026-11-01";
    const placed: Record<string, [string, string | null][]> = {
      "2026-11-01/morning": [
        ["noa", "waiter"],
        ["itay", "cook"],
      ],
      "2026-11-01/evening": [
        ["maya", "waiter"],
        ["yoav", "bartender"],
        ["omer", "cook"],
      ],
      "2026-11-01/extra": [["shira", "host"]],
      "2026-11-02/morning": [
        ["shiran", null],
        ["itay", "cook"],
        ["shira", "host"],
      ],
      "2026-11-02/evening": [
        ["noa", "waiter"],
        ["yoav", "bartender"],
        ["omer", "cook"],
        ["maya", "waiter"],
      ],
      "2026-11-03/morning": [
        ["maya", "waiter"],
        ["itay", "cook"],
      ],
      "2026-11-03/evening": [
        ["noa", "waiter"],
        ["yoav", "bartender"],
        ["omer", "cook"],
        ["shira", "host"],
      ],
      "2026-11-04/morning": [
        ["noa", "waiter"],
        ["omer", "cook"],
        ["shira", "host"],
      ],
      "2026-11-04/evening": [
        ["maya", "waiter"],
        ["itay", "cook"],
      ],
      "2026-11-05/morning": [["itay", "cook"]],
      "2026-11-06/friday": [
        ["noa", "waiter"],
        ["maya", "waiter"],
        ["itay", "cook"],
        ["yoav", "bartender"],
      ],
      "2026-11-07/saturday-night": [
        ["omer", "cook"],
        ["shira", "host"],
      ],
    };
    const screen = [
      ...draftWeek(start, RESTAURANT),
      {
        day: start,
        name: "אמצע",
        start: "12:00",
        end: "20:00",
        needed: 2,
        pattern: null,
        assignees: [],
      },
    ]
      .sort(
        (a, b) => a.day.localeCompare(b.day) || a.start.localeCompare(b.start),
      )
      .map((s) => ({
        ...s,
        assignees: (placed[`${s.day}/${s.pattern ?? "extra"}`] ?? []).map(
          ([user, position]) => ({ user, position }),
        ),
      }));
    const input: FillInput = {
      weekStart: start,
      screen,
      staff: ["uri", "shiran", "itay", "yoav", "maya", "noa", "omer", "shira"],
      answers: [
        answer(
          "shiran",
          ["2026-11-01", "08:00", "16:00"],
          ["2026-11-02", "08:00", "16:00"],
          ["2026-11-04", "08:00", "16:00"],
          ["2026-11-05", "16:00", "23:30"],
        ),
        answer(
          "noa",
          ["2026-11-01", "09:00", "17:00"],
          ["2026-11-03", "17:00", "23:30"],
          ["2026-11-06", "08:00", "14:00"],
          ["2026-11-07", "19:30", "00:30"],
        ),
        answer(
          "yoav",
          ["2026-11-02", "12:00", "16:00"],
          ["2026-11-02", "18:00", "23:00"],
          ["2026-11-05", "18:00", "02:00"],
        ),
        answer("maya"),
        answer(
          "itay",
          ...[1, 2, 3, 4, 5].map((n): [string, string, string] => [
            `2026-11-0${n}`,
            "10:00",
            "18:00",
          ]),
        ),
      ],
      away: [],
      lastWeek: null,
      nextDays: [],
      weekHours: FILL_WEEK_HOURS,
      // Tel Aviv, 6–7 November 2026.
      shabbat: {
        friday: "2026-11-06",
        candleLighting: "16:26",
        saturday: "2026-11-07",
        havdalah: "17:24",
      },
      positionKeys: ["waiter", "bartender", "cook", "host"],
      now: null,
      timeZone: zone,
    };
    const fill = fillFromAvailability(input);
    expect(fill).toMatchObject({
      places: 3,
      people: 2,
      openBefore: 15,
      openAfter: 12,
      answered: 5,
      unplaced: [],
    });
    // Every shift that had an open place, row by row as the PR's table shows
    // it: who the fill adds, what stays open, why, and how many cover part.
    expect(
      fill.shifts.map((s) => [
        screen[s.index]?.day,
        screen[s.index]?.start,
        s.added.map((a) => a.user),
        s.open,
        s.why,
        s.partial,
      ]),
    ).toEqual([
      ["2026-11-01", "09:00", ["shiran"], 0, null, 0],
      ["2026-11-01", "12:00", [], 1, "nobody", 3],
      ["2026-11-01", "16:00", [], 1, "nobody", 2],
      ["2026-11-03", "09:00", [], 1, "nobody", 0],
      ["2026-11-04", "16:00", [], 2, "nobody", 0],
      ["2026-11-05", "09:00", [], 2, "nobody", 0],
      ["2026-11-05", "16:00", ["shiran"], 3, "nobody", 2],
      ["2026-11-06", "08:00", [], 1, "nobody", 0],
      ["2026-11-07", "19:30", ["noa"], 1, "nobody", 0],
    ]);
    // No last week, so no positions; nobody blocked; nothing into Shabbat.
    expect(fill.shifts.flatMap((s) => s.added.map((a) => a.position))).toEqual([
      null,
      null,
      null,
    ]);
    expect(fill.shifts.flatMap((s) => s.blocked)).toEqual([]);
    expect(fill.shifts.map((s) => s.shabbat)).toEqual(
      fill.shifts.map(() => null),
    );

    // `&away=1`: Shiran away on Sunday. Sunday morning, which the fill gave
    // her, stays open with her named as away, and the rest is as before.
    // (On Monday she is on the morning already, and her answer covers no
    // other shift that day, so the sheet would say nothing of it.)
    const away = fillFromAvailability({
      ...input,
      away: [{ userId: "shiran", from: start, to: start }],
    });
    expect(away).toMatchObject({ places: 2, people: 2, openAfter: 13 });
    expect(away.shifts[0]).toMatchObject({
      added: [],
      open: 1,
      why: "blocked",
      blocked: [{ user: "shiran", rule: "away" }],
    });
    expect(away.shifts.slice(1)).toEqual(fill.shifts.slice(1));

    // "לפי אנשים": everyone who answered, Maya's empty answer included,
    // with the week after the fill, fewest shifts first (the sheet then
    // orders those by name): Shiran's Monday by hand and the fill's two,
    // 21½ hours; Noa's five by hand and Saturday night.
    expect(fill.byPerson).toEqual([
      { user: "shiran", shifts: 3, minutes: 1290, added: 2 },
      { user: "yoav", shifts: 4, minutes: 1740, added: 0 },
      { user: "maya", shifts: 5, minutes: 2160, added: 0 },
      { user: "itay", shifts: 6, minutes: 2520, added: 0 },
      { user: "noa", shifts: 6, minutes: 2400, added: 1 },
    ]);

    // `&hours=7`: the business's week's hours for the fill
    // (`fillWeekHours`) are 7. Shiran has Monday's morning by hand, 7 hours
    // already, and Noa five shifts: each one who covers an open place is
    // over it, so the fill places nobody and names each of them with the
    // week's hours; the rest stay open as before, nobody covering them.
    const seven = fillFromAvailability({ ...input, weekHours: 7 });
    expect(seven).toMatchObject({
      places: 0,
      people: 0,
      openBefore: 15,
      openAfter: 15,
      unplaced: [],
    });
    expect(
      seven.shifts.map((s) => [
        screen[s.index]?.day,
        screen[s.index]?.start,
        s.why,
        s.blocked,
      ]),
    ).toEqual([
      ["2026-11-01", "09:00", "blocked", [{ user: "shiran", rule: "hours" }]],
      ["2026-11-01", "12:00", "nobody", []],
      ["2026-11-01", "16:00", "nobody", []],
      ["2026-11-03", "09:00", "nobody", []],
      ["2026-11-04", "16:00", "nobody", []],
      ["2026-11-05", "09:00", "nobody", []],
      ["2026-11-05", "16:00", "blocked", [{ user: "shiran", rule: "hours" }]],
      ["2026-11-06", "08:00", "nobody", []],
      ["2026-11-07", "19:30", "blocked", [{ user: "noa", rule: "hours" }]],
    ]);
    // Each one's week as the manager left it.
    expect(seven.byPerson).toEqual([
      { user: "shiran", shifts: 1, minutes: 420, added: 0 },
      { user: "yoav", shifts: 4, minutes: 1740, added: 0 },
      { user: "maya", shifts: 5, minutes: 2160, added: 0 },
      { user: "noa", shifts: 5, minutes: 2130, added: 0 },
      { user: "itay", shifts: 6, minutes: 2520, added: 0 },
    ]);
  });

  it("keeps the café's evening worker off the next morning", () => {
    const screen = draftWeek(WEEK, CAFE);
    const fill = fillOf({
      screen,
      staff: [noa, yoav, maya],
      answers: [
        answer(noa, [day(0), "15:00", "00:00"], [day(1), "07:00", "15:00"]),
        answer(yoav, [day(1), "07:00", "15:00"]),
        answer(maya, [day(0), "15:00", "00:00"]),
      ],
    });
    const sundayEvening = screen.findIndex(
      (s) => s.day === day(0) && s.pattern === "evening",
    );
    const mondayMorning = screen.findIndex(
      (s) => s.day === day(1) && s.pattern === "morning",
    );
    expect(who(fill, sundayEvening).sort()).toEqual([noa, maya].sort());
    expect(who(fill, mondayMorning)).toEqual([yoav]);
    expect(fill.shifts.find((s) => s.index === mondayMorning)).toMatchObject({
      open: 2,
      why: "blocked",
      blocked: [{ user: noa, rule: "rest" }],
    });
  });

  it("fills the shop's next week in last week's positions, Tamar to 41 hours, and stops her at the week's hours", () => {
    const next = "2026-11-22";
    const last = "2026-11-15";
    const placedLast: Record<string, [string, string][]> = {
      "2026-11-15/morning": [
        ["tamar", "cashier"],
        ["itai", "sales"],
      ],
      "2026-11-15/evening": [
        ["roni", "stock"],
        ["liya", "cashier"],
      ],
      "2026-11-16/morning": [
        ["liya", "cashier"],
        ["roni", "stock"],
      ],
      "2026-11-16/evening": [
        ["itai", "sales"],
        ["omer", "lead"],
      ],
      "2026-11-17/morning": [
        ["tamar", "cashier"],
        ["itai", "sales"],
      ],
      "2026-11-17/evening": [["roni", "stock"]],
      "2026-11-18/morning": [
        ["roni", "stock"],
        ["tamar", "cashier"],
      ],
      "2026-11-18/evening": [
        ["itai", "sales"],
        ["omer", "lead"],
      ],
      "2026-11-19/morning": [
        ["itai", "sales"],
        ["omer", "lead"],
      ],
      "2026-11-19/evening": [
        ["tamar", "cashier"],
        ["roni", "stock"],
      ],
      "2026-11-20/friday": [
        ["tamar", "cashier"],
        ["itai", "sales"],
        ["roni", "stock"],
      ],
    };
    const lastWeek: CopySource = {
      start: last,
      published: true,
      // As `copySourceOf` leaves it: Liya, who left, is still on her shifts.
      shifts: draftWeek(last, RETAIL).map((s) => ({
        ...s,
        assignees: (placedLast[`${s.day}/${s.pattern}`] ?? []).map(
          ([user, position]) => ({ user, position }),
        ),
      })),
    };
    const screen = draftWeek(next, RETAIL).map((s) => ({
      ...s,
      assignees:
        s.day === next && s.pattern === "morning"
          ? [
              { user: "tamar", position: "cashier" },
              { user: "itai", position: "sales" },
            ]
          : [],
    }));
    const input = (weekHours: number): FillInput => ({
      weekStart: next,
      screen,
      staff: ["michal", "omer", "tamar", "itai", "roni"],
      answers: [
        answer(
          "tamar",
          ...[22, 23, 24, 25, 26, 27].map((n): [string, string, string] => [
            `2026-11-${n}`,
            "08:00",
            "15:00",
          ]),
        ),
        answer(
          "omer",
          ["2026-11-23", "15:00", "22:00"],
          ["2026-11-25", "15:00", "22:00"],
          ["2026-11-26", "08:00", "15:00"],
        ),
      ],
      away: [],
      lastWeek,
      nextDays: [],
      weekHours,
      // Haifa, 27–28 November 2026.
      shabbat: {
        friday: "2026-11-27",
        candleLighting: "16:04",
        saturday: "2026-11-28",
        havdalah: "17:13",
      },
      positionKeys: ["cashier", "sales", "stock", "lead"],
      // Tuesday 17 November at 11:20: next week is all ahead.
      now: new Date("2026-11-17T09:20:00.000Z"),
      timeZone: zone,
    });
    const thursday = screen.findIndex(
      (s) => s.day === "2026-11-26" && s.pattern === "morning",
    );
    // At the week's 42 she takes Thursday morning too: 41 hours. Whether
    // she is under 18 makes no difference to the fill (Orel, 25.11.2026).
    const week = fillFromAvailability(input(FILL_WEEK_HOURS));
    expect(week.week[thursday]?.assignees.map((a) => a.user)).toEqual([
      "omer",
      "tamar",
    ]);
    expect(week.byPerson).toEqual([
      { user: "omer", shifts: 3, minutes: 21 * 60, added: 3 },
      { user: "tamar", shifts: 6, minutes: 41 * 60, added: 5 },
    ]);
    // With the week's hours at 40, Thursday's 7 would take her to 41.
    const forty = fillFromAvailability(input(40));
    expect(forty.shifts.find((s) => s.index === thursday)).toMatchObject({
      added: [{ user: "omer", position: "lead" }],
      open: 1,
      why: "blocked",
      blocked: [{ user: "tamar", rule: "hours" }],
    });
    expect(forty.byPerson).toEqual([
      { user: "omer", shifts: 3, minutes: 21 * 60, added: 3 },
      { user: "tamar", shifts: 5, minutes: 34 * 60, added: 4 },
    ]);
    // Each goes on in last week's position for that kind of shift.
    for (const fill of [week, forty]) {
      expect(
        new Set(
          fill.week.flatMap((s) =>
            s.assignees.map((a) => `${a.user}=${a.position}`),
          ),
        ),
      ).toEqual(new Set(["tamar=cashier", "itai=sales", "omer=lead"]));
    }
  });
});

// The templates' patterns (supabase/migrations: 20261017000100_templates.sql,
// 20261107000800_templates_for_every_business.sql).
const RESTAURANT: ShiftPattern[] = [
  {
    key: "morning",
    name: "בוקר",
    days: [0, 1, 2, 3, 4],
    start: "09:00",
    end: "16:00",
    needed: 3,
  },
  {
    key: "evening",
    name: "ערב",
    days: [0, 1, 2, 3, 4],
    start: "16:00",
    end: "23:30",
    needed: 4,
  },
  {
    key: "friday",
    name: "בוקר",
    days: [5],
    start: "08:00",
    end: "14:30",
    needed: 5,
  },
  {
    key: "saturday-night",
    name: "מוצ״ש",
    days: [6],
    start: "19:30",
    end: "00:00",
    needed: 4,
  },
];
const CAFE: ShiftPattern[] = [
  {
    key: "morning",
    name: "בוקר",
    days: [0, 1, 2, 3, 4],
    start: "07:00",
    end: "15:00",
    needed: 3,
  },
  {
    key: "evening",
    name: "ערב",
    days: [0, 1, 2, 3, 4],
    start: "15:00",
    end: "00:00",
    needed: 3,
  },
  {
    key: "friday",
    name: "שישי",
    days: [5],
    start: "07:00",
    end: "16:00",
    needed: 4,
  },
  {
    key: "saturday-night",
    name: "מוצ״ש",
    days: [6],
    start: "19:00",
    end: "01:00",
    needed: 3,
  },
];
const RETAIL: ShiftPattern[] = [
  {
    key: "morning",
    name: "בוקר",
    days: [0, 1, 2, 3, 4],
    start: "08:00",
    end: "15:00",
    needed: 2,
  },
  {
    key: "evening",
    name: "ערב",
    days: [0, 1, 2, 3, 4],
    start: "15:00",
    end: "22:00",
    needed: 2,
  },
  {
    key: "friday",
    name: "שישי",
    days: [5],
    start: "08:00",
    end: "14:00",
    needed: 3,
  },
];

/** Shifts around the clock, every day: a guard's or a care home's. */
const AROUND_THE_CLOCK: ShiftPattern[] = [
  {
    key: "day",
    name: "יום",
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "07:00",
    end: "19:00",
    needed: 1,
  },
  {
    key: "night",
    name: "לילה",
    days: [0, 1, 2, 3, 4, 5, 6],
    start: "19:00",
    end: "07:00",
    needed: 1,
  },
];

/** Enough people for every templated place, as the 44-place test has. */
const MANY = [noa, yoav, maya, itay, shiran, uri, tamar, omer, liya, ID(90)];

/**
 * Answers kept as the form suggests them: every day of the week as it opens
 * (`suggestedDay`), from the business's shifts, sent as they are.
 */
function keptAsSuggested(
  weekStart: string,
  patterns: readonly ShiftPattern[],
  shabbat: ShabbatLimits | null,
  team: readonly string[],
) {
  const hours = shiftHoursOf(patterns);
  return team.map((userId) => ({
    userId,
    ranges: weekDates(weekStart).flatMap((on) =>
      suggestedDay(on, shabbat, hours).map((h) => ({ day: on, ...h })),
    ),
  }));
}

/** Free all day on each day of the week starting on `start`. */
function allWeekOf(start: string, userId: string) {
  return answer(
    userId,
    ...weekDates(start).map((on): [string, string, string] => [
      on,
      "06:00",
      "23:59",
    ]),
  );
}

function defaults(): FillInput {
  return {
    weekStart: WEEK,
    screen: [],
    staff: STAFF,
    answers: [],
    away: [],
    lastWeek: null,
    nextDays: [],
    weekHours: FILL_WEEK_HOURS,
    shabbat: null,
    positionKeys: [],
    now: null,
    timeZone: zone,
  };
}

/** A small seeded generator (mulberry32), so a failing week can be found again. */
function mulberry32(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(list: readonly T[], random: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

const TEMPLATES: { patterns: ShiftPattern[]; keys: string[] }[] = [
  { patterns: RESTAURANT, keys: ["waiter", "bartender", "cook", "host"] },
  { patterns: CAFE, keys: ["barista", "waiter", "bartender", "cook"] },
  { patterns: RETAIL, keys: ["cashier", "sales", "stock", "lead"] },
  { patterns: RETAIL, keys: [] },
  // The general template: no pattern, shifts added by hand only.
  { patterns: [], keys: [] },
];
const RANGES: [string, string][] = [
  ["07:00", "15:00"],
  ["08:00", "16:00"],
  ["09:00", "17:00"],
  ["15:00", "00:00"],
  ["16:00", "23:30"],
  ["19:00", "01:00"],
  ["06:00", "23:59"],
  ["12:00", "20:00"],
  ["19:00", "07:00"],
];
/** Shifts added by hand: long days, a long Friday and nights among them. */
const BY_HAND: [string, string][] = [
  ["06:00", "14:00"],
  ["07:00", "19:00"],
  ["19:00", "07:00"],
  ["08:00", "17:00"],
  ["08:00", "15:30"],
  ["10:00", "18:00"],
  ["12:00", "20:00"],
  ["19:00", "01:00"],
  ["22:00", "06:00"],
];

/** A week to fill: a template's pattern, shifts by hand, people placed by hand, answers, days away and edges. */
function generated(seed: number): FillInput {
  const random = mulberry32(seed);
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(random() * list.length)] as T;
  const template = pick(TEMPLATES);
  // A Sunday, a Monday, and a Sunday in summer time; then the weeks the
  // clocks change in: forward on Friday 27 March, back on Sunday 25
  // October, the first day of a Sunday week and the last of a Monday one.
  const weekStart = pick([
    "2026-12-06",
    "2026-12-07",
    "2027-06-13",
    "2026-03-22",
    "2026-10-25",
    "2026-10-19",
  ]);
  const dates = weekDates(weekStart);
  const team = STAFF.slice(0, 3 + Math.floor(random() * 6));
  const position = () =>
    template.keys.length > 0 && random() < 0.7 ? pick(template.keys) : null;

  const placeByHand = (
    shifts: ScheduledShift[],
    weekOf: string,
    odds: number,
  ) => {
    shifts.forEach((s, i) => {
      for (const user of team) {
        if (random() >= odds || s.assignees.some((a) => a.user === user)) {
          continue;
        }
        s.assignees.push({ user, position: position() });
        if (overlappingShift(weekOf, shifts, i, user)) s.assignees.pop();
      }
    });
    return shifts;
  };

  const screen = draftWeek(weekStart, template.patterns);
  for (let n = Math.floor(random() * 6); n > 0; n--) {
    const [start, end] = pick(BY_HAND);
    const one: ScheduledShift = {
      day: pick(dates),
      name: pick(["אמצע", "לילה", "פתיחה"]),
      start,
      end,
      needed: 1 + Math.floor(random() * 3),
      pattern: null,
      assignees: [],
    };
    screen.splice(shiftSlot(screen, one), 0, one);
  }
  placeByHand(screen, weekStart, 0.12);

  const answers = team.flatMap((user) => {
    if (random() < 0.15) return [];
    const ranges: AvailabilityRange[] = [];
    for (const on of dates) {
      if (random() < 0.4) continue;
      const [start, end] = pick(RANGES);
      ranges.push({ day: on, start, end });
    }
    return [{ userId: user, ranges }];
  });
  const awayDays = team.flatMap((user) => {
    if (random() >= 0.3) return [];
    const from = addDays(weekStart, Math.floor(random() * 9) - 1);
    return [away(user, from, addDays(from, Math.floor(random() * 3)))];
  });
  const lastStart = addDays(weekStart, -7);
  const lastWeek: CopySource | null =
    random() < 0.5
      ? {
          start: lastStart,
          published: true,
          shifts: placeByHand(
            draftWeek(lastStart, template.patterns),
            lastStart,
            0.3,
          ),
        }
      : null;
  const nextStart = addDays(weekStart, 7);
  const nextDays =
    random() < 0.5
      ? placeByHand(
          draftWeek(nextStart, template.patterns).filter(
            (s) => s.day <= addDays(nextStart, 1),
          ),
          nextStart,
          0.3,
        )
      : [];
  const friday = dates.find((on) => weekdayOf(on) === 5) as string;
  return {
    weekStart,
    screen,
    staff: [...team, liya],
    answers: [...answers, allWeekOf(weekStart, liya)],
    away: awayDays,
    lastWeek,
    nextDays,
    weekHours: pick([4, 20, FILL_WEEK_HOURS, FILL_WEEK_HOURS_MAX]),
    shabbat:
      random() < 0.5
        ? {
            friday,
            candleLighting: pick(["16:12", "19:25"]),
            saturday: addDays(friday, 1),
            havdalah: pick(["17:24", "20:21"]),
          }
        : null,
    positionKeys: template.keys,
    now:
      random() < 0.3
        ? instantIn(pick(dates), pick(["06:00", "12:00", "20:00"]), zone)
        : null,
    timeZone: zone,
  };
}

/** Minutes of real time at a date and time in Israel, each read once. */
const realMinutes = new Map<string, number>();
const realAt = (date: string, time: string) => {
  const key = `${date} ${time}`;
  const known = realMinutes.get(key);
  if (known !== undefined) return known;
  const minute = instantIn(date, time, zone).getTime() / 60_000;
  realMinutes.set(key, minute);
  return minute;
};
/** A shift's start and end in real time, as `private.shift_span` reads them. */
const realSpan = (
  s: Pick<ScheduledShift, "day" | "start" | "end">,
): [number, number] => [
  realAt(s.day, s.start),
  realAt(s.end <= s.start ? addDays(s.day, 1) : s.day, s.end),
];

/** Everything the fill promises, checked on one week it filled. */
function checkFill(input: FillInput, fill: WeekFill) {
  const { weekStart, screen } = input;
  // A screen the schedule's rules take stays one they take.
  expect(
    weekSchedule(weekStart, input.positionKeys).safeParse(screen).success,
  ).toBe(true);
  expect(
    weekSchedule(weekStart, input.positionKeys).safeParse(fill.week).success,
  ).toBe(true);
  // It adds no one on two shifts at once.
  const clashed = doubleBooked(weekStart, screen);
  for (const pair of doubleBooked(weekStart, fill.week)) {
    expect(clashed.has(pair)).toBe(true);
  }

  const ranges = new Map<string, AvailabilityRange[]>();
  for (const a of input.answers) {
    if (input.staff.includes(a.userId)) {
      ranges.set(a.userId, [...(ranges.get(a.userId) ?? []), ...a.ranges]);
    }
  }
  const edges: { user: string; at: [number, number] }[] = [];
  if (input.lastWeek && addDays(input.lastWeek.start, 7) === weekStart) {
    for (const s of input.lastWeek.shifts) {
      for (const a of s.assignees) {
        edges.push({ user: a.user, at: realSpan(s) });
      }
    }
  }
  for (const s of input.nextDays) {
    if (s.day < addDays(weekStart, 7)) continue;
    for (const a of s.assignees) {
      edges.push({ user: a.user, at: realSpan(s) });
    }
  }

  let places = 0;
  let openAfter = 0;
  fill.week.forEach((s, i) => {
    const was = screen[i] as ScheduledShift;
    expect(s.id).toBe(was.id);
    expect(s.assignees.slice(0, was.assignees.length)).toEqual(was.assignees);
    const news = s.assignees.slice(was.assignees.length);
    if (news.length > 0)
      expect(s.assignees.length).toBeLessThanOrEqual(s.needed);
    places += news.length;
    for (const { user, position } of news) {
      expect(ranges.has(user)).toBe(true);
      expect(availableFor(s, ranges.get(user) ?? [])).toBe(true);
      expect(awayDuring(input.away, user, s)).toBe(false);
      expect(position === null || input.positionKeys.includes(position)).toBe(
        true,
      );
      // The shift's sheet calls them available, once taken off it.
      const without = fill.week.map((other, j) =>
        j === i
          ? {
              ...other,
              assignees: other.assignees.filter((a) => a.user !== user),
            }
          : other,
      );
      const state = shiftCandidates(
        weekStart,
        without,
        i,
        [{ userId: user }],
        input.answers,
        input.away,
      )[0]?.state;
      expect(state).toBe("available");
      // One shift that day, and 8 hours from every other in real time,
      // edges included.
      const at = realSpan(s);
      const others = [
        ...fill.week.flatMap((other, j) =>
          j !== i && other.assignees.some((a) => a.user === user)
            ? [{ day: other.day, at: realSpan(other) }]
            : [],
        ),
        ...edges
          .filter((edge) => edge.user === user)
          .map((edge) => ({ day: "", at: edge.at })),
      ];
      for (const other of others) {
        expect(other.day).not.toBe(s.day);
        expect(
          Math.max(other.at[0] - at[1], at[0] - other.at[1]),
        ).toBeGreaterThanOrEqual(LIMITS.restBetween);
      }
    }
  });
  for (const s of fill.shifts) openAfter += s.open;
  expect(fill.places).toBe(places);
  expect(fill.openAfter).toBe(openAfter);

  // Whoever the fill gave a shift is within the days and the hours.
  for (const person of fill.byPerson) {
    if (person.added === 0) continue;
    expect(person.minutes).toBeLessThanOrEqual(input.weekHours * 60);
    const days = new Set(
      fill.week
        .filter((s) => s.assignees.some((a) => a.user === person.user))
        .map((s) => s.day),
    );
    expect(days.size).toBeLessThanOrEqual(FILL_MAX_DAYS);
  }
  // A place left open always says why, and only the shifts that had one are listed.
  for (const s of fill.shifts) {
    expect(s.open === 0).toBe(s.why === null);
    if (s.why === "blocked") expect(s.blocked.length).toBeGreaterThan(0);
    if (s.why === "nobody") expect(s.blocked).toEqual([]);
  }
}
