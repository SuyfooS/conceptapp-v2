import { describe, expect, it } from "vitest";
import {
  addMonths,
  attendanceOf,
  atWorkNow,
  breakMinutes,
  canConfirm,
  clockFailureOf,
  clockStatus,
  confirmRowOf,
  type EntryProof,
  entryDate,
  entryMinutes,
  entryOverdue,
  entryToConfirm,
  formatElapsed,
  formatHours,
  monthMinutes,
  monthOf,
  monthRange,
  monthRecords,
  openEntryOf,
  parseEntryTimes,
  parseReason,
  punchFailureOf,
  REASON_MAX,
  roundMinutes,
  type TimeEntry,
  teamMonth,
  timeEntry,
  undoableEntry,
  weekSummary,
  weekTotals,
} from "./time-clock";

const TZ = "Asia/Jerusalem";

const entry = (userId: string, clockIn: string, clockOut: string | null) => ({
  userId,
  clockIn,
  clockOut,
});

describe("timeEntry", () => {
  const row = {
    id: "68000000-0000-4000-a000-000000000001",
    userId: "u1",
    clockIn: "2026-11-10T06:00:00+00:00",
    clockOut: "2026-11-10T14:00:00+00:00",
    source: "punch",
  };

  it("accepts an entry as the database returns it", () => {
    expect(timeEntry.safeParse(row).success).toBe(true);
    expect(timeEntry.safeParse({ ...row, clockOut: null }).success).toBe(true);
  });

  it("refuses an end before the start", () => {
    expect(
      timeEntry.safeParse({ ...row, clockOut: "2026-11-10T05:00:00+00:00" })
        .success,
    ).toBe(false);
  });

  it("reads how each time was made, and rows from before", () => {
    expect(
      timeEntry.parse({
        ...row,
        inProof: "typed",
        outProof: "none",
        confirmedAt: "2026-11-10T15:00:00+00:00",
      }),
    ).toMatchObject({
      inProof: "typed",
      outProof: "none",
      confirmedAt: "2026-11-10T15:00:00+00:00",
    });
    expect(timeEntry.parse(row)).toMatchObject({
      inProof: null,
      outProof: null,
      confirmedAt: null,
    });
    expect(timeEntry.safeParse({ ...row, inProof: "guessed" }).success).toBe(
      false,
    );
  });
});

