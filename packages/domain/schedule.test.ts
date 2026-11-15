import { describe, expect, it } from "vitest";
import {
  availableFor,
  coverageOf,
  doubleBooked,
  draftWeek,
  overlappingShift,
  positionCounts,
  rangesOn,
  type ScheduledShift,
  scheduleGaps,
  scheduleOpening,
  shiftCandidates,
  shiftCoverage,
  shiftDetailsProblem,
  shiftMinutes,
  shiftSlot,
  shiftStarted,
  shiftsByDay,
  shiftsOf,
  stillNeeded,
  weekSchedule,
  withKnownPositions,
} from "./schedule";
import { ISRAEL_TIME_ZONE } from "./shabbat";

// 1 November 2026 is a Sunday.
const WEEK = "2026-11-01";
const dana = "65000000-0000-4000-a000-00000000000c";
const avi = "65000000-0000-4000-a000-00000000000d";

const morning = {
  day: "2026-11-01",
  name: "Morning",
  start: "07:00",
  end: "15:00",
  needed: 2,
};

const issues = (input: unknown, positions: string[] = ["waiter", "cook"]) => {
  const result = weekSchedule(WEEK, positions).safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => i.message);
};

describe("weekSchedule", () => {
  it("takes a week of shifts and fills the defaults", () => {
    expect(
      weekSchedule(WEEK, ["waiter"]).parse([
        {
          ...morning,
          name: " Morning ",
          assignees: [{ user: dana, position: "waiter" }, { user: avi }],
        },
      ]),
    ).toEqual([
      {
        ...morning,
        pattern: null,
        assignees: [
          { user: dana, position: "waiter" },
          { user: avi, position: null },
        ],
      },
    ]);
    expect(issues([])).toEqual([]);
  });

  it("keeps shifts inside the week", () => {
    expect(issues([{ ...morning, day: "2026-11-08" }])).toEqual([
      "Outside the week",
    ]);
    expect(issues([{ ...morning, day: "2026-10-31" }])).toEqual([
      "Outside the week",
    ]);
    expect(issues([{ ...morning, day: "2026-11-07" }])).toEqual([]);
  });

  it("refuses an empty name, equal times and nobody needed", () => {
    expect(issues([{ ...morning, name: "  " }])).toHaveLength(1);
    expect(issues([{ ...morning, end: "07:00" }])).toEqual([
      "Start and end must differ",
    ]);
    expect(issues([{ ...morning, needed: 0 }])).toHaveLength(1);
    expect(issues([{ ...morning, start: "7am" }])).toHaveLength(1);
  });

  it("puts each person on a shift once, in a position the business has", () => {
    expect(
      issues([{ ...morning, assignees: [{ user: dana }, { user: dana }] }]),
    ).toEqual(["On the shift twice"]);
    expect(
      issues([{ ...morning, assignees: [{ user: dana, position: "pilot" }] }]),
    ).toEqual(["Unknown position"]);
    expect(
      issues([{ ...morning, assignees: [{ user: "dana" }] }]),
    ).toHaveLength(1);
  });

  it("never puts one person on two shifts at once, across midnight too", () => {
    const evening = {
      ...morning,
      name: "Evening",
      start: "15:00",
      end: "01:00",
    };
    // Back to back is fine.
    expect(
      issues([
        { ...morning, assignees: [{ user: dana }] },
        { ...evening, assignees: [{ user: dana }] },
      ]),
    ).toEqual([]);
    expect(
      issues([
        { ...morning, assignees: [{ user: dana }] },
        {
          ...morning,
          name: "Brunch",
          start: "11:00",
          end: "16:00",
          assignees: [{ user: dana }],
        },
      ]),
    ).toEqual(["Works another shift at the same time"]);
    // Sunday's evening runs to 01:00 Monday; Monday 00:30 overlaps it.
    expect(
      issues([
        { ...evening, assignees: [{ user: dana }] },
        {
          ...morning,
          day: "2026-11-02",
          start: "00:30",
          end: "06:00",
          assignees: [{ user: dana }],
        },
      ]),
    ).toEqual(["Works another shift at the same time"]);
    // Someone else may work at the same time.
    expect(
      issues([
        { ...morning, assignees: [{ user: dana }] },
        { ...morning, name: "Brunch", assignees: [{ user: avi }] },
      ]),
    ).toEqual([]);
  });
});

