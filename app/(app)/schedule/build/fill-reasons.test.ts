import { addDays } from "@domain/availability";
import {
  FILL_WEEK_HOURS,
  type FillShift,
  fillFromAvailability,
} from "@domain/fill-week";
import type { ScheduledShift } from "@domain/schedule";
import { ISRAEL_TIME_ZONE } from "@domain/shabbat";
import { describe, expect, it } from "vitest";
import { fillDays, fillLine, fillReason } from "./fill-reasons";

// What the fill's sheet says of each shift that had an open place, from the
// fill itself: the reason a place stays open, and the days in order.

// Sunday 6 December 2026 to Saturday 12 December; winter in Tel Aviv.
const WEEK = "2026-12-06";
const day = (n: number) => addDays(WEEK, n);
const SHABBAT = {
  friday: day(5),
  candleLighting: "16:12",
  saturday: day(6),
  havdalah: "17:14",
};

const shift = (
  on: string,
  start: string,
  end: string,
  people: string[] = [],
  needed = 1,
): ScheduledShift => ({
  day: on,
  name: start < "12:00" ? "בוקר" : "ערב",
  start,
  end,
  needed,
  pattern: start < "12:00" ? "morning" : "evening",
  assignees: people.map((user) => ({ user, position: null })),
});

const answer = (userId: string, ...ranges: [string, string, string][]) => ({
  userId,
  ranges: ranges.map(([on, start, end]) => ({ day: on, start, end })),
});

const fillOf = (
  screen: ScheduledShift[],
  answers: ReturnType<typeof answer>[],
  away: { userId: string; from: string; to: string }[] = [],
  now: Date | null = null,
) =>
  fillFromAvailability({
    weekStart: WEEK,
    screen,
    staff: ["noa", "yoav", "maya", "shiran"],
    answers,
    away,
    lastWeek: null,
    nextDays: [],
    weekHours: FILL_WEEK_HOURS,
    shabbat: SHABBAT,
    positionKeys: [],
    now,
    timeZone: ISRAEL_TIME_ZONE,
  });

/** The reason of the shift at `index`, as the sheet reads it. */
const reasonAt = (fill: ReturnType<typeof fillOf>, index: number) => {
  const open = fill.shifts.find((s) => s.index === index);
  if (!open) throw new Error(`No open place on shift ${index}`);
  return fillReason(open, fill.week[index]?.assignees.length ?? 0);
};

describe("fillReason", () => {
  it("says nothing of a shift the fill filled", () => {
    const fill = fillOf(
      [shift(day(0), "09:00", "16:00")],
      [answer("noa", [day(0), "09:00", "16:00"])],
    );
    expect(reasonAt(fill, 0)).toBeNull();
  });

  // "אף אחד נוסף" whenever anyone is on the shift after the fill, whoever
  // put them there; "אף אחד" only on a shift nobody is on.
  it("says nobody else once anyone is on the shift, whoever put them there", () => {
    const fill = fillOf(
      [
        shift(day(0), "09:00", "16:00", [], 2),
        shift(day(1), "09:00", "16:00", ["maya"], 2),
        shift(day(2), "09:00", "16:00", [], 1),
      ],
      [
        answer("noa", [day(0), "09:00", "16:00"], [day(2), "12:00", "16:00"]),
        answer("yoav", [day(2), "10:00", "18:00"]),
      ],
    );
    // Sunday: the fill put Noa on, and nobody else covers it.
    expect(reasonAt(fill, 0)).toEqual({
      why: "nobody",
      others: true,
      partial: 0,
      shabbat: null,
    });
    // Monday: the manager put Maya on.
    expect(reasonAt(fill, 1)).toMatchObject({ why: "nobody", others: true });
    // Tuesday: nobody on it, and two cover only part of it.
    expect(reasonAt(fill, 2)).toEqual({
      why: "nobody",
      others: false,
      partial: 2,
      shabbat: null,
    });
  });

  it("names everyone a rule stopped, with the rule", () => {
    const fill = fillOf(
      [shift(day(0), "09:00", "16:00")],
      [
        answer("noa", [day(0), "09:00", "16:00"]),
        answer("yoav", [day(0), "08:00", "17:00"]),
      ],
      [
        { userId: "noa", from: day(0), to: day(0) },
        { userId: "yoav", from: day(0), to: day(0) },
      ],
    );
    expect(reasonAt(fill, 0)).toEqual({
      why: "blocked",
      blocked: [
        { user: "noa", rule: "away" },
        { user: "yoav", rule: "away" },
      ],
      shabbat: null,
    });
  });

  // Saturday's evening starts at 16:00, before havdalah at 17:14.
  it("gives Shabbat as the reason only while no answer covers the shift", () => {
    const fill = fillOf([shift(day(6), "16:00", "23:00")], []);
    expect(reasonAt(fill, 0)).toEqual({
      why: "shabbat",
      side: "saturday",
      time: "17:14",
    });
  });

  // An answer sent before the business closed on Shabbat covers Friday's
  // evening: the fill puts Noa on, and the place left says Shabbat's time
  // beside nobody else, never that the shift has no availability.
  it("puts Shabbat's time beside nobody else, and beside who was stopped", () => {
    const friday = shift(day(5), "16:00", "23:00", [], 2);
    const nobody = fillOf(
      [friday],
      [answer("noa", [day(5), "15:00", "23:30"])],
    );
    expect(reasonAt(nobody, 0)).toEqual({
      why: "nobody",
      others: true,
      partial: 0,
      shabbat: { side: "friday", time: "16:12" },
    });
    const blocked = fillOf(
      [friday],
      [answer("noa", [day(5), "15:00", "23:30"])],
      [{ userId: "noa", from: day(5), to: day(5) }],
    );
    expect(reasonAt(blocked, 0)).toEqual({
      why: "blocked",
      blocked: [{ user: "noa", rule: "away" }],
      shabbat: { side: "friday", time: "16:12" },
    });
  });

  it("says nothing without a reason, even with a place open", () => {
    const odd: FillShift = {
      index: 0,
      added: [],
      open: 1,
      why: null,
      shabbat: null,
      partial: 0,
      blocked: [],
    };
    expect(fillReason(odd, 0)).toBeNull();
  });
});

