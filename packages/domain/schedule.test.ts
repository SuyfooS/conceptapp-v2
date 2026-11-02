import { describe, expect, it } from "vitest";
import {
  availableFor,
  doubleBooked,
  draftWeek,
  positionCounts,
  type ScheduledShift,
  scheduleGaps,
  shiftCandidates,
  shiftDetailsProblem,
  shiftSlot,
  stillNeeded,
  weekSchedule,
  withKnownPositions,
} from "./schedule";

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