describe("confirming what was made without a code", () => {
  const IN = "2026-11-10T06:00:00Z";
  const OUT = "2026-11-10T14:00:00Z";
  const made = (
    inProof: EntryProof | null,
    outProof: EntryProof | null,
    confirmedAt: string | null = null,
    clockOut: string | null = OUT,
  ) => ({ inProof, outProof, confirmedAt, clockOut });

  it("knows what still needs confirming", () => {
    const table: [ReturnType<typeof made>, unknown][] = [
      // An arrival without a code, until it is confirmed.
      [
        made("none", "typed"),
        { arrival: true, departure: false, ownerOnly: false },
      ],
      [made("none", "typed", "2026-11-10T07:00:00Z"), null],
      // A departure made after the confirmation needs its own.
      [
        made("none", "none", "2026-11-10T07:00:00Z"),
        { arrival: false, departure: true, ownerOnly: false },
      ],
      [made("none", "none", "2026-11-10T15:00:00Z"), null],
      [
        made("scan", "none"),
        { arrival: false, departure: true, ownerOnly: false },
      ],
      [
        made("none", null, null, null),
        { arrival: true, departure: false, ownerOnly: false },
      ],
      // A time someone set for themselves is an owner's to confirm.
      [
        made("self", "self"),
        { arrival: true, departure: true, ownerOnly: true },
      ],
      [
        made("none", "self", "2026-11-10T07:00:00Z"),
        { arrival: false, departure: true, ownerOnly: true },
      ],
      // Nothing waits otherwise.
      [made("owner", "owner"), null],
      [made("off", "off"), null],
      [made("scan", "typed"), null],
      [made("manager", "manager"), null],
      [made(null, null), null],
    ];
    for (const [entry, expected] of table) {
      expect(entryToConfirm(entry), JSON.stringify(entry)).toEqual(expected);
    }
  });

  it("lets a manager approve others' entries, and only an owner a manager's own", () => {
    const plain = { arrival: true, departure: false, ownerOnly: false };
    const self = { arrival: true, departure: false, ownerOnly: true };
    const manager = { userId: "m", role: "manager" as const };
    const owner = { userId: "o", role: "owner" as const };
    const worker = { userId: "w", role: "worker" as const };
    expect(canConfirm(plain, "noa", manager)).toBe(true);
    expect(canConfirm(plain, "m", manager)).toBe(false);
    expect(canConfirm(self, "m", manager)).toBe(false);
    expect(canConfirm(self, "other-manager", manager)).toBe(false);
    expect(canConfirm(self, "m", owner)).toBe(true);
    expect(canConfirm(plain, "o", owner)).toBe(true);
    expect(canConfirm(plain, "noa", worker)).toBe(false);
  });

  it("says what an approval row waits for, and which time it names", () => {
    const waits = (
      arrival: boolean,
      departure: boolean,
      ownerOnly = false,
    ) => ({
      arrival,
      departure,
      ownerOnly,
    });
    const closed = { in: "09:14", out: "17:02" };
    const open = { in: "09:14", out: null };
    const table: [
      { in: string; out: string | null },
      ReturnType<typeof waits>,
      ReturnType<typeof confirmRowOf>,
    ][] = [
      [closed, waits(true, false), { what: "in", time: "09:14" }],
      [open, waits(true, false), { what: "in", time: "09:14" }],
      [closed, waits(false, true), { what: "out", time: "17:02" }],
      // No departure to name: the row keeps the arrival.
      [open, waits(false, true), { what: "out", time: "09:14" }],
      [closed, waits(true, true), { what: "both", time: "09:14–17:02" }],
      [open, waits(true, true), { what: "both", time: "09:14" }],
      // A time set for oneself is named by its arrival, whatever waits.
      [closed, waits(true, true, true), { what: "self", time: "09:14" }],
      [closed, waits(false, true, true), { what: "self", time: "09:14" }],
    ];
    for (const [times, toConfirm, expected] of table) {
      expect(
        confirmRowOf(times, toConfirm),
        JSON.stringify({ times, toConfirm }),
      ).toEqual(expected);
    }
  });

  it("names the weakest way an entry was made", () => {
    expect(attendanceOf(made("scan", "scan"))).toEqual({
      how: "scan",
      pending: false,
    });
    expect(attendanceOf(made("scan", "typed"))).toEqual({
      how: "typed",
      pending: false,
    });
    expect(attendanceOf(made("typed", "none"))).toEqual({
      how: "none",
      pending: true,
    });
    expect(attendanceOf(made("none", "scan", "2026-11-10T07:00:00Z"))).toEqual({
      how: "none",
      pending: false,
    });
    expect(attendanceOf(made("none", "self"))).toEqual({
      how: "self",
      pending: true,
    });
    expect(attendanceOf(made("owner", "manager"))).toEqual(
      attendanceOf(made(null, null)),
    );
    expect(attendanceOf(made("off", null, null, null))).toBeNull();
  });

  it("monthRecords carries the attendance", () => {
    const [record] = monthRecords(
      [
        {
          id: "68000000-0000-4000-a000-000000000001",
          userId: "u1",
          clockIn: IN,
          source: "punch",
          breaks: [],
          note: null,
          editedBy: null,
          editedAt: null,
          createdAt: null,
          ...made("none", "typed"),
        },
      ],
      "2026-11",
      TZ,
      new Date("2026-11-20T12:00:00Z"),
    );
    expect(record?.attendance).toEqual({ how: "none", pending: true });
  });
});

describe("what a punch can answer", () => {
  it("says what a punch can answer", () => {
    expect(punchFailureOf("code", "plain")).toBe("codeNeeded");
    expect(punchFailureOf("code", "typed")).toBe("code");
    expect(punchFailureOf("code", "scan")).toBe("code");
    expect(punchFailureOf("codeLocked", "typed")).toBe("codeLocked");
    expect(punchFailureOf("ownCode", "typed")).toBe("ownCode");
    expect(punchFailureOf("alreadyOnBreak", null)).toBe("alreadyOnBreak");
    for (const refusal of [
      "ownHours",
      "ownerOnly",
      "nothingToConfirm",
      "reasonNeeded",
    ] as const) {
      expect(punchFailureOf(refusal, "typed")).toBe("failed");
    }
  });
});

