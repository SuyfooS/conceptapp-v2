import { describe, expect, it } from "vitest";
import { instantIn } from "./availability";
import {
  NO_BUCKETS,
  type PayrollInput,
  type PayrollPerson,
  type PayrollSettings,
  payrollMonth,
  payrollRange,
} from "./payroll";
import { payrollCalendar } from "./payroll-calendar";
import {
  type ClosedReads,
  changedDays,
  closedPeople,
  closedReads,
  closedSnapshot,
  type DiffMonth,
  monthDifferences,
  readSnapshot,
  SNAPSHOT_VERSION,
} from "./payroll-diff";
import { type BusinessPlace, ISRAELI_CITIES, shabbatPlaceOf } from "./shabbat";
import type { TimeEntry } from "./time-clock";

// Closing a month (payroll P9): what it keeps, and what changed since, by the
// real hours engine, in Tel Aviv at a six-day week (plan §13's C1: Sunday
// 4 October 2026, 09:00–18:00, is 480 regular minutes and 60 at 125%).

const TZ = "Asia/Jerusalem";
const MONTH = "2026-10";
const NOA = "11111111-1111-4111-a111-111111111111";
const YOAV = "22222222-2222-4222-a222-222222222222";

const SIX: PayrollSettings = {
  workWeek: "six",
  shortDay: 4,
  restStart: "candleLighting",
  restStartTime: "14:00",
  roundToMinutes: 0,
};

const at = (date: string, time: string) =>
  instantIn(date, time, TZ).toISOString();

function entry(
  id: string,
  date: string,
  from: string,
  to: string,
  userId = NOA,
): TimeEntry {
  return {
    id,
    userId,
    clockIn: at(date, from),
    clockOut: at(date, to),
    source: "punch",
    breaks: [],
    inProof: null,
    outProof: null,
    confirmedAt: null,
    note: null,
    editedBy: null,
    editedAt: null,
    createdAt: null,
  };
}

function person(userId: string, agorot = 3800): PayrollPerson {
  return {
    userId,
    payrollNumber: "101",
    restDay: 6,
    hoursLaw: "applies",
    youthUntil: null,
    compulsoryEducation: true,
    periods: [{ startedOn: "2026-01-01", endedOn: null }],
    wages: [{ agorot, from: "2026-01-01", setAt: "2026-01-01T08:00:00Z" }],
  };
}

const range = payrollRange(MONTH);
const calendar = payrollCalendar(
  ISRAELI_CITIES.telAviv,
  range.from,
  range.to,
  SIX,
);

function october(
  entries: TimeEntry[],
  people: PayrollPerson[] = [person(NOA)],
): PayrollInput {
  return {
    month: MONTH,
    timeZone: TZ,
    now: new Date("2026-11-10T08:00:00Z"),
    entries,
    people,
    settings: SIX,
    calendar,
  };
}

const SUNDAY = "e0000000-0000-4000-8000-000000000001";
const MONDAY = "e0000000-0000-4000-8000-000000000002";

const TEL_AVIV: BusinessPlace = { timeZone: TZ, shabbatCity: "telAviv" };
const JERUSALEM: BusinessPlace = { timeZone: TZ, shabbatCity: "jerusalem" };