describe("draftWeek", () => {
  const patterns = [
    {
      key: "evening",
      name: "Evening",
      days: [0, 5],
      start: "16:00",
      end: "23:00",
      needed: 3,
    },
    {
      key: "morning",
      name: "Morning",
      days: [0, 1],
      start: "08:00",
      end: "16:00",
      needed: 2,
    },
  ];

  it("lays out every shift on the days it runs, earliest first", () => {
    expect(
      draftWeek(WEEK, patterns).map((s) => `${s.day} ${s.pattern} ${s.needed}`),
    ).toEqual([
      "2026-11-01 morning 2",
      "2026-11-01 evening 3",
      "2026-11-02 morning 2",
      "2026-11-06 evening 3",
    ]);
  });

  it("follows the week's own first day", () => {
    // A Monday week: Sunday is its last day.
    expect(draftWeek("2026-11-02", patterns).map((s) => s.day)).toEqual([
      "2026-11-02",
      "2026-11-06",
      "2026-11-08",
      "2026-11-08",
    ]);
  });

  it("starts with nobody on a shift and passes its own rules", () => {
    const draft = draftWeek(WEEK, patterns);
    expect(draft.every((shift) => shift.assignees.length === 0)).toBe(true);
    expect(issues(draft)).toEqual([]);
    expect(draftWeek(WEEK, [])).toEqual([]);
  });
});

describe("gaps", () => {
  const shift = (needed: number, people: number): ScheduledShift => ({
    ...morning,
    needed,
    pattern: null,
    assignees: Array.from({ length: people }, (_, i) => ({
      user: `65000000-0000-4000-a000-00000000000${i}`,
      position: null,
    })),
  });

  it("counts the people a shift still needs, never below zero", () => {
    expect(stillNeeded(shift(3, 1))).toBe(2);
    expect(stillNeeded(shift(2, 2))).toBe(0);
    expect(stillNeeded(shift(1, 3))).toBe(0);
  });

  it("lists the short shifts and the people missing in all", () => {
    const short = shift(3, 1);
    const alsoShort = shift(2, 1);
    const gaps = scheduleGaps([short, shift(2, 2), alsoShort, shift(1, 2)]);
    expect(gaps.shifts).toEqual([short, alsoShort]);
    expect(gaps.people).toBe(3);
    expect(scheduleGaps([])).toEqual({ shifts: [], people: 0 });
  });
});

describe("availableFor", () => {
  const at = (day: string, start: string, end: string) => ({ day, start, end });

  it("needs a range on the day that covers the whole shift", () => {
    expect(availableFor(morning, [at("2026-11-01", "06:00", "16:00")])).toBe(
      true,
    );
    expect(availableFor(morning, [at("2026-11-01", "07:00", "15:00")])).toBe(
      true,
    );
    expect(availableFor(morning, [at("2026-11-01", "08:00", "16:00")])).toBe(
      false,
    );
    expect(availableFor(morning, [at("2026-11-01", "06:00", "14:00")])).toBe(
      false,
    );
    expect(availableFor(morning, [at("2026-11-02", "00:00", "23:59")])).toBe(
      false,
    );
    expect(availableFor(morning, [])).toBe(false);
  });

  it("joins ranges that touch or overlap, but not across a gap", () => {
    expect(
      availableFor(morning, [
        at("2026-11-01", "11:00", "15:00"),
        at("2026-11-01", "07:00", "11:00"),
      ]),
    ).toBe(true);
    expect(
      availableFor(morning, [
        at("2026-11-01", "06:00", "12:00"),
        at("2026-11-01", "10:00", "15:30"),
      ]),
    ).toBe(true);
    expect(
      availableFor(morning, [
        at("2026-11-01", "07:00", "11:00"),
        at("2026-11-01", "11:30", "15:00"),
      ]),
    ).toBe(false);
  });

  it("handles shifts and ranges that run past midnight", () => {
    const late = { day: "2026-11-01", start: "18:00", end: "01:00" };
    expect(availableFor(late, [at("2026-11-01", "17:00", "02:00")])).toBe(true);
    expect(availableFor(late, [at("2026-11-01", "17:00", "00:00")])).toBe(
      false,
    );
    expect(availableFor(morning, [at("2026-11-01", "05:00", "04:00")])).toBe(
      true,
    );
  });
});

