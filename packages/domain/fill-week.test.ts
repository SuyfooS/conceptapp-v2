import { describe, expect, it } from "vitest";
import { type AwaySpan, awayDuring } from "./absences";
import {
  type AvailabilityRange,
  addDays,
  instantIn,
  weekDates,
  weekdayOf,
} from "./availability";
import type { ShabbatLimits } from "./availability-form";
import type { CopySource } from "./copy-week";
import {
  FILL_MAX_DAYS,
  FILL_MINOR_HOURS,
  FILL_WEEK_HOURS,
  FILL_WEEK_HOURS_MAX,
  fillFromAvailability,
  type WeekFill,
  weekMinors,
} from "./fill-week";
import { minutesOf, rangeMinutes } from "./hours";
import { LIMITS } from "./payroll-flags";
import {
  availableFor,
  doubleBooked,
  draftWeek,
  overlappingShift,
  type ScheduledShift,
  shiftCandidates,
  shiftSlot,
  shiftSpan,
  weekSchedule,
} from "./schedule";
import { ISRAEL_TIME_ZONE } from "./shabbat";
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
    minors: new Set(),
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
    expect(FILL_MINOR_HOURS).toEqual({ from: "08:00", to: "20:00" });
  });
});

describe("weekMinors", () => {
  it("counts whoever is a minor on any day of the week, for all of it", () => {
    expect(
      weekMinors(WEEK, [
        // Turns 18 on Wednesday: a minor all week, the stricter choice.
        { userId: tamar, youthUntil: day(3) },
        // Turns 18 next week.
        { userId: noa, youthUntil: day(9) },
        // Turned 18 on the week's first day: an adult all week.
        { userId: yoav, youthUntil: WEEK },
        { userId: maya, youthUntil: null },
        { userId: noa, youthUntil: day(9) },
      ]),
    ).toEqual([noa, tamar].sort());
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
      expect(fill.shifts[0]).toMatchObject({
        why: "blocked",
        blocked: [{ user: noa, rule: "away" }],
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

    it("places a minor only between 08:00 and 20:00", () => {
      const fill = fillOf({
        screen: [
          shift(day(0), "16:00", "23:30"),
          shift(day(1), "07:00", "15:00"),
          shift(day(2), "09:00", "16:00"),
        ],
        answers: [allWeek(tamar)],
        minors: new Set([tamar]),
      });
      expect(ruleOf(fill, 0, tamar)).toBe("minorHours");
      expect(ruleOf(fill, 1, tamar)).toBe("minorHours");
      expect(who(fill, 2)).toEqual([tamar]);
    });

    it("places a minor for at most 8 hours, 7 on a Friday", () => {
      // Thursday 10 and Friday 11 December.
      expect(weekdayOf(day(5))).toBe(5);
      const fill = fillOf({
        screen: [
          shift(day(0), "08:00", "17:00"),
          shift(day(4), "08:00", "15:30"),
          shift(day(5), "08:00", "15:30"),
          shift(day(1), "08:00", "16:00"),
        ],
        answers: [allWeek(tamar)],
        minors: new Set([tamar]),
      });
      expect(ruleOf(fill, 0, tamar)).toBe("minorLong");
      expect(who(fill, 1)).toEqual([tamar]);
      expect(ruleOf(fill, 2, tamar)).toBe("minorLong");
      expect(who(fill, 3)).toEqual([tamar]);
    });

    it("stops a minor at 40 hours, even when the business allows 58", () => {
      // Five mornings placed by hand, 35 hours; Friday's 6 would make 41.
      const screen = [
        ...[0, 1, 2, 3, 4].map((n) =>
          shift(day(n), "08:00", "15:00", [tamar, noa], { needed: 2 }),
        ),
        shift(day(5), "08:00", "14:00", [], { needed: 2 }),
      ];
      const fill = fillOf({
        screen,
        answers: [allWeek(tamar), allWeek(noa)],
        minors: new Set([tamar]),
        weekHours: 58,
      });
      expect(who(fill, 5)).toEqual([noa]);
      expect(ruleOf(fill, 5, tamar)).toBe("hours");
    });

    it("gives an adult what a minor can't take", () => {
      const screen = [
        shift(day(0), "16:00", "23:30"),
        shift(day(1), "08:00", "17:00"),
        shift(day(5), "08:00", "15:30"),
      ];
      const fill = fillOf({ screen, answers: [allWeek(tamar)] });
      expect(fill.week.map((s) => s.assignees.map((a) => a.user))).toEqual([
        [tamar],
        [tamar],
        [tamar],
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

    it("reads last week's Saturday night, only when last week is the week just before", () => {
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
      // Two weeks back is no edge: its Saturday was a week before Sunday.
      const older: CopySource = {
        start: addDays(WEEK, -14),
        published: true,
        shifts: [shift(addDays(WEEK, -8), "19:00", "01:00", [noa])],
      };
      expect(
        who(fillOf({ screen: sunday, answers, lastWeek: older }), 0),
      ).toEqual([noa]);
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
      // Someone already past the cap gets nothing, however short.
      const over = [
        ...[1, 2, 3, 4, 5].map((n) => shift(day(n), "07:00", "16:00", [noa])),
        shift(day(0), "10:00", "11:00"),
      ];
      expect(ruleOf(fillOf({ screen: over, answers }), 5, noa)).toBe("hours");
    });
  });

  describe("order and fairness", () => {
    const place = (extra: Partial<ScheduledShift> = {}) =>
      shift(day(3), "16:00", "23:00", [], extra);

    it("puts whoever has the fewest hours this week first, the manager's placements counted", () => {
      const fill = fillOf({
        screen: [shift(day(0), "09:00", "16:00", [noa]), place()],
        answers: [allWeek(noa), allWeek(yoav)],
      });
      expect(who(fill, 1)).toEqual([yoav]);
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

    it("then whoever has the fewest shifts", () => {
      const fill = fillOf({
        screen: [
          shift(day(0), "10:00", "14:00", [noa], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(1), "10:00", "14:00", [noa], {
            name: "אמצע",
            pattern: null,
          }),
          shift(day(2), "08:00", "16:00", [yoav]),
          place(),
        ],
        answers: [allWeek(noa), allWeek(yoav)],
      });
      expect(who(fill, 3)).toEqual([yoav]);
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

    it("names Shabbat, with havdalah or candle lighting, and still places an answer that covers it", () => {
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
        expect.objectContaining({
          index: 0,
          open: 1,
          why: "shabbat",
          shabbat: { side: "saturday", time: "20:21" },
        }),
      ]);
      const open = fillOf({ screen, answers, shabbat: null });
      expect(open.shifts.map((s) => [s.why, s.shabbat])).toEqual([
        ["nobody", null],
        ["nobody", null],
      ]);
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

    it("fills a week that starts on Monday, Friday read by its weekday", () => {
      const monday = "2026-12-07";
      const fill = fillOf({
        weekStart: monday,
        screen: draftWeek(monday, RETAIL),
        answers: [
          allWeekOf(monday, tamar),
          answer(noa, [monday, "08:00", "15:00"]),
        ],
        minors: new Set([tamar]),
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
      // Friday is the week's fifth day here, and still a minor's 7 hours.
      const long = fillOf({
        weekStart: monday,
        screen: [
          shift(addDays(monday, 3), "08:00", "15:30"),
          shift(addDays(monday, 4), "08:00", "15:30"),
        ],
        answers: [allWeekOf(monday, tamar)],
        minors: new Set([tamar]),
      });
      expect(who(long, 0)).toEqual([tamar]);
      expect(ruleOf(long, 1, tamar)).toBe("minorLong");
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
        "minorHours",
        "minorLong",
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
  it("fills the restaurant twin's week of 1–7 November", () => {
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
    const at = (on: string, from: string) =>
      screen.findIndex((s) => s.day === on && s.start === from);
    const fill = fillFromAvailability({
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
      minors: new Set(),
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
    });
    expect(fill).toMatchObject({
      places: 3,
      people: 2,
      openBefore: 15,
      openAfter: 12,
      answered: 5,
      unplaced: [],
    });
    const row = (on: string, from: string) =>
      fill.shifts.find((s) => s.index === at(on, from));
    expect(row("2026-11-01", "09:00")).toMatchObject({
      added: [{ user: "shiran", position: null }],
      open: 0,
    });
    expect(row("2026-11-01", "12:00")).toMatchObject({
      open: 1,
      why: "nobody",
      partial: 3,
    });
    expect(row("2026-11-05", "16:00")).toMatchObject({
      added: [{ user: "shiran", position: null }],
      open: 3,
      why: "nobody",
      partial: 2,
    });
    expect(row("2026-11-07", "19:30")).toMatchObject({
      added: [{ user: "noa", position: null }],
      open: 1,
      why: "nobody",
    });
    expect(fill.shifts.flatMap((s) => s.blocked)).toEqual([]);
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

  it("stops the shop's Tamar, a minor, at 40 hours", () => {
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
    const input = (minor: boolean): FillInput => ({
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
      minors: new Set(minor ? ["tamar"] : []),
      lastWeek,
      nextDays: [],
      weekHours: FILL_WEEK_HOURS,
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
    const minor = fillFromAvailability(input(true));
    expect(minor.shifts.find((s) => s.index === thursday)).toMatchObject({
      added: [{ user: "omer", position: "lead" }],
      open: 1,
      why: "blocked",
      blocked: [{ user: "tamar", rule: "hours" }],
    });
    expect(minor.byPerson).toEqual([
      { user: "omer", shifts: 3, minutes: 21 * 60, added: 3 },
      { user: "tamar", shifts: 5, minutes: 34 * 60, added: 4 },
    ]);
    // As an adult, she takes Thursday morning too: 41 hours.
    const adult = fillFromAvailability(input(false));
    expect(adult.week[thursday]?.assignees.map((a) => a.user)).toEqual([
      "omer",
      "tamar",
    ]);
    expect(adult.byPerson.find((p) => p.user === "tamar")?.minutes).toBe(
      41 * 60,
    );
    // Each goes on in last week's position for that kind of shift.
    expect(
      new Set(
        minor.week.flatMap((s) =>
          s.assignees.map((a) => `${a.user}=${a.position}`),
        ),
      ),
    ).toEqual(new Set(["tamar=cashier", "itai=sales", "omer=lead"]));
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
    minors: new Set(),
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
/** Shifts added by hand: a minor's long day and long Friday among them. */
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

/** A week to fill: a template's pattern, shifts by hand, people placed by hand, answers, days away, minors and edges. */
function generated(seed: number): FillInput {
  const random = mulberry32(seed);
  const pick = <T>(list: readonly T[]): T =>
    list[Math.floor(random() * list.length)] as T;
  const template = pick(TEMPLATES);
  // A Sunday, a Monday, and a Sunday in summer time.
  const weekStart = pick(["2026-12-06", "2026-12-07", "2027-06-13"]);
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
    minors: new Set(team.filter(() => random() < 0.3)),
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
        edges.push({ user: a.user, at: shiftSpan(weekStart, s) });
      }
    }
  }
  for (const s of input.nextDays) {
    if (s.day < addDays(weekStart, 7)) continue;
    for (const a of s.assignees) {
      edges.push({ user: a.user, at: shiftSpan(weekStart, s) });
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
      if (input.minors.has(user)) {
        const from = minutesOf(s.start);
        const length = rangeMinutes(s.start, s.end);
        expect(from).toBeGreaterThanOrEqual(minutesOf(FILL_MINOR_HOURS.from));
        expect(from + length).toBeLessThanOrEqual(
          minutesOf(FILL_MINOR_HOURS.to),
        );
        expect(length).toBeLessThanOrEqual(
          weekdayOf(s.day) === 5 ? LIMITS.minorEve : LIMITS.minorDay,
        );
      }
      // One shift that day, and 8 hours from every other, edges included.
      const at = shiftSpan(weekStart, s);
      const others = [
        ...fill.week.flatMap((other, j) =>
          j !== i && other.assignees.some((a) => a.user === user)
            ? [{ day: other.day, at: shiftSpan(weekStart, other) }]
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
    const cap = input.minors.has(person.user)
      ? Math.min(input.weekHours * 60, LIMITS.minorWeek)
      : input.weekHours * 60;
    expect(person.minutes).toBeLessThanOrEqual(cap);
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
