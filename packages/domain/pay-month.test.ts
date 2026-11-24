import { describe, expect, it } from "vitest";
import type { Role } from "./modules";
import {
  addTotals,
  opensPayPage,
  originalTimes,
  payDays,
  payListOf,
  paySourceOf,
  payTotals,
  toCheck,
} from "./pay-month";
import { payrollPeopleOf } from "./payroll";
import { type TimeEntry, timeEntry } from "./time-clock";

const TZ = "Asia/Jerusalem";
const NOW = new Date("2026-11-20T10:00:00Z");

let next = 0;
/** An entry of `user`'s, with `more` over a plain punched shift. */
const entry = (
  user: string,
  clockIn: string,
  clockOut: string | null,
  more: Partial<TimeEntry> = {},
): TimeEntry => {
  next += 1;
  return timeEntry.parse({
    id: `00000000-0000-4000-a000-${String(next).padStart(12, "0")}`,
    userId: user,
    clockIn,
    clockOut,
    source: "punch",
    ...more,
  });
};

describe("payTotals", () => {
  const breakOf = (startedAt: string, endedAt: string, unpaid: boolean) => ({
    id: "00000000-0000-4000-b000-000000000001",
    startedAt,
    endedAt,
    unpaid,
  });
  const entries = [
    // 1 October, 09:00–17:00 Israel time, half an hour unpaid.
    entry("noa", "2026-10-01T06:00:00Z", "2026-10-01T14:00:00Z", {
      breaks: [breakOf("2026-10-01T10:00:00Z", "2026-10-01T10:30:00Z", true)],
    }),
    // Two shifts on the same day: one day.
    entry("noa", "2026-10-02T05:00:00Z", "2026-10-02T07:00:00Z"),
    entry("noa", "2026-10-02T15:00:00Z", "2026-10-02T18:07:00Z", {
      editedBy: "shiran",
      editedAt: "2026-10-03T07:00:00Z",
      note: "Forgot to leave",
    }),
    // A paid break stays in the hours.
    entry("yoav", "2026-10-05T06:00:00Z", "2026-10-05T10:00:00Z", {
      breaks: [breakOf("2026-10-05T07:00:00Z", "2026-10-05T07:15:00Z", false)],
      inProof: "none",
    }),
    entry("yoav", "2026-10-06T06:00:00Z", "2026-10-06T08:00:00Z", {
      inProof: "self",
    }),
    // A night that starts on the last of the month counts in it.
    entry("yoav", "2026-10-31T19:00:00Z", "2026-11-01T03:30:00Z"),
    // November, and an open one.
    entry("noa", "2026-11-01T06:00:00Z", "2026-11-01T14:00:00Z"),
    entry("yoav", "2026-11-20T06:00:00Z", null),
  ];

  it("sums each person's month to the minute, unpaid breaks off", () => {
    const october = payTotals(entries, "2026-10", TZ, NOW);
    expect(october.get("noa")).toEqual({
      minutes: 450 + 120 + 187,
      days: 2,
      shifts: 3,
      unpaidBreakMinutes: 30,
      corrected: 1,
      waiting: 0,
      ownerOnly: 0,
      open: 0,
    });
    expect(october.get("yoav")).toEqual({
      minutes: 240 + 120 + 510,
      days: 3,
      shifts: 3,
      unpaidBreakMinutes: 0,
      corrected: 0,
      waiting: 2,
      ownerOnly: 1,
      open: 0,
    });
  });

  it("counts what is still open as something to check", () => {
    const november = payTotals(entries, "2026-11", TZ, NOW);
    const yoav = november.get("yoav");
    expect(yoav?.open).toBe(1);
    expect(yoav ? toCheck(yoav) : 0).toBe(1);
    expect(november.get("noa")?.minutes).toBe(480);
  });

  it("adds people up", () => {
    const october = payTotals(entries, "2026-10", TZ, NOW);
    const all = addTotals(october.values());
    expect(all.minutes).toBe(757 + 870);
    expect(all.shifts).toBe(6);
    expect(all.waiting).toBe(2);
    expect(addTotals([]).minutes).toBe(0);
  });
});