describe("shiftCandidates", () => {
  const team = [
    { userId: "noa" },
    { userId: "yoav" },
    { userId: "maya" },
    { userId: "itay" },
    { userId: "omer" },
  ];
  const sunday = (start: string, end: string, assignees: string[] = []) => ({
    day: "2026-11-01",
    start,
    end,
    assignees: assignees.map((user) => ({ user, position: null })),
  });
  const answers = [
    {
      userId: "noa",
      ranges: [{ day: "2026-11-01", start: "09:00", end: "17:00" }],
    },
    {
      userId: "yoav",
      ranges: [{ day: "2026-11-02", start: "09:00", end: "17:00" }],
    },
    { userId: "maya", ranges: [] },
    {
      userId: "itay",
      ranges: [{ day: "2026-11-01", start: "08:00", end: "23:59" }],
    },
  ];
  const states = (shifts: ReturnType<typeof sunday>[], index: number) =>
    shiftCandidates(WEEK, shifts, index, team, answers).map(
      (c) => `${c.member.userId}:${c.state}`,
    );

  it("puts the available first, then no answer, then not available", () => {
    expect(states([sunday("09:00", "16:00")], 0)).toEqual([
      "noa:available",
      "itay:available",
      "omer:noAnswer",
      "yoav:unavailable",
      "maya:unavailable",
    ]);
  });

  it("marks people already on the shift and on an overlapping one", () => {
    const shifts = [
      sunday("09:00", "16:00", ["noa"]),
      sunday("15:00", "23:00", ["itay"]),
      sunday("16:00", "23:30"),
    ];
    expect(states(shifts, 0)).toEqual([
      "omer:noAnswer",
      "yoav:unavailable",
      "maya:unavailable",
      "itay:busy",
      "noa:assigned",
    ]);
    // Back to back is not overlapping; Noa's availability ends at 17:00.
    expect(states(shifts, 2)).toEqual([
      "omer:noAnswer",
      "noa:unavailable",
      "yoav:unavailable",
      "maya:unavailable",
      "itay:busy",
    ]);
  });

  it("counts a night shift against the next morning", () => {
    const shifts = [
      { ...sunday("20:00", "02:00", ["omer"]) },
      { day: "2026-11-02", start: "01:00", end: "08:00", assignees: [] },
    ];
    expect(
      shiftCandidates(WEEK, shifts, 1, team, answers).find(
        (c) => c.member.userId === "omer",
      )?.state,
    ).toBe("busy");
  });

  it("gives nothing for a shift that is not there", () => {
    expect(shiftCandidates(WEEK, [], 0, team, answers)).toEqual([]);
  });
});

