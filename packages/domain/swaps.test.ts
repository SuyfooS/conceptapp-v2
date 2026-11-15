import { describe, expect, it } from "vitest";
import type { ScheduledShift } from "./schedule";
import { ISRAEL_TIME_ZONE } from "./shabbat";
import {
  approvalsFor,
  myRequestFor,
  offersFor,
  type ShiftSwap,
  shiftsOverlap,
  swapFailureOf,
  swapsEndedBy,
  toApprove,
} from "./swaps";

const shift = (
  id: string,
  day: string,
  start: string,
  end: string,
  users: string[],
) => ({
  id,
  day,
  start,
  end,
  name: id,
  assignees: users.map((user) => ({ user, position: null })),
});

const swap = (
  id: string,
  shiftId: string,
  requestedBy: string,
  takenBy: string | null = null,
): ShiftSwap => ({
  id,
  shiftId,
  requestedBy,
  takenBy,
  status: takenBy ? "taken" : "open",
});

describe("shiftsOverlap", () => {
  it("compares hours on the same day", () => {
    expect(
      shiftsOverlap(
        { day: "2026-11-08", start: "07:00", end: "15:00" },
        { day: "2026-11-08", start: "14:00", end: "22:00" },
      ),
    ).toBe(true);
    expect(
      shiftsOverlap(
        { day: "2026-11-08", start: "07:00", end: "15:00" },
        { day: "2026-11-08", start: "15:00", end: "22:00" },
      ),
    ).toBe(false);
  });

  it("counts a night shift into the next day, also across weeks", () => {
    expect(
      shiftsOverlap(
        { day: "2026-11-14", start: "20:00", end: "02:00" },
        { day: "2026-11-15", start: "01:00", end: "09:00" },
      ),
    ).toBe(true);
    expect(
      shiftsOverlap(
        { day: "2026-11-14", start: "20:00", end: "02:00" },
        { day: "2026-11-15", start: "02:00", end: "09:00" },
      ),
    ).toBe(false);
  });
});

describe("myRequestFor", () => {
  it("finds the person's own live request for a shift", () => {
    const swaps = [swap("1", "s1", "noa"), swap("2", "s2", "yoav")];
    expect(myRequestFor(swaps, "s1", "noa")?.id).toBe("1");
    expect(myRequestFor(swaps, "s2", "noa")).toBeNull();
    expect(myRequestFor(swaps, "s1", "yoav")).toBeNull();
  });
});