// The line above the sheet's button, or in its place. `remindable`: the
// builder shows next week, whose answers can still come; else the week
// running now, whose answers were all sent before it began.
describe("fillLine", () => {
  const morning = [shift(day(0), "09:00", "16:00")];
  const noa = answer("noa", [day(0), "09:00", "16:00"]);

  it("says nothing is saved yet while the fill places anyone", () => {
    expect(fillLine(fillOf(morning, [noa]), true)).toBe("note");
    expect(fillLine(fillOf(morning, [noa]), false)).toBe("note");
  });

  // The week running now, the sheet open at 08:59 on Sunday: at 09:00 the
  // clock begins the morning, its one open place. The sheet stays open and
  // says nothing is left to fill, whoever answered.
  it("says nothing is left to fill once the clock began the last shift with an open place", () => {
    // 09:00 in Israel in December is 07:00 UTC.
    const at = (iso: string, answers = [noa]) =>
      fillOf(morning, answers, [], new Date(iso));
    expect(fillLine(at("2026-12-06T06:59:00Z"), false)).toBe("note");
    const begun = at("2026-12-06T07:00:00Z");
    expect(begun.openBefore).toBe(0);
    expect(begun.places).toBe(0);
    expect(fillLine(begun, false)).toBe("nothing.full");
    expect(fillLine(begun, true)).toBe("nothing.full");
    expect(fillLine(at("2026-12-06T07:00:00Z", []), false)).toBe(
      "nothing.full",
    );
  });

  it("says nobody sent availability, and to place people by hand once nobody can", () => {
    expect(fillLine(fillOf(morning, []), true)).toBe("nothing.noAnswers");
    expect(fillLine(fillOf(morning, []), false)).toBe(
      "nothing.noAnswersRunning",
    );
  });

  it("leaves it to each shift to say why once anyone sent availability", () => {
    const part = answer("noa", [day(0), "12:00", "16:00"]);
    expect(fillLine(fillOf(morning, [part]), true)).toBe("nothing.none");
    expect(fillLine(fillOf(morning, [part]), false)).toBe("nothing.none");
  });
});

describe("fillDays", () => {
  it("groups the shifts with an open place by day, in the fill's order", () => {
    const screen = [
      shift(day(0), "09:00", "16:00"),
      shift(day(0), "16:00", "23:00"),
      shift(day(1), "09:00", "16:00", ["maya"]),
      shift(day(3), "16:00", "23:00"),
    ];
    const fill = fillOf(screen, []);
    expect(
      fillDays(fill).map((d) => [d.date, d.shifts.map((s) => s.index)]),
    ).toEqual([
      [day(0), [0, 1]],
      // Monday's morning is full: no group for Monday.
      [day(3), [3]],
    ]);
  });

  it("has no days when nothing was open", () => {
    expect(fillDays({ week: [], shifts: [] })).toEqual([]);
  });
});