describe("overlappingShift", () => {
  const shift = (
    day: string,
    start: string,
    end: string,
    people: string[] = [],
  ) => ({
    day,
    start,
    end,
    assignees: people.map((user) => ({ user, position: null })),
  });

  it("finds the other shift someone works at the same time", () => {
    const shifts = [
      shift("2026-11-01", "09:00", "16:00"),
      shift("2026-11-01", "15:00", "23:00", ["noa"]),
    ];
    expect(overlappingShift(WEEK, shifts, 0, "noa")).toBe(shifts[1]);
  });

  it("leaves out back to back shifts and the shift itself", () => {
    const shifts = [
      shift("2026-11-01", "09:00", "16:00", ["noa"]),
      shift("2026-11-01", "16:00", "23:00", ["noa"]),
    ];
    expect(overlappingShift(WEEK, shifts, 0, "noa")).toBeNull();
    expect(overlappingShift(WEEK, shifts, 1, "omer")).toBeNull();
  });

  it("counts a night shift against the next morning", () => {
    const shifts = [
      shift("2026-11-01", "20:00", "02:00", ["omer"]),
      shift("2026-11-02", "01:00", "08:00"),
    ];
    expect(overlappingShift(WEEK, shifts, 1, "omer")).toBe(shifts[0]);
  });

  it("gives nothing for a shift that is not there", () => {
    expect(overlappingShift(WEEK, [], 0, "noa")).toBeNull();
  });
});

describe("shiftCoverage", () => {
  const shift = (needed: number, people: number) => ({
    needed,
    assignees: Array.from({ length: people }, (_, i) => ({
      user: String(i),
      position: null,
    })),
  });

  it("adds up the people placed and the people needed", () => {
    expect(shiftCoverage([shift(3, 2), shift(4, 3)])).toEqual({
      filled: 5,
      needed: 7,
    });
  });

  it("does not let a full shift hide a gap in another", () => {
    expect(shiftCoverage([shift(2, 5), shift(2, 0)])).toEqual({
      filled: 2,
      needed: 4,
    });
  });

  it("is empty for no shifts", () => {
    expect(shiftCoverage([])).toEqual({ filled: 0, needed: 0 });
  });
});

describe("rangesOn", () => {
  it("keeps one day's ranges, earliest first", () => {
    expect(
      rangesOn(
        [
          { day: "2026-11-02", start: "18:00", end: "23:00" },
          { day: "2026-11-01", start: "09:00", end: "17:00" },
          { day: "2026-11-02", start: "08:00", end: "12:00" },
        ],
        "2026-11-02",
      ),
    ).toEqual([
      { day: "2026-11-02", start: "08:00", end: "12:00" },
      { day: "2026-11-02", start: "18:00", end: "23:00" },
    ]);
  });
});

describe("doubleBooked", () => {
  const shift = (
    day: string,
    start: string,
    end: string,
    people: string[],
  ) => ({
    day,
    start,
    end,
    assignees: people.map((user) => ({ user, position: null })),
  });

  it("lists both shifts of a person working two at once", () => {
    const shifts = [
      shift("2026-11-01", "09:00", "16:00", [dana, avi]),
      shift("2026-11-01", "15:00", "23:00", [dana]),
      shift("2026-11-01", "16:00", "23:00", [avi]),
    ];
    expect([...doubleBooked(WEEK, shifts)].sort()).toEqual(
      [`0:${dana}`, `1:${dana}`].sort(),
    );
  });

  it("counts a night shift against the next morning", () => {
    const shifts = [
      shift("2026-11-01", "18:00", "02:00", [dana]),
      shift("2026-11-02", "01:00", "09:00", [dana]),
      shift("2026-11-02", "02:00", "09:00", [avi]),
    ];
    expect(doubleBooked(WEEK, shifts).size).toBe(2);
    expect(doubleBooked(WEEK, shifts.slice(1)).size).toBe(0);
  });

  it("agrees with the save check", () => {
    const shifts = [
      { ...morning, assignees: [{ user: dana, position: null }] },
      {
        ...morning,
        name: "Late",
        start: "14:00",
        end: "22:00",
        assignees: [{ user: dana, position: null }],
      },
    ];
    expect(doubleBooked(WEEK, shifts).size).toBe(2);
    expect(issues(shifts)).toEqual(["Works another shift at the same time"]);
  });
});