describe("offersFor", () => {
  const shifts = [
    shift("sun-morning", "2026-11-08", "07:00", "15:00", ["noa"]),
    shift("sun-middle", "2026-11-08", "11:00", "19:00", ["yoav"]),
    shift("sun-evening", "2026-11-08", "16:00", "23:00", ["maya", "omer"]),
    shift("mon-morning", "2026-11-09", "07:00", "15:00", ["itay"]),
    shift("old", "2026-11-07", "07:00", "15:00", ["itay"]),
  ];
  // Sunday 8 November, 00:00 in Israel (winter time, UTC+2).
  const SUNDAY = new Date("2026-11-07T22:00:00.000Z");

  it("lists others' open requests, busy when at the same time, day by day", () => {
    const offers = offersFor(
      [
        swap("a", "mon-morning", "itay"),
        swap("b", "sun-middle", "yoav"),
        swap("c", "sun-evening", "maya"),
      ],
      shifts,
      "noa",
      SUNDAY,
      ISRAEL_TIME_ZONE,
    );
    expect(offers.map((o) => [o.swap.id, o.state])).toEqual([
      ["b", "busy"],
      ["c", "available"],
      ["a", "available"],
    ]);
  });

  it("leaves out own requests, shifts the person is on and past days", () => {
    const offers = offersFor(
      [
        swap("own", "sun-morning", "noa"),
        swap("on-it", "sun-evening", "maya"),
        swap("past", "old", "itay"),
      ],
      shifts,
      "omer",
      SUNDAY,
      ISRAEL_TIME_ZONE,
    );
    expect(offers.map((o) => o.swap.id)).toEqual(["own"]);
    expect(
      offersFor(
        [swap("own", "sun-morning", "noa")],
        shifts,
        "noa",
        SUNDAY,
        ISRAEL_TIME_ZONE,
      ),
    ).toEqual([]);
    expect(
      offersFor(
        [swap("past", "old", "itay")],
        shifts,
        "noa",
        SUNDAY,
        ISRAEL_TIME_ZONE,
      ),
    ).toEqual([]);
  });

  it("leaves out a shift that has begun, from its start on", () => {
    // Itay can take Yoav's middle shift, and took Maya's evening.
    const swaps = [
      swap("middle", "sun-middle", "yoav"),
      swap("evening", "sun-evening", "maya", "itay"),
    ];
    const read = (now: Date) =>
      offersFor(swaps, shifts, "itay", now, ISRAEL_TIME_ZONE).map((o) => [
        o.swap.id,
        o.state,
      ]);
    // 10:59 in Israel: both are still to come.
    expect(read(new Date("2026-11-08T08:59:00.000Z"))).toEqual([
      ["middle", "available"],
      ["evening", "takenByYou"],
    ]);
    // 11:00: the middle shift starts, so it is no longer offered.
    expect(read(new Date("2026-11-08T09:00:00.000Z"))).toEqual([
      ["evening", "takenByYou"],
    ]);
    // 16:00: neither, though the day is still Sunday.
    expect(read(new Date("2026-11-08T14:00:00.000Z"))).toEqual([]);
  });

  it("counts the person's own shift on now as busy", () => {
    const afternoon = shift("sun-afternoon", "2026-11-08", "14:00", "20:00", [
      "yoav",
    ]);
    // 12:00 in Israel: Noa's morning, until 15:00, is on.
    const offers = offersFor(
      [swap("p", "sun-afternoon", "yoav")],
      [...shifts, afternoon],
      "noa",
      new Date("2026-11-08T10:00:00.000Z"),
      ISRAEL_TIME_ZONE,
    );
    expect(offers.map((o) => o.state)).toEqual(["busy"]);
  });

  it("shows a taken request only to the person who took it", () => {
    const swaps = [swap("t", "mon-morning", "itay", "noa")];
    expect(
      offersFor(swaps, shifts, "noa", SUNDAY, ISRAEL_TIME_ZONE).map(
        (o) => o.state,
      ),
    ).toEqual(["takenByYou"]);
    expect(offersFor(swaps, shifts, "yoav", SUNDAY, ISRAEL_TIME_ZONE)).toEqual(
      [],
    );
  });

  it("skips requests for shifts it does not know", () => {
    expect(
      offersFor(
        [swap("x", "gone", "itay")],
        shifts,
        "noa",
        SUNDAY,
        ISRAEL_TIME_ZONE,
      ),
    ).toEqual([]);
  });
});

describe("swapFailureOf", () => {
  it("explains the database's refusals", () => {
    expect(swapFailureOf("55000", "The shift has already started")).toBe(
      "started",
    );
    expect(swapFailureOf("55000", "This request is no longer open")).toBe(
      "closed",
    );
    expect(swapFailureOf("22023")).toBe("busy");
    expect(swapFailureOf("23505")).toBe("already");
    expect(swapFailureOf("42501")).toBe("noAccess");
    expect(swapFailureOf("P0002")).toBe("noAccess");
    expect(swapFailureOf(undefined)).toBe("failed");
  });
});

