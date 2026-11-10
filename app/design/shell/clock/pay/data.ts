// Mock rows for the pay screens' demo: October 2026 at the demo restaurant,
// to the minute, with each person's hourly wage and details for payroll, run
// through the real hours engine (payroll P7) with the three months before for
// holiday pay. They stand in for database data (names, the reasons and notes a
// manager wrote), so their Hebrew stays here; tooling/hebrew-literals.ts
// allows this file.

import { addDays, instantIn, weekdayOf } from "@domain/availability";
import { payrollHistory } from "@domain/holiday-pay";
import {
  addTotals,
  NO_PAY_TOTALS,
  type PayDay,
  type PayTotals,
} from "@domain/pay-month";
import {
  monthEstimate,
  ownMonthOf,
  personRates,
  remarkLines,
  restNameOfAll,
  toCheckOf,
  weeksWorkedOut,
} from "@domain/pay-rates";
import {
  type PayrollMonth,
  type PayrollSettings,
  payrollMonth,
  payrollPersonOf,
  payrollRange,
  personPayroll,
  withoutAmounts,
} from "@domain/payroll";
import { payrollCalendar } from "@domain/payroll-calendar";
import {
  currentPeriod,
  DEFAULT_DETAILS,
  type EmploymentPeriod,
  type PayrollDetails,
  wageFloorOf,
} from "@domain/payroll-details";
import { shabbatPlaceOf } from "@domain/shabbat";
import type { ShiftRecord, TimeEntry } from "@domain/time-clock";
import {
  firstOfMonth,
  monthWage,
  type WageRow,
  wageFromBounds,
  wageHistory,
  wageNow,
} from "@domain/wages";
import { youthLabel } from "@domain/youth";
import type { OwnPay } from "../../../../(app)/clock/clock-types";
import type { PayHomeData } from "../../../../(app)/clock/pay/pay";
import type {
  PayMonthData,
  PayPaths,
  PayPerson,
  PayPersonData,
  PersonDetails,
  PersonWage,
} from "../../../../(app)/clock/pay/pay-types";
import { portraits } from "../../../portraits";
import { business } from "../../data";

const MONTH = "2026-10";
const CURRENT = "2026-11";
/** The demo's today: wages are shown as they stand on it. */
const TODAY = "2026-11-10";
/** And its now, for the hours engine: a fixed moment, so the demo never changes. */
const NOW = new Date("2026-11-10T10:00:00.000Z");
const TIME_ZONE = "Asia/Jerusalem";
/** The demo restaurant is in Tel Aviv, and hasn't set its work week. */
const PLACE = { shabbatCity: "telAviv", timeZone: TIME_ZONE };
const SETTINGS: PayrollSettings = {
  workWeek: "unset",
  shortDay: 4,
  restStart: "candleLighting",
  restStartTime: "14:00",
  roundToMinutes: 0,
};

export const demoPayPaths: PayPaths = {
  pay: "/design/shell/clock/pay",
  team: "/design/shell/clock/team",
  clock: "/design/shell/clock",
  settings: "/design/shell/manage/time_clock",
};

let next = 0;
const id = () => {
  next += 1;
  return `69000000-0000-4000-a000-${String(next).padStart(12, "0")}`;
};

/** A usual month: Sunday to Thursday, but the weekday off, 09:00–17:00 with half an hour off. */
function usualDays(
  dayOff: number,
  more: Record<string, Partial<PayDay>> = {},
  month = MONTH,
) {
  const days: PayDay[] = [];
  for (
    let date = `${month}-01`;
    date.startsWith(month);
    date = addDays(date, 1)
  ) {
    const weekday = weekdayOf(date);
    const changed = more[date];
    if ((weekday > 4 || weekday === dayOff) && !changed) continue;
    days.push({
      id: id(),
      date,
      in: "09:00",
      out: "17:00",
      minutes: 450,
      unpaidBreakMinutes: 30,
      source: "off",
      correction: null,
      original: null,
      waiting: false,
      ownerOnly: false,
      ...changed,
    });
  }
  return days;
}