describe("shiftDetailsProblem", () => {
  const ok = { name: "ערב", start: "17:00", end: "23:00", needed: 3 };

  it("accepts a complete shift, also past midnight", () => {
    expect(shiftDetailsProblem(ok)).toBeNull();
    expect(shiftDetailsProblem({ ...ok, end: "01:00" })).toBeNull();
  });

  it("names the first field that is wrong", () => {
    expect(shiftDetailsProblem({ ...ok, name: "  " })).toBe("name");
    expect(shiftDetailsProblem({ ...ok, name: "א".repeat(41) })).toBe("name");
    expect(shiftDetailsProblem({ ...ok, start: "" })).toBe("time");
    expect(shiftDetailsProblem({ ...ok, end: "25:00" })).toBe("time");
    expect(shiftDetailsProblem({ ...ok, end: "17:00" })).toBe("same");
    expect(shiftDetailsProblem({ ...ok, needed: 0 })).toBe("needed");
    expect(shiftDetailsProblem({ ...ok, needed: 51 })).toBe("needed");
    expect(shiftDetailsProblem({ ...ok, needed: 1.5 })).toBe("needed");
    expect(shiftDetailsProblem({ ...ok, needed: Number.NaN })).toBe("needed");
  });

  it("lets through only what the save check accepts", () => {
    const shift = { ...ok, day: WEEK };
    expect(issues([shift])).toEqual([]);
    expect(issues([{ ...shift, end: "17:00" }])).not.toEqual([]);
  });
});

describe("shiftSlot", () => {
  const week = [
    { day: "2026-11-01", start: "09:00" },
    { day: "2026-11-01", start: "17:00" },
    { day: "2026-11-03", start: "09:00" },
  ];

  it("keeps the week day by day and earliest first", () => {
    expect(shiftSlot(week, { day: "2026-11-01", start: "07:00" })).toBe(0);
    expect(shiftSlot(week, { day: "2026-11-01", start: "12:00" })).toBe(1);
    expect(shiftSlot(week, { day: "2026-11-01", start: "17:00" })).toBe(2);
    expect(shiftSlot(week, { day: "2026-11-02", start: "23:00" })).toBe(2);
    expect(shiftSlot(week, { day: "2026-11-07", start: "08:00" })).toBe(3);
    expect(shiftSlot([], { day: "2026-11-07", start: "08:00" })).toBe(0);
  });
});

describe("positions on a shift", () => {
  const positions = [
    { key: "waiter", name: "Waiter" },
    { key: "bartender", name: "Bartender" },
    { key: "cook", name: "Cook" },
  ];
  const carmel = "65000000-0000-4000-a000-00000000000e";
  const shift: ScheduledShift = {
    ...morning,
    needed: 3,
    pattern: null,
    assignees: [
      { user: dana, position: "cook" },
      { user: avi, position: null },
      { user: carmel, position: "waiter" },
    ],
  };

  it("counts people per position in the business's order", () => {
    expect(
      positionCounts(
        {
          assignees: [...shift.assignees, { user: "x", position: "waiter" }],
        },
        positions,
      ).map(({ position, count }) => [position.key, count]),
    ).toEqual([
      ["waiter", 2],
      ["cook", 1],
    ]);
    expect(positionCounts({ assignees: [] }, positions)).toEqual([]);
    expect(positionCounts(shift, [])).toEqual([]);
  });

  it("takes removed positions off people and keeps the rest", () => {
    const [kept] = withKnownPositions([shift], ["waiter"]);
    expect(kept?.assignees).toEqual([
      { user: dana, position: null },
      { user: avi, position: null },
      { user: carmel, position: "waiter" },
    ]);
    expect(withKnownPositions([shift], ["waiter", "cook"])).toEqual([shift]);
    // What comes out passes the save check with the same positions.
    expect(
      issues(withKnownPositions([{ ...shift, day: WEEK }], ["waiter"]), [
        "waiter",
      ]),
    ).toEqual([]);
    expect(issues([shift], ["waiter"])).toEqual(["Unknown position"]);
  });
});