describe("entryMinutes", () => {
  it("counts a closed entry", () => {
    const e = entry("u1", "2026-11-10T06:00:00Z", "2026-11-10T14:30:00Z");
    expect(entryMinutes(e, new Date("2026-12-01T00:00:00Z"))).toBe(510);
  });

  it("counts an open entry until now, in whole minutes", () => {
    const e = entry("u1", "2026-11-10T06:00:00Z", null);
    expect(entryMinutes(e, new Date("2026-11-10T07:15:59Z"))).toBe(75);
  });

  it("never goes below zero", () => {
    const e = entry("u1", "2026-11-10T06:00:00Z", null);
    expect(entryMinutes(e, new Date("2026-11-10T05:00:00Z"))).toBe(0);
  });
});

describe("entryDate", () => {
  it("is the clock-in's date in the business's time zone", () => {
    // 23:30 UTC on 10.11 is 01:30 on 11.11 in Israel (winter, +2).
    expect(entryDate({ clockIn: "2026-11-10T23:30:00Z" }, TZ)).toBe(
      "2026-11-11",
    );
    expect(entryDate({ clockIn: "2026-11-10T21:59:00Z" }, TZ)).toBe(
      "2026-11-10",
    );
  });
});

describe("weekSummary", () => {
  const now = new Date("2026-11-20T00:00:00Z");

  it("adds up a week, with a day per date", () => {
    const week = weekSummary(
      [
        entry("u1", "2026-11-08T05:00:00Z", "2026-11-08T13:00:00Z"),
        entry("u1", "2026-11-10T05:00:00Z", "2026-11-10T09:30:00Z"),
      ],
      "2026-11-08",
      TZ,
      now,
    );
    expect(week.total).toBe(480 + 270);
    expect(week.days.map((d) => d.date)).toEqual([
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
      "2026-11-11",
      "2026-11-12",
      "2026-11-13",
      "2026-11-14",
    ]);
    expect(week.days[0]?.minutes).toBe(480);
    expect(week.days[2]?.minutes).toBe(270);
  });

  it("counts an evening past midnight on the evening's day", () => {
    // Saturday 14.11, 20:00 to 02:00 on Sunday (Israel time).
    const evening = entry("u1", "2026-11-14T18:00:00Z", "2026-11-15T00:00:00Z");
    const week = weekSummary([evening], "2026-11-08", TZ, now);
    expect(week.days[6]?.minutes).toBe(360);
    expect(week.total).toBe(360);
    expect(weekSummary([evening], "2026-11-15", TZ, now).total).toBe(0);
  });

  it("leaves out entries of other weeks, in the business's time zone", () => {
    // 21:30 UTC on Saturday 7.11 is 23:30 in Israel: the week before.
    const before = entry("u1", "2026-11-07T21:30:00Z", "2026-11-07T21:50:00Z");
    // 22:30 UTC on Saturday 7.11 is 00:30 on Sunday 8.11 in Israel.
    const inWeek = entry("u1", "2026-11-07T22:30:00Z", "2026-11-07T23:00:00Z");
    expect(weekSummary([before, inWeek], "2026-11-08", TZ, now).total).toBe(30);
  });

  it("counts an open entry until now", () => {
    const open = entry("u1", "2026-11-10T06:00:00Z", null);
    expect(
      weekSummary([open], "2026-11-08", TZ, new Date("2026-11-10T08:00:00Z"))
        .total,
    ).toBe(120);
  });

  it("keeps the summer clock change: 27.3.2026 is still one day", () => {
    // Clocks go forward in Israel on Friday 27.3.2026 at 02:00.
    const night = entry("u1", "2026-03-26T22:30:00Z", "2026-03-27T03:00:00Z");
    const week = weekSummary([night], "2026-03-22", TZ, now);
    expect(week.days[5]).toEqual({ date: "2026-03-27", minutes: 270 });
  });
});

describe("weekTotals", () => {
  it("gives each person their week", () => {
    const totals = weekTotals(
      [
        entry("u1", "2026-11-08T05:00:00Z", "2026-11-08T13:00:00Z"),
        entry("u2", "2026-11-09T05:00:00Z", "2026-11-09T06:00:00Z"),
        entry("u1", "2026-11-09T05:00:00Z", "2026-11-09T06:00:00Z"),
        entry("u2", "2026-11-01T05:00:00Z", "2026-11-01T06:00:00Z"),
      ],
      "2026-11-08",
      TZ,
      new Date("2026-11-20T00:00:00Z"),
    );
    expect(Object.fromEntries(totals)).toEqual({ u1: 540, u2: 60 });
  });
});