function totalsOf(days: readonly PayDay[]): PayTotals {
  return {
    ...NO_PAY_TOTALS,
    minutes: days.reduce((sum, day) => sum + day.minutes, 0),
    days: new Set(days.map((day) => day.date)).size,
    shifts: days.length,
    unpaidBreakMinutes: days.reduce(
      (sum, day) => sum + day.unpaidBreakMinutes,
      0,
    ),
    corrected: days.filter((day) => day.correction !== null).length,
    waiting: days.filter((day) => day.waiting).length,
    ownerOnly: days.filter((day) => day.ownerOnly).length,
    open: days.filter((day) => day.out === null).length,
  };
}

const URI = "69000000-0000-4000-a000-0000000000a1";
const SHIRAN = "69000000-0000-4000-a000-0000000000a2";
/** Who set the demo's wages, by id. */
const setters: Record<string, string> = {
  [URI]: "אורי הדגמה",
  [SHIRAN]: "שירן הדגמה",
};

const wage = (
  id: string,
  agorot: number,
  from: string,
  setAt: string,
  setBy: string | null,
  note: string | null = null,
): WageRow => ({ id, agorot, from, setAt, setBy, note });

/** Each person's wages, as the database would give them. */
const wages: Record<string, WageRow[]> = {
  // A typo fixed the same day, and a raise set for December.
  noa: [
    wage("w-noa-1", 3880, "2026-10-01", "2026-09-28T07:00:00.000Z", URI),
    wage(
      "w-noa-2",
      3800,
      "2026-10-01",
      "2026-09-28T07:05:00.000Z",
      URI,
      "תיקון הקלדה",
    ),
    wage("w-noa-3", 4000, "2026-12-01", "2026-11-08T08:00:00.000Z", URI),
  ],
  shiran: [
    wage("w-shiran", 4500, "2026-09-01", "2026-08-30T08:00:00.000Z", URI),
  ],
  // A raise in the middle of October.
  yoav: [
    wage("w-yoav-1", 3600, "2026-09-01", "2026-08-30T08:00:00.000Z", URI),
    wage(
      "w-yoav-2",
      3800,
      "2026-10-15",
      "2026-10-14T08:00:00.000Z",
      SHIRAN,
      "העלאה אחרי חצי שנה",
    ),
  ],
  // She left before anyone set hers: her October has nothing to pay it by.
  maya: [],
};

/** Each person's details for payroll, as the database would give them. */
const details: Record<string, PayrollDetails> = {
  shiran: { ...DEFAULT_DETAILS, payrollNumber: "101" },
  noa: { ...DEFAULT_DETAILS, payrollNumber: "102" },
  // He asked to rest on Friday.
  yoav: { ...DEFAULT_DETAILS, payrollNumber: "103", restDay: 5 },
  // A minor at school, 17 until April, still without a number.
  maya: { ...DEFAULT_DETAILS, youthUntil: "2027-04-15" },
};

const period = (
  id: string,
  startedOn: string,
  endedOn: string | null,
  source: EmploymentPeriod["source"],
  lastPaidOn: string | null = null,
): EmploymentPeriod => ({ id, startedOn, endedOn, lastPaidOn, source });

/** Each person's periods of work, oldest first. */
const periods: Record<string, EmploymentPeriod[]> = {
  shiran: [period("p-shiran", "2025-09-01", null, "set")],
  // Copied from when she joined the app, for someone to check.
  noa: [period("p-noa", "2026-03-01", null, "joined")],
  // He worked here before, and came back in August.
  yoav: [
    period("p-yoav-1", "2024-06-01", "2024-12-31", "set", "2025-01-10"),
    period("p-yoav-2", "2026-08-10", null, "set"),
  ],
  maya: [period("p-maya", "2026-03-01", "2026-10-19", "set")],
};

const detailsOfDemo = (userId: string) => details[userId] ?? DEFAULT_DETAILS;