describe("shiftsOf", () => {
  const evening = {
    ...morning,
    name: "Evening",
    start: "16:00",
    end: "23:30",
    pattern: null,
    assignees: [{ user: dana, position: "waiter" }],
  };
  const monday = {
    ...morning,
    day: "2026-11-02",
    pattern: null,
    assignees: [
      { user: avi, position: null },
      { user: dana, position: null },
    ],
  };
  const sunday = {
    ...morning,
    pattern: null,
    assignees: [{ user: avi, position: "cook" }],
  };

  it("lists the person's shifts with their position, in order", () => {
    expect(shiftsOf([sunday, evening, monday], dana)).toEqual([
      { shift: evening, position: "waiter" },
      { shift: monday, position: null },
    ]);
    expect(shiftsOf([sunday, evening, monday], avi)).toEqual([
      { shift: sunday, position: "cook" },
      { shift: monday, position: null },
    ]);
  });

  it("leaves out the days before `from`", () => {
    expect(shiftsOf([sunday, evening, monday], dana, "2026-11-02")).toEqual([
      { shift: monday, position: null },
    ]);
    expect(
      shiftsOf([sunday, evening, monday], dana, "2026-11-01"),
    ).toHaveLength(2);
  });

  it("is empty for someone on no shift", () => {
    expect(shiftsOf([sunday], "65000000-0000-4000-a000-00000000000e")).toEqual(
      [],
    );
  });
});