describe("approvalsFor", () => {
  const shifts = [
    {
      ...shift("eve", "2026-11-08", "16:00", "23:00", []),
      assignees: [
        { user: "noa", position: "waiter" },
        { user: "itay", position: "cook" },
      ],
    },
    shift("morning", "2026-11-08", "08:00", "16:00", ["maya"]),
    shift("past", "2026-11-05", "08:00", "16:00", ["omer"]),
  ];
  // Friday 6 November, 12:00 in Israel (winter time, UTC+2).
  const FRIDAY = new Date("2026-11-06T10:00:00.000Z");
  const at = (now: Date) => (swaps: ShiftSwap[]) =>
    approvalsFor(swaps, shifts, now, ISRAEL_TIME_ZONE);

  it("lists taken requests by shift time, with the giver's position", () => {
    const swaps = [
      swap("1", "eve", "noa", "yoav"),
      swap("2", "morning", "maya", "shira"),
    ];
    expect(
      at(FRIDAY)(swaps).map((a) => [a.swap.id, a.position, a.started]),
    ).toEqual([
      ["2", null, false],
      ["1", "waiter", false],
    ]);
  });

  it("leaves out open requests, past days and unknown shifts", () => {
    const swaps = [
      swap("1", "eve", "noa"),
      swap("2", "past", "omer", "yoav"),
      swap("3", "gone", "maya", "yoav"),
    ];
    expect(at(FRIDAY)(swaps)).toEqual([]);
  });

  it("keeps a request whose giver has left the shift, with no position", () => {
    const [approval] = at(FRIDAY)([swap("1", "morning", "noa", "yoav")]);
    expect(approval?.position).toBeNull();
    expect(approval?.swap.takenBy).toBe("yoav");
  });

  it("marks a request whose shift has begun, which only a decline ends", () => {
    const swaps = [
      swap("1", "eve", "noa", "yoav"),
      swap("2", "morning", "maya", "shira"),
    ];
    const read = (now: Date) =>
      at(now)(swaps).map((a) => [a.swap.id, a.started]);
    // Sunday 8 November at 07:59 in Israel: both are still to come.
    expect(read(new Date("2026-11-08T05:59:00.000Z"))).toEqual([
      ["2", false],
      ["1", false],
    ]);
    // 08:00: the morning begins, so the database refuses approving it.
    expect(read(new Date("2026-11-08T06:00:00.000Z"))).toEqual([
      ["2", true],
      ["1", false],
    ]);
    // Only the evening is still to approve.
    expect(
      toApprove(at(new Date("2026-11-08T06:00:00.000Z"))(swaps)).map(
        (a) => a.swap.id,
      ),
    ).toEqual(["1"]);
    // Monday: the day is over, and neither is listed.
    expect(read(new Date("2026-11-08T22:00:00.000Z"))).toEqual([]);
  });
});