const person = (
  userId: string,
  name: string,
  form: PayPerson["form"],
  days: PayDay[],
  more: Partial<PayPerson> = {},
): PayPerson => ({
  userId,
  name,
  photo: null,
  form,
  former: false,
  totals: totalsOf(days),
  days,
  // Filled in from the hours engine below.
  rates: null,
  wage: monthWage(
    wages[userId] ?? [],
    MONTH,
    days.map((day) => day.date),
  ),
  payrollNumber: detailsOfDemo(userId).payrollNumber,
  // Shifts and no number: everyone here is on the staff, and nobody an owner.
  noNumber:
    totalsOf(days).shifts > 0 && detailsOfDemo(userId).payrollNumber === null,
  minor: youthLabel(detailsOfDemo(userId).youthUntil, TODAY) !== null,
  ...more,
});

/** The person page's wage, as it stands on the demo's today. */
function personWage(userId: string): PersonWage {
  const rows = wages[userId] ?? [];
  const { earliest, latest } = wageFromBounds(TODAY);
  return {
    ...wageNow(rows, TODAY),
    history: wageHistory(rows).map((row) => ({
      ...row,
      setByName: row.setBy ? (setters[row.setBy] ?? null) : null,
      setOn: row.setAt.slice(0, 10),
    })),
    can: "set",
    today: TODAY,
    from: { initial: firstOfMonth(TODAY), earliest, latest },
    youthUntil: detailsOfDemo(userId).youthUntil,
    startsOn: wageFloorOf(periods[userId] ?? []),
  };
}

/** The person page's details, as their owner reads them on the demo's today. */
function personDetails(userId: string): PersonDetails {
  const own = periods[userId] ?? [];
  return {
    details: detailsOfDemo(userId),
    periods: own,
    current: currentPeriod(own, TODAY),
    can: "set",
    birth: true,
    today: TODAY,
  };
}

const people: PayPerson[] = [
  person(
    "noa",
    "נועה כהן",
    "f",
    usualDays(1, {
      // She forgot to leave; the manager set the time the next morning.
      "2026-10-05": {
        minutes: 450,
        source: "manager",
        correction: {
          kind: "corrected",
          by: "שירן הדגמה",
          note: "שכחה לצאת",
        },
        original: { in: "09:00", out: null },
      },
    }),
  ),
  person(
    "shiran",
    "שירן הדגמה",
    "f",
    usualDays(0, {
      // Hours she set for herself, for the owner to confirm.
      "2026-10-14": { source: "self", waiting: true, ownerOnly: true },
      // She forgot to leave, and nobody has closed it yet: the hours count it
      // up to the most an entry can be (24 hours), the rates not until it
      // ends.
      "2026-10-29": { out: null, minutes: 24 * 60, unpaidBreakMinutes: 0 },
    }),
    { photo: portraits.shiran },
  ),
  person(
    "yoav",
    "יואב לוי",
    "m",
    usualDays(2, {
      // A night, and a morning clocked in without a code.
      "2026-10-29": {
        in: "22:00",
        out: "06:30",
        minutes: 510,
        unpaidBreakMinutes: 0,
      },
      "2026-10-14": { source: "none", waiting: true },
    }),
    { photo: portraits.yoav },
  ),
  person(
    "maya",
    "מאיה פרץ",
    "f",
    usualDays(3).filter((day) => day.date < "2026-10-20"),
    { former: true, photo: portraits.maya },
  ),
];

const all = addTotals(people.map((row) => row.totals));
const noWage = people.filter((row) => row.wage?.missing).length;
const noNumber = people.filter((row) => row.noNumber).length;

const at = (date: string, time: string) =>
  instantIn(date, time, TIME_ZONE).toISOString();