describe("shiftStarted", () => {
  const zone = ISRAEL_TIME_ZONE;
  const at = (iso: string) => new Date(iso);
  const started = (day: string, start: string, now: string) =>
    shiftStarted({ day, start }, at(now), zone);

  it("begins at its start, later the same day included", () => {
    // Sunday 15 November 2026, winter time (UTC+2): 09:00 is 07:00 UTC.
    expect(started("2026-11-15", "09:00", "2026-11-15T06:59:00.000Z")).toBe(
      false,
    );
    expect(started("2026-11-15", "09:00", "2026-11-15T07:00:00.000Z")).toBe(
      true,
    );
    // The day is still today, but the shift is on.
    expect(started("2026-11-15", "09:00", "2026-11-15T10:00:00.000Z")).toBe(
      true,
    );
  });

  // Summer time starts on Friday 27 March 2026: 02:00 becomes 03:00, at
  // 00:00 UTC. Postgres's `(day + start) at time zone 'Asia/Jerusalem'`
  // reads an hour that does not exist with the offset before the change.
  it("reads a start the clocks skip as the database does", () => {
    // 02:30 is 00:30 UTC, the moment the clocks show 03:30.
    expect(started("2026-03-27", "02:30", "2026-03-27T00:29:00.000Z")).toBe(
      false,
    );
    expect(started("2026-03-27", "02:30", "2026-03-27T00:30:00.000Z")).toBe(
      true,
    );
    // 02:00 and 03:00 are the same moment.
    expect(started("2026-03-27", "02:00", "2026-03-27T00:00:00.000Z")).toBe(
      true,
    );
    expect(started("2026-03-27", "03:00", "2026-03-26T23:59:00.000Z")).toBe(
      false,
    );
    expect(started("2026-03-27", "03:00", "2026-03-27T00:00:00.000Z")).toBe(
      true,
    );
    // Before the change, winter time: 01:30 is 23:30 UTC the day before.
    expect(started("2026-03-27", "01:30", "2026-03-26T23:30:00.000Z")).toBe(
      true,
    );
  });

  // Summer time ends on Sunday 25 October 2026: 02:00 goes back to 01:00, at
  // 23:00 UTC the day before, so 01:00–01:59 happen twice. Postgres reads
  // them with the offset after the change: the second time.
  it("reads a start the clocks repeat the second time, as the database does", () => {
    // 01:30 is 23:30 UTC. At the first 01:45 (22:45 UTC, summer time) the
    // wall clock is past it, but the shift has not begun yet.
    expect(started("2026-10-25", "01:30", "2026-10-24T22:45:00.000Z")).toBe(
      false,
    );
    expect(started("2026-10-25", "01:30", "2026-10-24T23:29:00.000Z")).toBe(
      false,
    );
    expect(started("2026-10-25", "01:30", "2026-10-24T23:30:00.000Z")).toBe(
      true,
    );
    // Before the change, summer time: 00:30 is 21:30 UTC.
    expect(started("2026-10-25", "00:30", "2026-10-24T21:30:00.000Z")).toBe(
      true,
    );
    // After it, winter time: 02:30 is 00:30 UTC.
    expect(started("2026-10-25", "02:30", "2026-10-25T00:29:00.000Z")).toBe(
      false,
    );
    expect(started("2026-10-25", "02:30", "2026-10-25T00:30:00.000Z")).toBe(
      true,
    );
  });

  it("counts a shift past midnight as begun from its start, on the next day too", () => {
    // Saturday 14 November 22:00 is 20:00 UTC; it runs until 06:00.
    expect(started("2026-11-14", "22:00", "2026-11-14T19:59:00.000Z")).toBe(
      false,
    );
    expect(started("2026-11-14", "22:00", "2026-11-14T20:00:00.000Z")).toBe(
      true,
    );
    // 03:00 on Sunday: still on, on the next day.
    expect(started("2026-11-14", "22:00", "2026-11-15T01:00:00.000Z")).toBe(
      true,
    );
    // 08:00 on Sunday: it ended, and has begun all the same.
    expect(started("2026-11-14", "22:00", "2026-11-15T06:00:00.000Z")).toBe(
      true,
    );
  });

  it("follows the business's time zone", () => {
    const shift = { day: "2026-11-15", start: "09:00" };
    const now = at("2026-11-15T08:00:00.000Z");
    expect(shiftStarted(shift, now, zone)).toBe(true);
    expect(shiftStarted(shift, now, "UTC")).toBe(false);
  });

  // Behind UTC the database reads the changes the same way: a skipped start
  // just after the change, a repeated one the second time.
  it("matches the database on the clock changes west of UTC", () => {
    const ny = (day: string, start: string, now: string) =>
      shiftStarted({ day, start }, at(now), "America/New_York");
    // 8 March 2026: 02:00 becomes 03:00 at 07:00 UTC, so a 02:00 start is
    // the moment the clocks show 03:00.
    expect(ny("2026-03-08", "02:00", "2026-03-08T06:59:00.000Z")).toBe(false);
    expect(ny("2026-03-08", "02:00", "2026-03-08T07:00:00.000Z")).toBe(true);
    expect(ny("2026-03-08", "02:30", "2026-03-08T07:29:00.000Z")).toBe(false);
    expect(ny("2026-03-08", "02:30", "2026-03-08T07:30:00.000Z")).toBe(true);
    // 1 November 2026: 02:00 goes back to 01:00 at 06:00 UTC. A 01:30 start
    // is the second 01:30, in standard time.
    expect(ny("2026-11-01", "01:30", "2026-11-01T05:30:00.000Z")).toBe(false);
    expect(ny("2026-11-01", "01:30", "2026-11-01T06:29:00.000Z")).toBe(false);
    expect(ny("2026-11-01", "01:30", "2026-11-01T06:30:00.000Z")).toBe(true);
  });
});

describe("shiftMinutes", () => {
  it("adds up the shifts, a night past midnight included", () => {
    expect(shiftMinutes([])).toBe(0);
    expect(
      shiftMinutes([
        { start: "09:00", end: "16:00" },
        { start: "16:00", end: "23:30" },
        { start: "22:00", end: "02:00" },
      ]),
    ).toBe(7 * 60 + 7.5 * 60 + 4 * 60);
  });
});

describe("coverageOf", () => {
  const person = (user: string) => ({ user, position: null });

  it("adds up the places taken and needed", () => {
    expect(coverageOf([])).toEqual({ have: 0, need: 0 });
    expect(
      coverageOf([
        { needed: 3, assignees: [person(dana), person(avi)] },
        { needed: 4, assignees: [] },
      ]),
    ).toEqual({ have: 2, need: 7 });
  });

  it("does not let an extra person on one shift hide a gap on another", () => {
    expect(
      coverageOf([
        { needed: 1, assignees: [person(dana), person(avi)] },
        { needed: 1, assignees: [] },
      ]),
    ).toEqual({ have: 1, need: 2 });
  });
});