describe("closedSnapshot", () => {
  const closed = payrollMonth(
    october([entry(SUNDAY, "2026-10-04", "09:00", "18:00")]),
  );
  const snapshot = closedSnapshot(
    closed,
    { ...SIX, payEstimate: true, unpaidBreaks: true } as PayrollSettings,
    TEL_AVIV,
    [person(NOA)],
  );

  it("keeps the place the calendar came from, a city no list has as Tel Aviv", () => {
    expect(snapshot.place).toEqual(TEL_AVIV);
    expect(
      closedSnapshot(closed, SIX, { timeZone: TZ, shabbatCity: null }, [])
        .place,
    ).toEqual(TEL_AVIV);
    expect(
      closedSnapshot(closed, SIX, { timeZone: TZ, shabbatCity: "atlantis" }, [])
        .place,
    ).toEqual(TEL_AVIV);
  });

  it("keeps the month without any amount, the pay rules alone and the people", () => {
    expect(snapshot.version).toBe(SNAPSHOT_VERSION);
    expect(closed.people[0]?.estimateAgorot).not.toBeNull();
    expect(snapshot.month.people[0]?.estimateAgorot).toBeNull();
    expect(
      snapshot.month.people[0]?.byWage.every(
        (segment) => segment.amountAgorot === null,
      ),
    ).toBe(true);
    expect(snapshot.settings).toEqual(SIX);
    expect(snapshot.people).toEqual([person(NOA)]);
    expect(snapshot.month.engineVersion).toBe(closed.engineVersion);
  });

  it("reads back from the database as it went in", () => {
    const read = readSnapshot(JSON.parse(JSON.stringify(snapshot)));
    expect(read?.settings).toEqual(SIX);
    expect(read?.place).toEqual(TEL_AVIV);
    expect(read?.people).toEqual([person(NOA)]);
    expect(read?.month.month).toBe(MONTH);
    expect(read?.month.people[0]?.days).toEqual(
      closed.people[0]?.days.map(({ date, entryIds, minutes, buckets }) => ({
        date,
        entryIds,
        minutes,
        buckets,
      })),
    );
  });

  it("reads nothing this app didn't write", () => {
    expect(readSnapshot(null)).toBeNull();
    expect(readSnapshot("snapshot")).toBeNull();
    expect(readSnapshot({ version: 1 })).toBeNull();
    expect(
      readSnapshot({ ...JSON.parse(JSON.stringify(snapshot)), version: 2 }),
    ).toBeNull();
    expect(
      readSnapshot({
        ...JSON.parse(JSON.stringify(snapshot)),
        settings: { ...SIX, workWeek: "seven" },
      }),
    ).toBeNull();
    expect(
      readSnapshot({
        ...JSON.parse(JSON.stringify(snapshot)),
        place: { timeZone: "", shabbatCity: "telAviv" },
      }),
    ).toBeNull();
  });

  it("reads one written before the place was kept, with no place", () => {
    const { place: _kept, ...older } = JSON.parse(JSON.stringify(snapshot));
    const read = readSnapshot(older);
    expect(read).not.toBeNull();
    expect(read?.place).toBeUndefined();
  });
});

describe("monthDifferences", () => {
  const closed = payrollMonth(
    october([
      entry(SUNDAY, "2026-10-04", "09:00", "18:00"),
      entry(MONDAY, "2026-10-05", "09:00", "17:00"),
    ]),
  );

  it("gives a correction of 30 minutes on a 9-hour day as 30 more at 125% that day (plan §12.2)", () => {
    const now = payrollMonth(
      october([
        entry(SUNDAY, "2026-10-04", "09:00", "18:30"),
        entry(MONDAY, "2026-10-05", "09:00", "17:00"),
      ]),
    );
    expect(monthDifferences(closed, now)).toEqual([
      {
        userId: NOA,
        minutes: 30,
        buckets: { ...NO_BUCKETS, ot125: 30 },
        days: [
          {
            date: "2026-10-04",
            before: 540,
            now: 570,
            buckets: { ...NO_BUCKETS, ot125: 30 },
            entryIds: [SUNDAY],
          },
        ],
      },
    ]);
  });

  it("is nothing when the same shifts are worked out again", () => {
    const again = payrollMonth(
      october([
        entry(SUNDAY, "2026-10-04", "09:00", "18:00"),
        entry(MONDAY, "2026-10-05", "09:00", "17:00"),
      ]),
    );
    expect(monthDifferences(closed, again)).toEqual([]);
  });

  it("gives a shift added on a new day from nothing, and one taken away to nothing", () => {
    const added = "e0000000-0000-4000-8000-000000000003";
    const now = payrollMonth(
      october([
        entry(SUNDAY, "2026-10-04", "09:00", "18:00"),
        // Monday's shift moved out of the month, a Tuesday added.
        entry(MONDAY, "2026-11-02", "09:00", "17:00"),
        entry(added, "2026-10-06", "09:00", "13:00"),
      ]),
    );
    const [noa] = monthDifferences(closed, now);
    expect(noa?.days).toEqual([
      {
        date: "2026-10-05",
        before: 480,
        now: 0,
        buckets: { ...NO_BUCKETS, regular: -480 },
        entryIds: [MONDAY],
      },
      {
        date: "2026-10-06",
        before: 0,
        now: 240,
        buckets: { ...NO_BUCKETS, regular: 240 },
        entryIds: [added],
      },
    ]);
    expect(noa?.minutes).toBe(-240);
    expect(noa?.buckets.regular).toBe(-240);
  });

  it("gives someone new to the month, and leaves out those with no change", () => {
    const yoavDay = "e0000000-0000-4000-8000-000000000004";
    const now = payrollMonth(
      october(
        [
          entry(SUNDAY, "2026-10-04", "09:00", "18:00"),
          entry(MONDAY, "2026-10-05", "09:00", "17:00"),
          entry(yoavDay, "2026-10-07", "10:00", "14:00", YOAV),
        ],
        [person(NOA), person(YOAV)],
      ),
    );
    const differences = monthDifferences(closed, now);
    expect(differences.map((one) => one.userId)).toEqual([YOAV]);
    expect(differences[0]?.days[0]).toMatchObject({
      date: "2026-10-07",
      before: 0,
      now: 240,
    });
    expect(changedDays(differences)).toBe(1);
  });

  it("leaves out a day of another month", () => {
    const month = (minutes: number): DiffMonth => ({
      month: MONTH,
      people: [
        {
          userId: NOA,
          days: [
            {
              date: "2026-11-01",
              entryIds: [],
              minutes,
              buckets: { ...NO_BUCKETS, regular: minutes },
            },
          ],
        },
      ],
    });
    expect(monthDifferences(month(60), month(120))).toEqual([]);
  });
});