describe("atWorkNow", () => {
  const now = new Date("2026-11-10T10:00:00Z");

  it("lists open entries that started, longest there first", () => {
    expect(
      atWorkNow(
        [
          entry("late", "2026-11-10T09:00:00Z", null),
          entry("left", "2026-11-10T05:00:00Z", "2026-11-10T09:00:00Z"),
          entry("early", "2026-11-10T06:00:00Z", null),
          entry("future", "2026-11-10T11:00:00Z", null),
        ],
        now,
      ),
    ).toEqual([
      {
        userId: "early",
        since: "2026-11-10T06:00:00Z",
        minutes: 240,
        onBreak: false,
      },
      {
        userId: "late",
        since: "2026-11-10T09:00:00Z",
        minutes: 60,
        onBreak: false,
      },
    ]);
  });

  it("includes a night shift that started yesterday", () => {
    const night = entry("night", "2026-11-09T20:00:00Z", null);
    expect(atWorkNow([night], new Date("2026-11-10T01:00:00Z"))).toEqual([
      {
        userId: "night",
        since: "2026-11-09T20:00:00Z",
        minutes: 300,
        onBreak: false,
      },
    ]);
  });

  it("is empty when nobody is clocked in", () => {
    expect(atWorkNow([], now)).toEqual([]);
  });
});

describe("openEntryOf", () => {
  it("finds the person's open entry only", () => {
    const open = entry("u1", "2026-11-10T06:00:00Z", null);
    const entries = [
      entry("u1", "2026-11-09T06:00:00Z", "2026-11-09T07:00:00Z"),
      open,
    ];
    expect(openEntryOf(entries, "u1")).toBe(open);
    expect(openEntryOf(entries, "u2")).toBeNull();
  });
});

describe("roundMinutes", () => {
  it("rounds to the business's step", () => {
    expect(roundMinutes(487, 0)).toBe(487);
    expect(roundMinutes(487, 5)).toBe(485);
    expect(roundMinutes(488, 15)).toBe(495);
  });
});

describe("clockFailureOf", () => {
  it("maps the database's refusals", () => {
    expect(clockFailureOf("28000")).toBe("code");
    expect(clockFailureOf("23P01", "Already clocked in")).toBe("alreadyIn");
    expect(
      clockFailureOf(
        "23P01",
        "conflicting key value violates exclusion constraint",
      ),
    ).toBe("times");
    expect(clockFailureOf("55000", "Not clocked in")).toBe("notIn");
    expect(
      clockFailureOf(
        "55000",
        "Open for more than 24 hours; a manager corrects it",
      ),
    ).toBe("tooLong");
    expect(clockFailureOf("22023")).toBe("times");
    expect(clockFailureOf("42501")).toBe("noAccess");
    expect(clockFailureOf("P0002")).toBe("noAccess");
    expect(clockFailureOf(undefined)).toBe("failed");
  });

  it("tells a locked, own or wrong code apart, and the confirm refusals", () => {
    // The exact words of 20261108000300_sealed.sql and 20261108000200_qr_clock.sql.
    expect(clockFailureOf("28000", "Too many wrong codes; scan instead")).toBe(
      "codeLocked",
    );
    expect(
      clockFailureOf("28000", "A code you showed yourself does not count"),
    ).toBe("ownCode");
    expect(
      clockFailureOf("28000", "The punch code is missing or expired"),
    ).toBe("code");
    expect(
      clockFailureOf("42501", "This business shows codes on its stations only"),
    ).toBe("stationsOnly");
    expect(
      clockFailureOf("42501", "Someone else confirms your own hours"),
    ).toBe("ownHours");
    expect(
      clockFailureOf(
        "42501",
        "Only an owner confirms hours someone set for themselves",
      ),
    ).toBe("ownerOnly");
    expect(
      clockFailureOf(
        "55000",
        "Only an entry made without a code needs confirming",
      ),
    ).toBe("nothingToConfirm");
    expect(clockFailureOf("42501", "Managers and owners only")).toBe(
      "noAccess",
    );
    expect(
      clockFailureOf("42501", "The time clock is off for this business"),
    ).toBe("noAccess");
  });
});

