// Mock rows for the pay screens' demo: October 2026 at the demo restaurant,
// to the minute, with each person's hourly wage. They stand in for database
// data (names, the reasons and notes a manager wrote), so their Hebrew stays
// here; tooling/hebrew-literals.ts allows this file.

import { addDays, weekdayOf } from "@domain/availability";
import {
  addTotals,
  NO_PAY_TOTALS,
  type PayDay,
  type PayTotals,
} from "@domain/pay-month";
import {
  firstOfMonth,
  monthWage,
  type WageRow,
  wageFromBounds,
  wageHistory,
  wageNow,
} from "@domain/wages";
import type { PayHomeData } from "../../../../(app)/clock/pay/pay";
import type {
  PayMonthData,
  PayPaths,
  PayPerson,
  PayPersonData,
  PersonWage,
} from "../../../../(app)/clock/pay/pay-types";
import { portraits } from "../../../portraits";

const MONTH = "2026-10";
const CURRENT = "2026-11";
/** The demo's today: wages are shown as they stand on it. */
const TODAY = "2026-11-10";

export const demoPayPaths: PayPaths = {
  pay: "/design/shell/clock/pay",
  team: "/design/shell/clock/team",
  clock: "/design/shell/clock",
};

let next = 0;
const id = () => {
  next += 1;
  return `69000000-0000-4000-a000-${String(next).padStart(12, "0")}`;
};

/** A usual month: Sunday to Thursday, but the weekday off, 09:00–17:00 with half an hour off. */
function usualDays(dayOff: number, more: Record<string, Partial<PayDay>> = {}) {
  const days: PayDay[] = [];
  for (
    let date = `${MONTH}-01`;
    date.startsWith(MONTH);
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
  wage: monthWage(
    wages[userId] ?? [],
    MONTH,
    days.map((day) => day.date),
  ),
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

/**
 * Everyone's October, with Noa beside the list on a tablet unless asked;
 * `show` "noWage" lists only those whose shifts have no wage.
 */
export function demoPayMonth(person?: string, show?: string): PayMonthData {
  const filter = show === "noWage" && noWage > 0 ? "noWage" : null;
  const shown = filter ? people.filter((row) => row.wage?.missing) : people;
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
      rounding: false,
    },
    filter,
    selected:
      shown.find((row) => row.userId === person)?.userId ??
      shown[0]?.userId ??
      null,
    back: "team",
    fixes: true,
  };
}

/** One person's October, from the same days as their row. */
export function demoPayPerson(userId: string): PayPersonData | null {
  const row = people.find((one) => one.userId === userId);
  if (!row) return null;
  const { days, totals, wage: monthWageOf, ...who } = row;
  return {
    person: who,
    month: MONTH,
    currentMonth: CURRENT,
    totals,
    days,
    monthWage: monthWageOf,
    wage: personWage(userId),
    fixes: true,
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
    rounding: false,
  },
  earlier: demoPayHome.earlier.map((month) => ({ ...month, minutes: 0 })),
};
