import { describe, expect, it } from "vitest";
import {
  addMonths,
  atWorkNow,
  breakMinutes,
  clockFailureOf,
  clockStatus,
  entryDate,
  entryMinutes,
  entryOverdue,
  formatElapsed,
  formatHours,
  monthMinutes,
  monthOf,
  monthRange,
  monthRecords,
  openEntryOf,
  roundMinutes,
  type TimeEntry,
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
      { userId: "early", since: "2026-11-10T06:00:00Z", minutes: 240 },
      { userId: "late", since: "2026-11-10T09:00:00Z", minutes: 60 },
    ]);
  });

  it("includes a night shift that started yesterday", () => {
    const night = entry("night", "2026-11-09T20:00:00Z", null);
    expect(atWorkNow([night], new Date("2026-11-10T01:00:00Z"))).toEqual([
      { userId: "night", since: "2026-11-09T20:00:00Z", minutes: 300 },
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
  });
});