describe("breaks", () => {
  const shift = {
    clockIn: "2026-11-10T06:00:00Z",
    clockOut: "2026-11-10T14:00:00Z",
  };
  const pause = (unpaid: boolean, endedAt: string | null) => ({
    startedAt: "2026-11-10T10:00:00Z",
    endedAt,
    unpaid,
  });
  const after = new Date("2026-11-10T15:00:00Z");

  it("takes an unpaid break off the hours", () => {
    const breaks = [pause(true, "2026-11-10T10:30:00Z")];
    expect(entryMinutes({ ...shift, breaks }, after)).toBe(450);
  });

  it("leaves a paid break in the hours", () => {
    const breaks = [pause(false, "2026-11-10T10:30:00Z")];
    expect(entryMinutes({ ...shift, breaks }, after)).toBe(480);
    expect(breakMinutes({ ...shift, breaks }, after)).toBe(30);
  });

  it("stops the hours during an open unpaid break", () => {
    const open = {
      clockIn: shift.clockIn,
      clockOut: null,
      breaks: [pause(true, null)],
    };
    const at = (time: string) => entryMinutes(open, new Date(time));
    expect(at("2026-11-10T10:05:00Z")).toBe(240);
    expect(at("2026-11-10T10:55:00Z")).toBe(240);
  });

  it("carries through the week's sum", () => {
    const breaks = [pause(true, "2026-11-10T11:00:00Z")];
    const week = weekSummary([{ ...shift, breaks }], "2026-11-08", TZ, after);
    expect(week.total).toBe(420);
  });
});

describe("an entry left open", () => {
  const open = { clockIn: "2026-11-01T06:00:00Z", clockOut: null };
  const days = new Date("2026-11-06T10:00:00Z");

  it("stops counting at the most an entry can be", () => {
    expect(entryMinutes(open, days)).toBe(24 * 60);
    expect(monthMinutes([open], "2026-11", TZ, days)).toBe(24 * 60);
  });

  it("does not lose the hours to a break left open too", () => {
    const breaks = [
      { startedAt: "2026-11-01T14:00:00Z", endedAt: null, unpaid: true },
    ];
    expect(entryMinutes({ ...open, breaks }, days)).toBe(8 * 60);
    expect(breakMinutes({ ...open, breaks }, days)).toBe(16 * 60);
  });

  it("is overdue only past that time, and only while open", () => {
    expect(entryOverdue(open, new Date("2026-11-02T06:00:00Z"))).toBe(false);
    expect(entryOverdue(open, new Date("2026-11-02T06:01:00Z"))).toBe(true);
    expect(
      entryOverdue({ ...open, clockOut: "2026-11-01T14:00:00Z" }, days),
    ).toBe(false);
  });
});

describe("clockStatus", () => {
  const open = { breaks: [] as TimeEntry["breaks"] };

  it("tells away, working and on a break apart", () => {
    expect(clockStatus(null).state).toBe("off");
    expect(clockStatus(open).state).toBe("working");
    const pause = {
      id: "68000000-0000-4000-a000-000000000002",
      startedAt: "2026-11-10T10:00:00Z",
      endedAt: null,
      unpaid: true,
    };
    expect(clockStatus({ breaks: [pause] })).toMatchObject({
      state: "break",
      pause,
    });
    expect(
      clockStatus({
        breaks: [{ ...pause, endedAt: "2026-11-10T10:30:00Z" }],
      }).state,
    ).toBe("working");
  });
});