describe("scheduleOpening", () => {
  const dates = (start: number) =>
    Array.from(
      { length: 7 },
      (_, i) => `2026-11-${String(start + i).padStart(2, "0")}`,
    );
  const onShift = (day: string, user: string) => ({
    day,
    assignees: [{ user, position: null }],
  });
  const base = {
    today: "2026-11-03",
    userId: dana,
    manager: false,
    thisWeek: { dates: dates(1), shifts: [] as ReturnType<typeof onShift>[] },
    nextWeek: { dates: dates(8), shifts: [] as ReturnType<typeof onShift>[] },
  };

  it("opens a worker on their next shift", () => {
    expect(
      scheduleOpening({
        ...base,
        thisWeek: {
          dates: dates(1),
          shifts: [
            onShift("2026-11-02", dana),
            onShift("2026-11-04", avi),
            onShift("2026-11-05", dana),
          ],
        },
      }),
    ).toEqual({ week: "this", day: "2026-11-05" });
  });

  it("opens a worker on next week when their next shift is there", () => {
    expect(
      scheduleOpening({
        ...base,
        thisWeek: { dates: dates(1), shifts: [onShift("2026-11-04", avi)] },
        nextWeek: { dates: dates(8), shifts: [onShift("2026-11-09", dana)] },
      }),
    ).toEqual({ week: "next", day: "2026-11-09" });
  });

  it("opens on today without a shift of their own", () => {
    expect(
      scheduleOpening({
        ...base,
        thisWeek: { dates: dates(1), shifts: [onShift("2026-11-04", avi)] },
        nextWeek: { dates: dates(8), shifts: [onShift("2026-11-09", avi)] },
      }),
    ).toEqual({ week: "this", day: "2026-11-03" });
  });

  it("opens a manager on today, even with a shift of their own", () => {
    expect(
      scheduleOpening({
        ...base,
        manager: true,
        thisWeek: { dates: dates(1), shifts: [onShift("2026-11-05", dana)] },
      }),
    ).toEqual({ week: "this", day: "2026-11-03" });
  });

  it("moves to next week when this week has nothing to show", () => {
    expect(
      scheduleOpening({
        ...base,
        manager: true,
        nextWeek: { dates: dates(8), shifts: [onShift("2026-11-08", avi)] },
      }),
    ).toEqual({ week: "next", day: "2026-11-08" });
  });

  it("stays on today when neither week has anything", () => {
    expect(scheduleOpening(base)).toEqual({ week: "this", day: "2026-11-03" });
  });
});

describe("shiftsByDay", () => {
  it("puts every date of the week in order, shifts earliest first", () => {
    const late = { day: "2026-11-01", start: "16:00", name: "Evening" };
    const early = { day: "2026-11-01", start: "07:00", name: "Morning" };
    const alsoEarly = { day: "2026-11-01", start: "07:00", name: "Bar" };
    const tuesday = { day: "2026-11-03", start: "09:00", name: "Morning" };
    const days = shiftsByDay(
      ["2026-11-01", "2026-11-02", "2026-11-03"],
      [late, tuesday, early, alsoEarly],
    );
    expect(days).toEqual([
      { day: "2026-11-01", shifts: [alsoEarly, early, late] },
      { day: "2026-11-02", shifts: [] },
      { day: "2026-11-03", shifts: [tuesday] },
    ]);
  });

  it("leaves out shifts outside the dates", () => {
    expect(
      shiftsByDay(
        ["2026-11-02"],
        [{ day: "2026-11-01", start: "07:00", name: "x" }],
      ),
    ).toEqual([{ day: "2026-11-02", shifts: [] }]);
  });
});