// The rule the database applies when a week is written
// (20261115000100_week_in_place.sql, Orel's answer 2), read off the screen for
// the warning before publishing. Each case is one of week_in_place.test.sql's,
// in its order and on its week: 3 on Sunday and Wednesday, 4 on Monday and
// Thursday (with 8), 5 on Tuesday and Friday. The database stays the
// authority; these keep the two equal.
describe("swapsEndedBy, as week_in_place.test.sql", () => {
  const day = (
    id: string,
    date: string,
    name: string,
    hours: [string, string],
    needed: number,
    users: string[],
  ): ScheduledShift => ({
    id,
    day: date,
    name,
    start: hours[0],
    end: hours[1],
    needed,
    pattern: null,
    assignees: users.map((user) => ({ user, position: null })),
  });
  const morning: [string, string] = ["07:00", "15:00"];
  // The week as a builder reads it (pg_temp.screen_of).
  const read: ScheduledShift[] = [
    {
      ...day("morning-22", "2026-11-22", "Morning", morning, 2, []),
      pattern: "morning",
      assignees: [{ user: "p3", position: "waiter" }],
    },
    day("morning-23", "2026-11-23", "Morning", morning, 2, ["p4"]),
    day("morning-24", "2026-11-24", "Morning", morning, 1, ["p5"]),
    day("evening-25", "2026-11-25", "Evening", ["16:00", "23:00"], 1, ["p3"]),
    day("morning-26", "2026-11-26", "Morning", morning, 2, ["p4", "p8"]),
    day("morning-27", "2026-11-27", "Morning", morning, 1, ["p5"]),
  ];
  const edit = (
    shifts: readonly ScheduledShift[],
    id: string,
    changes: Partial<ScheduledShift>,
  ) => shifts.map((s) => (s.id === id ? { ...s, ...changes } : s));
  const without = (shifts: readonly ScheduledShift[], id: string) =>
    shifts.filter((s) => s.id !== id);
  const people = (...users: string[]) =>
    users.map((user) => ({ user, position: null }));
  const ids = (swaps: readonly ShiftSwap[]) => swaps.map((s) => s.id);

  // 4 asks to give Monday away, 3 Wednesday, 4 Thursday: open. 5 asks to give
  // Tuesday away and 3 takes it; 5 Friday and 4 takes it.
  const waiting = [
    swap("s-mon", "morning-23", "p4"),
    swap("s-tue", "morning-24", "p5", "p3"),
    swap("s-wed", "evening-25", "p3"),
    swap("s-thu", "morning-26", "p4"),
    swap("s-fri", "morning-27", "p5", "p4"),
  ];

  it("ends nothing on an unchanged round trip", () => {
    expect(swapsEndedBy(read, read, waiting)).toEqual([]);
  });

  // Monday gets 3 as well; Tuesday starts at 08:00; Wednesday loses 3, who
  // asked; Friday gets 4, who took it, directly. Thursday is sent as it was
  // read, with 8 on it, though 8 has since been taken off the team.
  const four = edit(
    edit(
      edit(
        edit(read, "morning-23", { assignees: people("p4", "p3") }),
        "morning-24",
        { start: "08:00" },
      ),
      "evening-25",
      { assignees: [] },
    ),
    "morning-27",
    { needed: 2, assignees: people("p5", "p4") },
  );
  const ended = ids(swapsEndedBy(read, four, waiting));

  it("leaves the request on an untouched shift waiting", () => {
    expect(ended).not.toContain("s-thu");
  });

  it("ends the request on a shift with new hours", () => {
    expect(ended).toContain("s-tue");
  });

  it("ends the request of whoever asked, taken off the shift", () => {
    expect(ended).toContain("s-wed");
  });

  it("does not end a request whose taker was put on the shift directly: it opens again", () => {
    expect(ended).not.toContain("s-fri");
  });

  it("leaves a request waiting when someone else is put on the shift", () => {
    expect(ended).not.toContain("s-mon");
  });

  it("counts a change to a shift changed meanwhile as written, ending nothing that keeps its asker", () => {
    // Thursday sent with 3 needed, from the screen read before 8 came off it:
    // the database refuses it (40001 'moved'); were it written, 4 would
    // still be on it, so the request would wait on.
    expect(
      swapsEndedBy(read, edit(read, "morning-26", { needed: 3 }), waiting),
    ).toEqual([]);
  });

  it("names the requests it ends, and how many", () => {
    expect(ended).toEqual(["s-tue", "s-wed"]);
  });

  // The week as published then, read again: Monday's request still open,
  // Thursday's taken by 3 and about to be approved, Friday's open again.
  const published = four;
  const stillWaiting = [
    swap("s-mon", "morning-23", "p4"),
    swap("s-thu", "morning-26", "p4", "p3"),
    swap("s-fri", "morning-27", "p5"),
  ];

  it("ends nothing for a change to another shift, read before a swap was approved", () => {
    expect(
      swapsEndedBy(
        published,
        edit(published, "morning-22", { needed: 3 }),
        stillWaiting,
      ),
    ).toEqual([]);
  });

  it("ends nothing for a change to the shift whose swap was approved, which the database refuses", () => {
    // 40001 'moved', and the builder puts the shift back; written as the
    // screen read it, 4 would still be on it.
    expect(
      swapsEndedBy(
        published,
        edit(published, "morning-26", { needed: 3 }),
        stillWaiting,
      ),
    ).toEqual([]);
  });

  it("counts the request on a shift removed after its swap was approved, which the database refuses instead", () => {
    // The database answers 40001 'moved' and the builder puts the shift back;
    // read as the screen read it, its removal would end the request.
    expect(
      ids(
        swapsEndedBy(published, without(published, "morning-26"), stillWaiting),
      ),
    ).toEqual(["s-thu"]);
  });

  it("ends nothing on a shift added meanwhile, which stays", () => {
    // The owner adds Saturday; the manager's screen, read before, never saw
    // it. (The request on it is this test's own, not week_in_place's: one on
    // a shift the screen did not read is not this write's to end.)
    expect(
      swapsEndedBy(published, edit(published, "morning-23", { needed: 3 }), [
        ...stillWaiting,
        swap("s-sat", "morning-28", "p5"),
      ]),
    ).toEqual([]);
  });

  // The manager reads the week with Saturday, Monday needing 3 and 3 on
  // Thursday; the owner deletes Saturday. Monday's and Friday's requests are
  // still open.
  const withSaturday = [
    ...edit(edit(published, "morning-23", { needed: 3 }), "morning-26", {
      assignees: people("p3"),
    }),
    day("morning-28", "2026-11-28", "Morning", morning, 1, ["p5"]),
  ];
  const stillOpen = [
    swap("s-mon", "morning-23", "p4"),
    swap("s-fri", "morning-27", "p5"),
  ];

  it("ends nothing for a shift deleted meanwhile and sent as it was read, which is skipped", () => {
    expect(
      swapsEndedBy(
        withSaturday,
        edit(withSaturday, "morning-23", { needed: 2 }),
        stillOpen,
      ),
    ).toEqual([]);
  });

  it("ends nothing for a shift deleted meanwhile and sent changed, which the database refuses", () => {
    expect(
      swapsEndedBy(
        withSaturday,
        edit(withSaturday, "morning-28", { needed: 2 }),
        stillOpen,
      ),
    ).toEqual([]);
  });

  // 5 takes 4's Monday; then a new brunch puts 5 to work on Monday at the
  // same time.
  const brunch = day(
    "brunch-23",
    "2026-11-23",
    "Brunch",
    ["10:00", "12:00"],
    1,
    ["p5"],
  );

  it("does not end a request whose taker now works at the same time: it opens again", () => {
    const { id: _, ...added } = brunch;
    expect(
      swapsEndedBy(
        published,
        [...published, added],
        [swap("s-mon", "morning-23", "p4", "p5")],
      ),
    ).toEqual([]);
  });

  it("ends the request on a shift read and not sent, which is deleted", () => {
    // 5 asks to give the brunch away and the owner takes it; the manager then
    // publishes the week without it.
    const withBrunch = [...published, brunch];
    const onBrunch = swap("s-brunch", "brunch-23", "p5", "p1");
    expect(
      swapsEndedBy(withBrunch, without(withBrunch, "brunch-23"), [
        swap("s-mon", "morning-23", "p4"),
        onBrunch,
      ]),
    ).toEqual([onBrunch]);
  });

  it("ends every request still waiting when the week is replaced, with nothing read", () => {
    // 3 asks to give Sunday away too; the week is then published with no
    // basis, two new shifts in place of the six.
    const open = [
      swap("s-mon", "morning-23", "p4"),
      swap("s-fri", "morning-27", "p5"),
      swap("s-sun", "morning-22", "p3"),
    ];
    const replaced = [
      day("", "2026-11-22", "Morning", morning, 1, ["p3"]),
      day("", "2026-11-23", "Evening", ["16:00", "23:00"], 1, []),
    ].map(({ id: _, ...shift }) => shift);
    expect(swapsEndedBy(published, replaced, open, true)).toEqual(open);
  });
});

