import type { ShiftRecord } from "@domain/time-clock";
import type {
  PersonHoursData,
  TeamHoursData,
} from "../../../../(app)/clock/team/team-types";
import { demoRecords } from "../data";

const NOA = "noa";
const YOAV = "yoav";
const SHIRAN = "shiran";
const MONTH = "2026-11";
const TODAY = "2026-11-06";
const OVERDUE_ENTRY = "68000000-0000-4000-a000-000000000021";

export const demoTeamPaths = {
  clock: "/design/shell/clock",
  team: "/design/shell/clock/team",
  code: "/design/shell/clock/code",
};

const shift = (
  id: number,
  date: string,
  times: { in: string; out: string | null; minutes: number },
  more: Partial<ShiftRecord> = {},
): ShiftRecord => ({
  id: `68000000-0000-4000-a000-0000000001${String(id).padStart(2, "0")}`,
  date,
  ...times,
  breakMinutes: 0,
  byManager: false,
  overdue: false,
  attendance: null,
  correction: null,
  ...more,
});

/**
 * Each person's shifts this month, newest first. The team list and its totals
 * are summed from these, so a person's page and their row always agree.
 */
const demoPeople: {
  userId: string;
  name: string;
  records: ShiftRecord[];
}[] = [
  {
    userId: YOAV,
    name: "יואב לוי",
    records: [
      // At work now, on a break, clocked in without a code: it waits.
      shift(
        1,
        TODAY,
        { in: "09:14", out: null, minutes: 166 },
        { attendance: { how: "none", pending: true } },
      ),
      // Corrected, recorded by a manager and corrected since, and recorded
      // by a manager: each with who and why.
      shift(
        2,
        "2026-11-05",
        { in: "16:00", out: "23:30", minutes: 420 },
        {
          breakMinutes: 30,
          correction: {
            kind: "corrected",
            by: "שירן הדגמה",
            note: "נשאר לסגור את הבר",
          },
        },
      ),
      shift(
        3,
        "2026-11-03",
        { in: "16:05", out: "23:10", minutes: 425 },
        {
          byManager: true,
          correction: {
            kind: "corrected",
            by: "שירן הדגמה",
            note: "נשאר לעזור במטבח",
          },
        },
      ),
      shift(
        4,
        "2026-11-01",
        { in: "16:00", out: "22:45", minutes: 405 },
        {
          byManager: true,
          correction: {
            kind: "added",
            by: "שירן הדגמה",
            note: "שכח להחתים כניסה",
          },
        },
      ),
    ],
  },
  {
    userId: NOA,
    name: "נועה כהן",
    records: [
      ...demoRecords.filter((record) => record.date === "2026-11-05"),
      // Left open since the evening of the 4th: only a manager can close it.
      {
        id: OVERDUE_ENTRY,
        date: "2026-11-04",
        in: "16:00",
        out: null,
        minutes: 24 * 60,
        breakMinutes: 0,
        byManager: false,
        overdue: true,
        attendance: null,
        correction: null,
      },
      ...demoRecords.filter((record) => record.date < "2026-11-04"),
    ],
  },
  {
    userId: SHIRAN,
    name: "שירן הדגמה",
    records: [
      // At work now, with the code's digits.
      shift(
        5,
        TODAY,
        { in: "08:02", out: null, minutes: 238 },
        { attendance: { how: "typed", pending: false } },
      ),
      shift(6, "2026-11-04", { in: "08:00", out: "16:02", minutes: 482 }),
      shift(7, "2026-11-02", { in: "07:58", out: "15:30", minutes: 452 }),
    ],
  },
];

const sum = (records: ShiftRecord[], key: "minutes" | "breakMinutes") =>
  records.reduce((total, record) => total + record[key], 0);

const people = demoPeople.map((person) => ({
  userId: person.userId,
  name: person.name,
  former: false,
  minutes: sum(person.records, "minutes"),
  shifts: person.records.length,
  breakMinutes: sum(person.records, "breakMinutes"),
}));

export const demoTeamHours: TeamHoursData = {
  month: MONTH,
  currentMonth: MONTH,
  minutes: people.reduce((total, person) => total + person.minutes, 0),
  shifts: people.reduce((total, person) => total + person.shifts, 0),
  required: true,
  showCode: true,
  viewOnly: false,
  toConfirm: [
    {
      entryId: "68000000-0000-4000-a000-000000000031",
      userId: YOAV,
      name: "יואב לוי",
      date: "2026-11-05",
      what: "in",
      time: "09:14",
    },
    {
      entryId: "68000000-0000-4000-a000-000000000032",
      userId: NOA,
      name: "נועה כהן",
      date: "2026-11-04",
      what: "both",
      time: "16:00–23:42",
    },
  ],
  atWork: [
    {
      userId: SHIRAN,
      name: "שירן הדגמה",
      since: "08:02",
      onBreak: false,
      month: MONTH,
      attendance: { how: "typed", pending: false },
    },
    {
      userId: YOAV,
      name: "יואב לוי",
      since: "09:14",
      onBreak: true,
      month: MONTH,
      attendance: { how: "none", pending: true },
    },
  ],
  overdue: [
    {
      entryId: OVERDUE_ENTRY,
      userId: NOA,
      name: "נועה כהן",
      date: "2026-11-04",
      in: "16:00",
    },
  ],
  people,
};

/** One person's month, from the same shifts as their row in the team list. */
export function demoPersonHours(userId: string): PersonHoursData | null {
  const person = demoPeople.find((row) => row.userId === userId);
  if (!person) return null;
  return {
    person: { userId: person.userId, name: person.name },
    month: MONTH,
    currentMonth: MONTH,
    minutes: sum(person.records, "minutes"),
    records: person.records,
    today: TODAY,
    viewOnly: false,
  };
}
