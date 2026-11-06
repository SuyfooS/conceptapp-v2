import { describe, expect, it } from "vitest";
import {
  atWorkNow,
  clockFailureOf,
  entryDate,
  entryMinutes,
  openEntryOf,
  roundMinutes,
  timeEntry,
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