describe("months", () => {
  it("steps across a year", () => {
    expect(addMonths("2026-11", 1)).toBe("2026-12");
    expect(addMonths("2026-12", 1)).toBe("2027-01");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthOf("2026-11-06")).toBe("2026-11");
  });

  it("starts and ends in the business's time zone", () => {
    const { from, to } = monthRange("2026-11", TZ);
    expect(from.toISOString()).toBe("2026-10-31T22:00:00.000Z");
    expect(to.toISOString()).toBe("2026-11-30T22:00:00.000Z");
  });

  const now = new Date("2026-11-20T12:00:00Z");

  it("counts an entry in the month its day began in", () => {
    const entries = [
      // Starts 23:00 on 31 October in Israel and ends in November.
      { clockIn: "2026-10-31T21:00:00Z", clockOut: "2026-10-31T23:00:00Z" },
      { clockIn: "2026-11-10T06:00:00Z", clockOut: "2026-11-10T10:00:00Z" },
    ];
    expect(monthMinutes(entries, "2026-10", TZ, now)).toBe(120);
    expect(monthMinutes(entries, "2026-11", TZ, now)).toBe(240);
  });

  it("rounds each entry by the business's step", () => {
    const entries = [
      { clockIn: "2026-11-10T06:00:00Z", clockOut: "2026-11-10T10:07:00Z" },
      { clockIn: "2026-11-11T06:00:00Z", clockOut: "2026-11-11T10:07:00Z" },
    ];
    expect(monthMinutes(entries, "2026-11", TZ, now, 5)).toBe(490);
  });

  it("lists a month for the history, newest first", () => {
    const row = (
      id: string,
      clockIn: string,
      clockOut: string | null,
      source: "punch" | "manager" = "punch",
    ): TimeEntry => ({
      id: `68000000-0000-4000-a000-00000000000${id}`,
      userId: "u1",
      clockIn,
      clockOut,
      source,
      breaks: [],
      inProof: null,
      outProof: null,
      confirmedAt: null,
      note: null,
      editedBy: null,
      editedAt: null,
      createdAt: null,
    });
    const records = monthRecords(
      [
        row("1", "2026-11-10T06:00:00Z", "2026-11-10T14:00:00Z", "manager"),
        row("2", "2026-11-20T06:00:00Z", null),
        row("3", "2026-10-20T06:00:00Z", "2026-10-20T14:00:00Z"),
      ],
      "2026-11",
      TZ,
      now,
    );
    expect(records.map((r) => r.date)).toEqual(["2026-11-20", "2026-11-10"]);
    expect(records[0]).toMatchObject({ in: "08:00", out: null, minutes: 360 });
    expect(records[1]).toMatchObject({
      out: "16:00",
      minutes: 480,
      byManager: true,
    });
  });

  it("says who corrected a shift and why", () => {
    const corrected = timeEntry.parse({
      id: "68000000-0000-4000-a000-000000000001",
      userId: "u1",
      clockIn: "2026-11-10T06:00:00Z",
      clockOut: "2026-11-10T14:00:00Z",
      source: "punch",
      note: "Forgot to clock out",
      editedBy: "m1",
      editedAt: "2026-11-11T08:00:00+00:00",
    });
    const untouched = timeEntry.parse({
      id: "68000000-0000-4000-a000-000000000002",
      userId: "u1",
      clockIn: "2026-11-12T06:00:00Z",
      clockOut: "2026-11-12T14:00:00Z",
      source: "punch",
    });
    // A change from before reasons, by someone the reader can't see.
    const older = timeEntry.parse({
      ...untouched,
      id: "68000000-0000-4000-a000-000000000003",
      clockIn: "2026-11-13T06:00:00Z",
      clockOut: "2026-11-13T14:00:00Z",
      editedBy: "gone",
      editedAt: "2026-11-14T08:00:00+00:00",
    });
    const names = new Map([["m1", "Shiran"]]);
    const records = monthRecords(
      [corrected, untouched, older],
      "2026-11",
      TZ,
      now,
      0,
      (userId) => names.get(userId) ?? null,
    );
    expect(records.map((r) => r.correction)).toEqual([
      { kind: "corrected", by: null, note: null },
      null,
      { kind: "corrected", by: "Shiran", note: "Forgot to clock out" },
    ]);
    // Without names, nobody is named.
    expect(
      monthRecords([corrected], "2026-11", TZ, now)[0]?.correction,
    ).toEqual({ kind: "corrected", by: null, note: "Forgot to clock out" });
  });

  it("tells a shift a manager added from one corrected since", () => {
    // add_time_entry writes the edit as it writes the entry.
    const added = timeEntry.parse({
      id: "68000000-0000-4000-a000-000000000001",
      userId: "u1",
      clockIn: "2026-11-10T06:00:00Z",
      clockOut: "2026-11-10T14:00:00Z",
      source: "manager",
      note: "Forgot to punch",
      editedBy: "m1",
      editedAt: "2026-11-11T08:00:00.123456+00:00",
      createdAt: "2026-11-11T08:00:00.123456+00:00",
    });
    // Corrected by someone else the day after: the line follows the fix.
    const correctedSince = timeEntry.parse({
      ...added,
      id: "68000000-0000-4000-a000-000000000002",
      clockIn: "2026-11-12T06:00:00Z",
      clockOut: "2026-11-12T13:00:00Z",
      note: "Left at three",
      editedBy: "m2",
      editedAt: "2026-11-12T09:30:00+00:00",
    });
    // A time passed in (as the tests do) may come before the write itself.
    const backdated = timeEntry.parse({
      ...added,
      id: "68000000-0000-4000-a000-000000000003",
      clockIn: "2026-11-13T06:00:00Z",
      clockOut: "2026-11-13T14:00:00Z",
      editedAt: "2026-11-10T08:00:00+00:00",
    });
    // Without the time it was written, it reads as the add.
    const unknown = timeEntry.parse({
      ...added,
      id: "68000000-0000-4000-a000-000000000004",
      clockIn: "2026-11-14T06:00:00Z",
      clockOut: "2026-11-14T14:00:00Z",
      editedAt: "2026-11-15T08:00:00+00:00",
      createdAt: null,
    });
    const names = new Map([
      ["m1", "Shiran"],
      ["m2", "Dana"],
    ]);
    const records = monthRecords(
      [added, correctedSince, backdated, unknown],
      "2026-11",
      TZ,
      now,
      0,
      (userId) => names.get(userId) ?? null,
    );
    expect(records.map((r) => [r.byManager, r.correction])).toEqual([
      [true, { kind: "added", by: "Shiran", note: "Forgot to punch" }],
      [true, { kind: "added", by: "Shiran", note: "Forgot to punch" }],
      [true, { kind: "corrected", by: "Dana", note: "Left at three" }],
      [true, { kind: "added", by: "Shiran", note: "Forgot to punch" }],
    ]);
  });
});