/** A shift of the demo as the clock would have recorded it, for the hours engine. */
function entryOf(userId: string, day: PayDay): TimeEntry {
  const ends =
    day.out === null
      ? null
      : day.out <= day.in
        ? addDays(day.date, 1)
        : day.date;
  return {
    id: day.id,
    userId,
    clockIn: at(day.date, day.in),
    clockOut: day.out === null || ends === null ? null : at(ends, day.out),
    source: "punch",
    breaks:
      day.unpaidBreakMinutes > 0
        ? [
            {
              id: `${day.id.slice(0, -3)}b00`,
              startedAt: at(day.date, "13:00"),
              endedAt: at(day.date, "13:30"),
              unpaid: true,
            },
          ]
        : [],
    inProof:
      day.source === "none" ? "none" : day.source === "self" ? "self" : "off",
    outProof: day.source === "manager" ? "manager" : "off",
    confirmedAt: null,
    note: day.correction?.note ?? null,
    editedBy: day.correction ? SHIRAN : null,
    editedAt: day.correction ? at(addDays(day.date, 1), "10:00") : null,
    createdAt: null,
  };
}

/** Whether the demo person worked here on a day, by their periods. */
const employedOn = (userId: string, date: string) =>
  (periods[userId] ?? []).some(
    (one) =>
      one.startedOn <= date && (one.endedOn === null || date <= one.endedOn),
  );

/**
 * The three months before October, as each person usually worked them, for
 * holiday pay's average: the same weekday off as in October, while employed.
 */
const usualDayOff: Record<string, number> = {
  noa: 1,
  shiran: 0,
  yoav: 2,
  maya: 3,
};
const historyEntries: TimeEntry[] = Object.entries(usualDayOff).flatMap(
  ([userId, dayOff]) =>
    ["2026-07", "2026-08", "2026-09"]
      .flatMap((month) => usualDays(dayOff, {}, month))
      .filter((day) => employedOn(userId, day.date))
      .map((day) => entryOf(userId, day)),
);
const entries = [
  ...historyEntries,
  ...people.flatMap((row) => row.days.map((day) => entryOf(row.userId, day))),
];

/** The engine's input for a month of the demo, for some of its people. */
function demoInput(
  month: string,
  of: readonly string[],
  more: TimeEntry[] = [],
) {
  const range = payrollRange(month);
  const read = [...entries, ...more].filter((entry) =>
    of.includes(entry.userId),
  );
  return {
    month,
    timeZone: TIME_ZONE,
    now: NOW,
    entries: read,
    people: of.map((userId) =>
      payrollPersonOf(
        userId,
        details[userId],
        periods[userId] ?? [],
        wages[userId] ?? [],
      ),
    ),
    settings: SETTINGS,
    calendar: payrollCalendar(
      shabbatPlaceOf(PLACE),
      range.from,
      range.to,
      SETTINGS,
    ),
    history: payrollHistory(read, month, TIME_ZONE, NOW),
  };
}

/**
 * October by the hours engine: Shmini Atzeret on a Saturday, election day on
 * the 27th (Yoav's day off, so it is paid; the others worked it), Yoav's night
 * inside his Friday rest, Maya a minor with a short break every day, and
 * Shiran's shift left open on the 29th, which the rates leave out.
 */
const ENGINE: PayrollMonth = payrollMonth(
  demoInput(
    MONTH,
    people.map((row) => row.userId),
  ),
);

/** The engine's month, or as while a business's estimate is off, without its amounts. */
const engineOf = (amounts: boolean) =>
  amounts ? ENGINE : withoutAmounts(ENGINE);

/** `?estimate=off` shows the screens as a business sees them before the team turns amounts on. */
const amountsFrom = (estimate: string | undefined) => estimate !== "off";

/** Everyone's rows with their month by rate. */
function peopleWithRates(amounts: boolean): PayPerson[] {
  const engine = engineOf(amounts);
  return people.map((row) => {
    const month = engine.people.find((one) => one.userId === row.userId);
    return {
      ...row,
      rates: month
        ? personRates(month, detailsOfDemo(row.userId).restDay)
        : null,
    };
  });
}