// The rest of the database's rule, as private.write_week_schedule reads it:
// only the day, the start, the end and whoever asked can end a request.
describe("swapsEndedBy", () => {
  const shift: ScheduledShift = {
    id: "evening",
    day: "2026-11-22",
    name: "Evening",
    start: "16:00",
    end: "23:00",
    needed: 2,
    pattern: "evening",
    assignees: [
      { user: "noa", position: "waiter" },
      { user: "yoav", position: null },
    ],
  };
  const asked = [swap("1", "evening", "noa")];
  const ends = (changes: Partial<ScheduledShift>) =>
    swapsEndedBy([shift], [{ ...shift, ...changes }], asked).length;

  it("ends a request when the shift moves to another day or ends at another time", () => {
    expect(ends({ day: "2026-11-23" })).toBe(1);
    expect(ends({ end: "23:30" })).toBe(1);
  });

  it("keeps it through a new name, people needed, pattern or position", () => {
    expect(ends({ name: "Late" })).toBe(0);
    expect(ends({ needed: 3 })).toBe(0);
    expect(ends({ pattern: null })).toBe(0);
    expect(
      ends({
        assignees: [
          { user: "noa", position: "bartender" },
          { user: "yoav", position: null },
        ],
      }),
    ).toBe(0);
    // Someone else taken off.
    expect(ends({ assignees: [{ user: "noa", position: "waiter" }] })).toBe(0);
  });

  it("reads a shift sent as it was read the same, in any order", () => {
    expect(
      ends({ name: " Evening ", assignees: [...shift.assignees].reverse() }),
    ).toBe(0);
  });

  it("leaves requests on other weeks alone", () => {
    expect(swapsEndedBy([shift], [], [swap("2", "next-week", "noa")])).toEqual(
      [],
    );
  });
});