describe("the manager's view", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const row = (
    id: string,
    userId: string,
    clockIn: string,
    clockOut: string | null,
    breaks: TimeEntry["breaks"] = [],
  ): TimeEntry => ({
    id: `68000000-0000-4000-a000-00000000000${id}`,
    userId,
    clockIn,
    clockOut,
    source: "punch",
    breaks,
    inProof: null,
    outProof: null,
    confirmedAt: null,
    note: null,
    editedBy: null,
    editedAt: null,
    createdAt: null,
  });
  const pause = {
    id: "68000000-0000-4000-a000-000000000009",
    startedAt: "2026-11-20T11:00:00Z",
    endedAt: null,
    unpaid: true,
  };

  it("tells who is on a break", () => {
    expect(
      atWorkNow([row("1", "u1", "2026-11-20T08:00:00Z", null, [pause])], now),
    ).toMatchObject([{ userId: "u1", onBreak: true }]);
  });

  it("adds up each person's month, leaving out other months", () => {
    const month = teamMonth(
      [
        row("1", "u1", "2026-11-10T06:00:00Z", "2026-11-10T08:00:00Z"),
        row("2", "u1", "2026-11-11T06:00:00Z", "2026-11-11T07:00:00Z"),
        row("3", "u2", "2026-11-12T06:00:00Z", "2026-11-12T06:30:00Z"),
        row("4", "u3", "2026-10-12T06:00:00Z", "2026-10-12T06:30:00Z"),
      ],
      "2026-11",
      TZ,
      now,
    );
    expect(Object.fromEntries(month)).toEqual({
      u1: { minutes: 180, shifts: 2, breakMinutes: 0 },
      u2: { minutes: 30, shifts: 1, breakMinutes: 0 },
    });
  });

  it("flags an entry left open too long in the history", () => {
    const [record] = monthRecords(
      [row("1", "u1", "2026-11-18T06:00:00Z", null)],
      "2026-11",
      TZ,
      now,
    );
    expect(record).toMatchObject({ overdue: true, minutes: 24 * 60 });
  });
});