/** The month's estimate, as the app adds it: who has no wage is left out and counted. */
const demoEstimate = (engine: PayrollMonth) =>
  monthEstimate(
    engine.people.map((one) => ({
      estimateAgorot: one.estimateAgorot,
      missing:
        one.estimateAgorot === null &&
        one.flags.some((flag) => flag.code === "noWage"),
    })),
  );

/** The accent card's remarks, as the app names them. */
function demoRemarks(
  rows: readonly PayPerson[],
  engine: PayrollMonth,
): PayMonthData["remarks"] {
  const { lines, rest } = remarkLines(
    rows.map((row) => ({
      userId: row.userId,
      remarks: row.rates?.remarks ?? [],
      holidayPay: row.rates?.holidayPay ?? [],
    })),
    5,
  );
  return {
    lines: lines.map((line) => ({
      ...line,
      name: rows.find((row) => row.userId === line.userId)?.name ?? null,
    })),
    rest,
    total: engine.people.reduce((sum, one) => sum + toCheckOf(one), 0),
  };
}

/**
 * Everyone's October, with Noa beside the list on a tablet unless asked;
 * `show` "noWage" lists only those whose shifts have no wage, "noNumber"
 * those with no payroll number; `estimate` "off" leaves out every amount.
 */
export function demoPayMonth(
  person?: string,
  show?: string,
  estimate?: string,
): PayMonthData {
  const amounts = amountsFrom(estimate);
  const engine = engineOf(amounts);
  const everyone = peopleWithRates(amounts);
  const filter =
    show === "noWage" && noWage > 0
      ? "noWage"
      : show === "noNumber" && noNumber > 0
        ? "noNumber"
        : null;
  const shown =
    filter === "noWage"
      ? everyone.filter((row) => row.wage?.missing)
      : filter === "noNumber"
        ? everyone.filter((row) => row.noNumber)
        : everyone;
  return {
    month: MONTH,
    currentMonth: CURRENT,
    minutes: all.minutes,
    people: shown,
    counts: {
      withHours: people.filter((row) => row.totals.shifts > 0).length,
      toCheck: all.waiting + all.open,
    },
    before: {
      ownerOnly: all.ownerOnly,
      waiting: all.waiting - all.ownerOnly,
      open: all.open,
      corrected: all.corrected,
      noWage,
      noNumber,
      rounding: false,
    },
    filter,
    selected:
      shown.find((row) => row.userId === person)?.userId ??
      shown[0]?.userId ??
      null,
    back: "team",
    fixes: true,
    amounts,
    estimate: amounts ? demoEstimate(engine) : null,
    remarks: demoRemarks(shown, engine),
    restName: restNameOfAll(
      everyone.flatMap((row) => (row.rates ? [row.rates.restDay] : [])),
    ),
  };
}

/** One person's October, from the same days as their row; `estimate` "off" leaves out every amount. */
export function demoPayPerson(
  userId: string,
  estimate?: string,
): PayPersonData | null {
  const amounts = amountsFrom(estimate);
  const row = peopleWithRates(amounts).find((one) => one.userId === userId);
  if (!row) return null;
  const {
    days,
    totals,
    wage: monthWageOf,
    payrollNumber: _number,
    noNumber: _noNumber,
    minor: _minor,
    rates,
    ...who
  } = row;
  return {
    person: who,
    month: MONTH,
    currentMonth: CURRENT,
    totals,
    days,
    monthWage: monthWageOf,
    wage: personWage(userId),
    details: personDetails(userId),
    fixes: true,
    rates,
    amounts,
    weeks: weeksWorkedOut(ENGINE.notes, userId),
    stale: false,
    // The demo's reader is the owner: the note leads to the clock's settings.
    setsWeek: true,
  };
}

export const demoPayPeople = people.map((row) => row.userId);

/** The demo's accountant, who does the restaurant's books. */
export const demoAccountantName = "גלית הדגמה";