describe("payListOf", () => {
  const member = (
    userId: string,
    name: string | null,
    role: Role,
    active = true,
  ) => ({ userId, name, role, active });
  const people = [
    member("dana", "דנה", "worker"),
    // Left in December: her vacation's last days, and no shift.
    member("avi", "אבי", "worker", false),
    // Left, with a shift in the month.
    member("gil", "גיל", "worker", false),
    // Left, with nothing in the month.
    member("beni", "בני", "worker", false),
    member("ruth", "רות", "accountant"),
    member("nameless", null, "worker"),
  ];
  const withHours = new Set(["gil"]);

  it("lists everyone the hours engine and the file do: someone who left with only days away too (known issue 19)", () => {
    // The engine's people, as the pay month reads them.
    const engine = payrollPeopleOf(
      people,
      [{ userId: "gil" }],
      [{ userId: "avi" }],
    ).map((userId) => ({ userId }));
    expect(
      payListOf(people, withHours, engine).map((one) => one.userId),
    ).toEqual(["avi", "gil", "dana", "nameless"]);
  });

  it("lists the staff now and anyone with hours, by name, when the engine couldn't run", () => {
    expect(payListOf(people, withHours, []).map((one) => one.userId)).toEqual([
      "gil",
      "dana",
      "nameless",
    ]);
  });

  it("lists only rows whose page opens: someone now the accountant with only days away too", () => {
    // Ruth was on vacation early in the month, worked no shift, and became
    // the accountant after: the engine and the file list her.
    const away = new Set(["avi", "ruth"]);
    const engine = payrollPeopleOf(
      people,
      [{ userId: "gil" }],
      [...away].map((userId) => ({ userId })),
    ).map((userId) => ({ userId }));
    const listed = payListOf(people, withHours, engine);
    expect(listed.map((one) => one.userId)).toContain("ruth");
    for (const one of listed) {
      expect(
        opensPayPage(one.role, {
          shifts: withHours.has(one.userId) ? 1 : 0,
          cancelled: 0,
          awayDays: away.has(one.userId) ? 3 : 0,
        }),
      ).toBe(true);
    }
  });
});

describe("opensPayPage", () => {
  it("opens for the staff, and off it only with shifts, cancelled ones or days away in the month", () => {
    const none = { shifts: 0, cancelled: 0, awayDays: 0 };
    expect(opensPayPage("worker", none)).toBe(true);
    expect(opensPayPage("owner", none)).toBe(true);
    expect(opensPayPage("accountant", none)).toBe(false);
    expect(opensPayPage("accountant", { ...none, shifts: 1 })).toBe(true);
    expect(opensPayPage("accountant", { ...none, cancelled: 1 })).toBe(true);
    expect(opensPayPage("accountant", { ...none, awayDays: 2 })).toBe(true);
  });
});

describe("paySourceOf", () => {
  it("names a shift by its weaker time, and a manager's as added", () => {
    const shift = { source: "punch" as const, inProof: null, outProof: null };
    expect(paySourceOf(shift)).toBe("punch");
    expect(paySourceOf({ ...shift, inProof: "scan", outProof: "typed" })).toBe(
      "typed",
    );
    expect(paySourceOf({ ...shift, inProof: "off", outProof: "off" })).toBe(
      "off",
    );
    expect(paySourceOf({ ...shift, inProof: "scan", outProof: "none" })).toBe(
      "none",
    );
    expect(paySourceOf({ ...shift, inProof: "off", outProof: "manager" })).toBe(
      "manager",
    );
    expect(paySourceOf({ ...shift, inProof: "self" })).toBe("self");
    expect(paySourceOf({ ...shift, source: "manager" })).toBe("added");
  });
});

describe("payDays", () => {
  it("lists a person's shifts oldest first, with who corrected them and their times before", () => {
    const corrected = entry(
      "tamar",
      "2026-10-05T06:00:00Z",
      "2026-10-05T14:00:00Z",
      {
        editedBy: "omer",
        editedAt: "2026-10-06T07:00:00Z",
        createdAt: "2026-10-05T06:00:00Z",
        note: "Forgot to leave",
        outProof: "manager",
        inProof: "off",
      },
    );
    const waiting = entry(
      "tamar",
      "2026-10-01T06:00:00Z",
      "2026-10-01T14:00:00Z",
      { inProof: "none" },
    );
    const days = payDays(
      [corrected, waiting],
      "2026-10",
      TZ,
      NOW,
      (id) => (id === "omer" ? "Omer" : null),
      originalTimes([
        {
          entryId: corrected.id,
          at: "2026-10-07T07:00:00Z",
          from: {
            clockIn: "2026-10-05T06:00:00Z",
            clockOut: "2026-10-05T15:00:00Z",
          },
        },
        {
          entryId: corrected.id,
          at: "2026-10-06T07:00:00Z",
          from: { clockIn: "2026-10-05T06:00:00Z", clockOut: null },
        },
      ]),
    );
    expect(days.map((day) => day.date)).toEqual(["2026-10-01", "2026-10-05"]);
    expect(days[0]).toMatchObject({
      in: "09:00",
      out: "17:00",
      minutes: 480,
      source: "none",
      waiting: true,
      ownerOnly: false,
      correction: null,
      original: null,
    });
    expect(days[1]).toMatchObject({
      source: "manager",
      waiting: false,
      correction: { kind: "corrected", by: "Omer", note: "Forgot to leave" },
      // The first correction's times before: it was left open.
      original: { in: "09:00", out: null },
    });
  });
});
