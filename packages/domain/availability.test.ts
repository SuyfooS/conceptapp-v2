import { describe, expect, it } from "vitest";
import {
  addDays,
  availabilityDueAt,
  availabilitySubmission,
  dateIn,
  instantIn,
  missingAvailability,
  nextWeekStart,
  teamAvailability,
  weekDates,
  weekdayOf,
  weekStartOf,
} from "./availability";
import { ISRAEL_TIME_ZONE } from "./shabbat";

describe("weeks", () => {
  it("adds days across months and years", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("finds the week's first day for a Sunday or Monday start", () => {
    // 1 November 2026 is a Sunday.
    expect(weekdayOf("2026-11-01")).toBe(0);
    expect(weekStartOf("2026-11-01", 0)).toBe("2026-11-01");
    expect(weekStartOf("2026-11-07", 0)).toBe("2026-11-01");
    expect(weekStartOf("2026-11-08", 0)).toBe("2026-11-08");
    expect(weekStartOf("2026-11-01", 1)).toBe("2026-10-26");
    expect(weekStartOf("2026-11-02", 1)).toBe("2026-11-02");
  });

  it("lists the seven days of a week", () => {
    expect(weekDates("2026-11-01")).toEqual([
      "2026-11-01",
      "2026-11-02",
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
    ]);
  });

  it("reads today's date in the business's zone, not the server's", () => {
    // 22:30 UTC on Saturday is already Sunday in Israel.
    const instant = new Date("2026-10-31T22:30:00Z");
    expect(dateIn(instant, ISRAEL_TIME_ZONE)).toBe("2026-11-01");
    expect(dateIn(instant, "UTC")).toBe("2026-10-31");
  });

  it("asks for the week after this one", () => {
    const wednesday = new Date("2026-10-28T09:00:00Z");
    expect(nextWeekStart(wednesday, ISRAEL_TIME_ZONE, 0)).toBe("2026-11-01");
    expect(nextWeekStart(wednesday, ISRAEL_TIME_ZONE, 1)).toBe("2026-11-02");
    // Saturday night in Israel is already Sunday: the week after that.
    const saturdayNight = new Date("2026-10-31T22:30:00Z");
    expect(nextWeekStart(saturdayNight, ISRAEL_TIME_ZONE, 0)).toBe(
      "2026-11-08",
    );
  });
});

describe("instantIn", () => {
  it("reads Israel's winter and summer time", () => {
    expect(
      instantIn("2026-11-04", "18:00", ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-11-04T16:00:00.000Z");
    expect(
      instantIn("2026-07-01", "18:00", ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-07-01T15:00:00.000Z");
  });

  it("handles the days the clocks change", () => {
    // Summer time ends 25 October 2026 at 02:00 (back to 01:00).
    expect(
      instantIn("2026-10-25", "12:00", ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-10-25T10:00:00.000Z");
    // Summer time starts 27 March 2026 at 02:00 (forward to 03:00).
    expect(
      instantIn("2026-03-27", "12:00", ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-03-27T09:00:00.000Z");
    // 02:30 does not exist that night: just after the change.
    expect(
      instantIn("2026-03-27", "02:30", ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-03-27T00:30:00.000Z");
  });

  it("works in other zones", () => {
    expect(instantIn("2026-11-04", "18:00", "UTC").toISOString()).toBe(
      "2026-11-04T18:00:00.000Z",
    );
    expect(
      instantIn("2026-11-04", "18:00", "America/New_York").toISOString(),
    ).toBe("2026-11-04T23:00:00.000Z");
  });
});

describe("availabilityDueAt", () => {
  const due = { day: 3, time: "18:00" };

  it("is due on the due day of the week before", () => {
    // Week of Sunday 8 November: due Wednesday 4 November, 18:00 Israel.
    expect(
      availabilityDueAt("2026-11-08", due, ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-11-04T16:00:00.000Z");
    // A Monday week: the Wednesday before it.
    expect(
      availabilityDueAt("2026-11-09", due, ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-11-04T16:00:00.000Z");
  });

  it("a due day on the week's first day is a full week before", () => {
    expect(
      availabilityDueAt(
        "2026-11-08",
        { day: 0, time: "12:00" },
        ISRAEL_TIME_ZONE,
      ).toISOString(),
    ).toBe("2026-11-01T10:00:00.000Z");
  });

  it("a due day just before the week is the day before", () => {
    expect(
      availabilityDueAt(
        "2026-11-08",
        { day: 6, time: "21:00" },
        ISRAEL_TIME_ZONE,
      ).toISOString(),
    ).toBe("2026-11-07T19:00:00.000Z");
  });

  it("uses summer time when the due day is before the clocks change", () => {
    // Week of 25 October: due Wednesday 21 October, still summer time.
    expect(
      availabilityDueAt("2026-10-25", due, ISRAEL_TIME_ZONE).toISOString(),
    ).toBe("2026-10-21T15:00:00.000Z");
  });
});

describe("availabilitySubmission", () => {
  const week = availabilitySubmission("2026-11-01");

  it("accepts ranges in the week, including past midnight", () => {
    const parsed = week.parse({
      ranges: [
        { day: "2026-11-01", start: "08:00", end: "12:00" },
        { day: "2026-11-01", start: "12:00", end: "16:00" },
        { day: "2026-11-05", start: "19:00", end: "02:00" },
      ],
      note: "  Exams on Thursday ",
    });
    expect(parsed.ranges).toHaveLength(3);
    expect(parsed.note).toBe("Exams on Thursday");
  });

  it("accepts no ranges: not available this week", () => {
    expect(week.parse({ ranges: [] })).toEqual({ ranges: [] });
    expect(week.parse({ ranges: [], note: "   " }).note).toBeUndefined();
  });

  it("refuses a range outside the week", () => {
    for (const day of ["2026-10-31", "2026-11-08"]) {
      const result = week.safeParse({
        ranges: [{ day, start: "08:00", end: "16:00" }],
      });
      expect(result.success).toBe(false);
      expect(result.error?.issues[0]?.path).toEqual(["ranges", 0, "day"]);
    }
  });

  it("refuses overlapping ranges on the same day", () => {
    const result = week.safeParse({
      ranges: [
        { day: "2026-11-02", start: "08:00", end: "16:00" },
        { day: "2026-11-03", start: "08:00", end: "16:00" },
        { day: "2026-11-02", start: "15:00", end: "20:00" },
      ],
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["ranges", 2]);
  });

  it("refuses a range inside one that runs past midnight", () => {
    expect(
      week.safeParse({
        ranges: [
          { day: "2026-11-02", start: "18:00", end: "02:00" },
          { day: "2026-11-02", start: "23:00", end: "23:30" },
        ],
      }).success,
    ).toBe(false);
  });

  it("refuses malformed ranges and long notes", () => {
    for (const range of [
      { day: "2026-11-02", start: "08:00", end: "08:00" },
      { day: "2026-11-02", start: "8am", end: "16:00" },
      { day: "2 November", start: "08:00", end: "16:00" },
    ]) {
      expect(week.safeParse({ ranges: [range] }).success).toBe(false);
    }
    expect(week.safeParse({ ranges: [], note: "x".repeat(301) }).success).toBe(
      false,
    );
    expect(
      week.safeParse({
        ranges: Array.from({ length: 22 }, (_, i) => ({
          day: "2026-11-02",
          start: `${String(i).padStart(2, "0")}:00`,
          end: `${String(i).padStart(2, "0")}:30`,
        })),
      }).success,
    ).toBe(false);
  });
});

describe("missingAvailability", () => {
  it("lists workers and managers who have not submitted, not owners", () => {
    const members = [
      { userId: "a", role: "owner" as const },
      { userId: "b", role: "manager" as const },
      { userId: "c", role: "worker" as const },
      { userId: "d", role: "worker" as const },
    ];
    expect(missingAvailability(members, ["c"])).toEqual([
      { userId: "b", role: "manager" },
      { userId: "d", role: "worker" },
    ]);
    expect(missingAvailability(members, ["b", "c", "d"])).toEqual([]);
  });
});

describe("teamAvailability", () => {
  const members = [
    { userId: "owner", role: "owner" as const },
    { userId: "manager", role: "manager" as const },
    { userId: "early", role: "worker" as const },
    { userId: "late", role: "worker" as const },
    { userId: "silent", role: "worker" as const },
  ];
  const dueAt = "2026-10-29T15:00:00.000Z";
  const answer = (userId: string, updatedAt: string, days: string[] = []) => ({
    userId,
    note: null,
    updatedAt,
    ranges: days.map((day) => ({ day, start: "09:00", end: "17:00" })),
  });

  it("splits the team into who sent and who has not", () => {
    const view = teamAvailability(
      members,
      [
        answer("late", "2026-10-29T15:00:01.000Z", ["2026-11-03"]),
        answer("early", "2026-10-27T08:00:00.000Z", [
          "2026-11-06",
          "2026-11-01",
          "2026-11-01",
        ]),
        answer("owner", "2026-10-29T15:00:00.000Z"),
      ],
      dueAt,
    );
    expect(view.missing.map((m) => m.userId)).toEqual(["manager", "silent"]);
    expect(
      view.sent.map(({ userId, late, days }) => ({ userId, late, days })),
    ).toEqual([
      // An owner who sends is listed; exactly on time is not late.
      { userId: "owner", late: false, days: [] },
      { userId: "early", late: false, days: ["2026-11-01", "2026-11-06"] },
      { userId: "late", late: true, days: ["2026-11-03"] },
    ]);
    expect(view.counts).toEqual({ sent: 3, missing: 2 });
  });

  it("ignores answers from people no longer on the team", () => {
    const view = teamAvailability(
      members.slice(0, 2),
      [answer("gone", "2026-10-27T08:00:00.000Z", ["2026-11-01"])],
      dueAt,
    );
    expect(view.sent).toEqual([]);
    expect(view.counts).toEqual({ sent: 0, missing: 1 });
  });

  it("keeps the answer for the screen", () => {
    const sent = answer("early", "2026-10-27T08:00:00.000Z", ["2026-11-01"]);
    const [row] = teamAvailability(members, [sent], dueAt).sent;
    expect(row?.answer).toBe(sent);
  });
});