/** The accountant's Home: October to pay, and the three months before. */
export const demoPayHome: PayHomeData = {
  month: MONTH,
  minutes: all.minutes,
  people: people.length,
  toCheck: all.waiting + all.open,
  before: demoPayMonth().before,
  earlier: [
    { month: "2026-09", minutes: 108_735 },
    { month: "2026-08", minutes: 112_410 },
    { month: "2026-07", minutes: 104_220 },
  ],
  estimate: demoEstimate(ENGINE),
  remarks: demoRemarks(peopleWithRates(true), ENGINE).total,
};

/** The same Home before the team turns the business's amounts on. */
export const demoPayHomeNoAmounts: PayHomeData = {
  ...demoPayHome,
  estimate: null,
};

/**
 * The same Home once every shift is approved and closed, with the hours
 * engine's remarks still to check: the hero says those, not "אין מה לבדוק".
 */
export const demoPayHomeChecked: PayHomeData = {
  ...demoPayHome,
  toCheck: 0,
  before: { ...demoPayHome.before, ownerOnly: 0, waiting: 0, open: 0 },
};

/** The same Home in a business whose clock has no hours yet. */
export const demoPayHomeEmpty: PayHomeData = {
  month: MONTH,
  minutes: 0,
  people: 0,
  toCheck: 0,
  before: {
    ownerOnly: 0,
    waiting: 0,
    open: 0,
    corrected: 0,
    noWage: 0,
    noNumber: 0,
    rounding: false,
  },
  earlier: demoPayHome.earlier.map((month) => ({ ...month, minutes: 0 })),
  estimate: null,
  remarks: 0,
};

/** A shift on the clock demo as the clock recorded it: its break after four hours. */
function recordEntry(userId: string, record: ShiftRecord): TimeEntry {
  const clockIn = instantIn(record.date, record.in, TIME_ZONE);
  const ends =
    record.out !== null && record.out <= record.in
      ? addDays(record.date, 1)
      : record.date;
  const pause = clockIn.getTime() + 4 * 3_600_000;
  return {
    id: record.id,
    userId,
    clockIn: clockIn.toISOString(),
    clockOut:
      record.out === null
        ? null
        : instantIn(ends, record.out, TIME_ZONE).toISOString(),
    source: "punch",
    breaks:
      record.breakMinutes > 0
        ? [
            {
              id: `${record.id.slice(0, -3)}b00`,
              startedAt: new Date(pause).toISOString(),
              endedAt: new Date(
                pause + record.breakMinutes * 60_000,
              ).toISOString(),
              unpaid: true,
            },
          ]
        : [],
    inProof: "off",
    outProof: "off",
    confirmedAt: null,
    note: null,
    editedBy: null,
    editedAt: null,
    createdAt: null,
  };
}

/** The shift Noa is in on the clock demo while she is at work: since 08:00 on the demo's today. */
const runningEntry = (userId: string): TimeEntry => ({
  id: "68000000-0000-4000-a000-000000000016",
  userId,
  clockIn: instantIn(TODAY, "08:00", TIME_ZONE).toISOString(),
  clockOut: null,
  source: "punch",
  breaks: [],
  inProof: "off",
  outProof: null,
  confirmedAt: null,
  note: null,
  editedBy: null,
  editedAt: null,
  createdAt: null,
});

/**
 * Noa's own month on the clock demo, by the same engine: the clock's shifts
 * of `month`, her October and the months before for holiday pay, her wage
 * and details, and with `open` the shift she is in, which the engine counts
 * once it ends. Null with `estimate` "off", as the clock shows nothing then.
 */
export function demoOwnPay(
  records: readonly ShiftRecord[],
  month: string,
  estimate?: string,
  open = false,
): OwnPay | null {
  if (!amountsFrom(estimate)) return null;
  const own = [
    ...records
      .filter((record) => record.out !== null)
      .map((record) => recordEntry("noa", record)),
    ...(open ? [runningEntry("noa")] : []),
  ];
  const result = personPayroll(demoInput(month, ["noa"], own), "noa");
  if (!result) return null;
  return {
    month,
    restDay: detailsOfDemo("noa").restDay,
    business: business.name,
    form: "f",
    ...ownMonthOf(result),
  };
}