describe("closedPeople", () => {
  it("works the month out again with each person as it closed, and anyone new as now", () => {
    const then = { people: [person(NOA, 3800)] };
    expect(closedPeople(then, [person(NOA, 4500), person(YOAV)])).toEqual([
      person(NOA, 3800),
      person(YOAV),
    ]);
  });
});

// The path the pay screen and the next month's file take (`currentClosedMonth`
// in app/(app)/clock/pay/pay-month.ts): the snapshot read back from the
// database, the month worked out again with `closedReads`, its calendar for
// the place it gives, as `payrollInputOf` makes it.
describe("working a closed month out again", () => {
  const FRIDAY = "e0000000-0000-4000-8000-000000000005";
  // Friday 9 October 2026 across candle lighting: Tel Aviv's comes 20 minutes
  // before sunset, Jerusalem's 40, so the rest starts earlier there.
  const shifts = [
    entry(SUNDAY, "2026-10-04", "09:00", "18:00"),
    entry(FRIDAY, "2026-10-09", "15:00", "22:00"),
  ];

  function workedOut(entries: TimeEntry[], reads: ClosedReads) {
    return payrollMonth({
      month: MONTH,
      timeZone: reads.place.timeZone,
      now: new Date("2026-11-20T08:00:00Z"),
      entries,
      people: reads.people,
      settings: reads.settings,
      calendar: payrollCalendar(
        shabbatPlaceOf(reads.place),
        range.from,
        range.to,
        reads.settings,
      ),
    });
  }

  const closed = workedOut(shifts, {
    place: TEL_AVIV,
    settings: SIX,
    people: [person(NOA)],
  });
  const stored = JSON.parse(
    JSON.stringify(closedSnapshot(closed, SIX, TEL_AVIV, [person(NOA)])),
  );
  // Since it closed: a new wage, and the business moved to Jerusalem. None of
  // it is an hour. (The settings now are never read: `closedReads` takes the
  // snapshot's.)
  const current = { place: JERUSALEM, people: [person(NOA, 4500)] };

  it("gives no difference when only the settings, a wage and the city changed", () => {
    const read = readSnapshot(stored);
    if (!read) throw new Error("the snapshot didn't read back");
    const reads = closedReads(read, current);
    expect(reads.place).toEqual(TEL_AVIV);
    expect(reads.settings).toEqual(SIX);
    expect(reads.people).toEqual([person(NOA)]);
    expect(monthDifferences(read.month, workedOut(shifts, reads))).toEqual([]);
  });

  it("gives a correction as the only difference", () => {
    const read = readSnapshot(stored);
    if (!read) throw new Error("the snapshot didn't read back");
    const corrected = [
      entry(SUNDAY, "2026-10-04", "09:00", "18:30"),
      entry(FRIDAY, "2026-10-09", "15:00", "22:00"),
    ];
    const differences = monthDifferences(
      read.month,
      workedOut(corrected, closedReads(read, current)),
    );
    expect(differences.flatMap((one) => one.days.map((d) => d.date))).toEqual([
      "2026-10-04",
    ]);
  });

  it("would move Friday's minutes between rates with the city now", () => {
    const read = readSnapshot(stored);
    if (!read) throw new Error("the snapshot didn't read back");
    const leaked = workedOut(shifts, {
      ...closedReads(read, current),
      place: JERUSALEM,
    });
    const [noa] = monthDifferences(read.month, leaked);
    expect(noa?.days.map((one) => one.date)).toEqual(["2026-10-09"]);
    expect(noa?.minutes).toBe(0);
    expect(noa?.buckets.regular).toBeLessThan(0);
  });

  it("takes the place now for a snapshot that kept none", () => {
    const { place: _kept, ...older } = stored;
    const read = readSnapshot(older);
    if (!read) throw new Error("the snapshot didn't read back");
    expect(closedReads(read, current).place).toEqual(JERUSALEM);
  });
});