describe("parseEntryTimes", () => {
  const now = new Date("2026-11-20T12:00:00Z");
  const parse = (
    date: string,
    start: string,
    out: string,
    endRequired = true,
  ) => parseEntryTimes({ date, in: start, out }, TZ, now, { endRequired });

  it("reads the times in the business's time zone", () => {
    expect(parse("2026-11-10", "08:00", "16:00")).toEqual({
      ok: true,
      clockIn: "2026-11-10T06:00:00.000Z",
      clockOut: "2026-11-10T14:00:00.000Z",
    });
  });

  it("puts an end before the start on the next day", () => {
    expect(parse("2026-11-10", "20:00", "02:00")).toMatchObject({
      clockOut: "2026-11-11T00:00:00.000Z",
    });
  });

  it("asks for an end only where one is needed", () => {
    expect(parse("2026-11-10", "08:00", "")).toEqual({
      ok: false,
      problem: "needsEnd",
    });
    expect(parse("2026-11-20", "08:00", "", false)).toMatchObject({
      ok: true,
      clockOut: null,
    });
  });

  it("refuses an end equal to the start, rather than 24 hours", () => {
    expect(parse("2026-11-10", "08:00", "08:00")).toEqual({
      ok: false,
      problem: "sameTime",
    });
  });

  it("refuses times that have not happened yet", () => {
    expect(parse("2026-11-20", "16:00", "18:00")).toEqual({
      ok: false,
      problem: "future",
    });
    expect(parse("2026-11-20", "08:00", "18:00")).toEqual({
      ok: false,
      problem: "future",
    });
  });

  it("refuses what is not a date and times", () => {
    expect(parse("not-a-date", "08:00", "16:00")).toEqual({
      ok: false,
      problem: "invalid",
    });
    expect(parse("2026-11-10", "25:00", "16:00")).toEqual({
      ok: false,
      problem: "invalid",
    });
    expect(parseEntryTimes(null, TZ, now, { endRequired: true })).toEqual({
      ok: false,
      problem: "invalid",
    });
  });
});

describe("undoableEntry", () => {
  const row = (clockOut: string | null) => ({
    clockOut,
    source: "punch" as const,
  });
  const now = new Date("2026-11-10T14:01:00Z");

  it("is the last entry left within the time allowed", () => {
    const last = row("2026-11-10T14:00:00Z");
    expect(undoableEntry([row("2026-11-09T14:00:00Z"), last], now)).toBe(last);
  });

  it("is nothing once the time has passed", () => {
    expect(undoableEntry([row("2026-11-10T13:58:00Z")], now)).toBeNull();
    expect(undoableEntry([row(null)], now)).toBeNull();
  });

  it("leaves what a manager wrote alone", () => {
    expect(
      undoableEntry(
        [{ clockOut: "2026-11-10T14:00:00Z", source: "manager" as const }],
        now,
      ),
    ).toBeNull();
  });
});

describe("formats", () => {
  it("writes hours and minutes", () => {
    expect(formatHours(5)).toBe("0:05");
    expect(formatHours(86 * 60 + 5)).toBe("86:05");
    expect(formatHours(-3)).toBe("0:00");
  });

  it("writes a running time", () => {
    expect(formatElapsed((3 * 3600 + 42 * 60 + 7) * 1000)).toBe("3:42:07");
    expect(formatElapsed(-1)).toBe("0:00:00");
  });
});

describe("clockFailureOf, for breaks", () => {
  it("names the refusals", () => {
    expect(clockFailureOf("23P01", "Already on a break")).toBe(
      "alreadyOnBreak",
    );
    expect(clockFailureOf("55000", "Not on a break")).toBe("notOnBreak");
    expect(clockFailureOf("55000", "Too late to take it back")).toBe("tooLate");
    expect(clockFailureOf("22023", "An entry that ended needs an end")).toBe(
      "needsEnd",
    );
  });
});

describe("the reason for a correction", () => {
  it("maps the database's refusal", () => {
    // The words of 20261110000100_hours_kept.sql.
    expect(clockFailureOf("22023", "A correction needs its reason")).toBe(
      "reasonNeeded",
    );
  });

  it("keeps a reason as the database does", () => {
    expect(parseReason("  Forgot to clock out  ")).toBe("Forgot to clock out");
    expect(parseReason("x".repeat(REASON_MAX))).toBe("x".repeat(REASON_MAX));
    for (const missing of ["", "   ", "x".repeat(REASON_MAX + 1), null, 5]) {
      expect(parseReason(missing), String(missing)).toBeNull();
    }
  });
});
