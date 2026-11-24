import type { AbsenceFailure } from "@domain/absences";
import type { BreakRecord, ShiftRecord } from "@domain/time-clock";
import type {
  AbsenceRow,
  AwayTodayRow,
  EntryTarget,
  PersonHoursData,
  TeamHoursData,
  TeamStations,
} from "../../../../(app)/clock/team/team-types";
import { demoRecords } from "../data";

const NOA = "noa";
const YOAV = "yoav";
const SHIRAN = "shiran";
const MONTH = "2026-11";
const TODAY = "2026-11-06";
const OVERDUE_ENTRY = "68000000-0000-4000-a000-000000000021";

/**
 * Yoav's evening recorded twice, its copy cancelled (`shift(8, …)` below): it
 * can't come back over the one left, which the demo's stand-in says as the
 * app does.
 */
export const DEMO_OVERLAPPING_COPY = "68000000-0000-4000-a000-000000000108";

export const demoTeamPaths = {
  clock: "/design/shell/clock",
  team: "/design/shell/clock/team",
  code: "/design/shell/clock/code",
  pay: "/design/shell/clock/pay",
};

/**
 * Noa clocked in by mistake on a day off, and a manager cancelled it while it
 * was still open: no end of its own, counted for nothing. Her history on the
 * clock demo shows it too, as she reads it.
 */
export const demoCancelledShift: ShiftRecord = {
  id: "68000000-0000-4000-a000-000000000017",
  date: "2026-11-03",
  in: "08:00",
  out: null,
  minutes: 0,
  breakMinutes: 0,
  byManager: false,
  overdue: false,
  attendance: null,
  correction: null,
  cancelled: {
    by: "שירן הדגמה",
    date: "2026-11-03",
    time: "08:20",
    note: "נכנסה בטעות ביום חופש",
  },
  breaks: [],
};

/** Noa's shifts on the clock demo, newest first, with the one cancelled. */
export const demoNoaRecords: ShiftRecord[] = [
  ...demoRecords.filter((record) => record.date > demoCancelledShift.date),
  demoCancelledShift,
  ...demoRecords.filter((record) => record.date < demoCancelledShift.date),
];

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
  cancelled: null,
  breaks: [],
  ...more,
});

/** A break of a demo shift, its id from the shift's and its place in it. */
const pause = (
  shiftId: number,
  index: number,
  times: Omit<BreakRecord, "id" | "unpaid">,
): BreakRecord => ({
  id: `68000000-0000-4000-a000-00000000b${String(shiftId).padStart(2, "0")}${index}`,
  ...times,
  // The demo's breaks come off the hours, as its setting says.
  unpaid: true,
});

/**
 * Each person's shifts this month, newest first. The team list and its totals
 * are summed from these, so a person's page and their row always agree. A
 * cancelled shift is listed and counts for nothing, as the app's.
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
      // At work now, on a break, clocked in without a code: it waits. The
      // break still running is shown and opens nothing.
      shift(
        1,
        TODAY,
        { in: "09:14", out: null, minutes: 166 },
        {
          attendance: { how: "none", pending: true },
          breakMinutes: 20,
          breaks: [pause(1, 1, { start: "11:40", end: null, minutes: 20 })],
        },
      ),
      // Corrected, recorded by a manager and corrected since, and recorded
      // by a manager: each with who and why.
      shift(
        2,
        "2026-11-05",
        { in: "16:00", out: "23:30", minutes: 420 },
        {
          breakMinutes: 30,
          // Two breaks, each fixed on its own (`?state=break`).
          breaks: [
            pause(2, 1, { start: "18:30", end: "18:45", minutes: 15 }),
            pause(2, 2, { start: "21:00", end: "21:15", minutes: 15 }),
          ],
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
      // The same evening recorded twice, the copy cancelled the day after:
      // kept, with who, when and why, and counted for nothing.
      shift(
        8,
        "2026-11-03",
        { in: "16:00", out: "23:00", minutes: 0 },
        {
          cancelled: {
            by: "שירן הדגמה",
            date: "2026-11-04",
            time: "15:10",
            note: "נרשמה פעמיים בטעות",
          },
        },
      ),
      // A break pressed by mistake, removed (the clock plan's PR2): it is
      // left out of the shift, which reads as corrected, with why.
      shift(
        9,
        "2026-11-02",
        { in: "16:00", out: "22:30", minutes: 390 },
        {
          correction: {
            kind: "corrected",
            by: "שירן הדגמה",
            note: "ההפסקה נלחצה בטעות",
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
        cancelled: null,
        breaks: [],
      },
      ...demoNoaRecords.filter((record) => record.date < "2026-11-04"),
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
  // A cancelled shift counts as none.
  shifts: person.records.filter((record) => record.cancelled === null).length,
  breakMinutes: sum(person.records, "breakMinutes"),
}));

/**
 * The demo's clock stations (#78 phase 5): the entrance's tablet showing
 * the code now, the kitchen's last seen last night, and one locked but not
 * showing a code yet. The station's twin (/design/shell/station) is the first.
 */
export const demoStations: TeamStations = {
  rows: [
    { id: "station-entrance", name: "עמדת הכניסה", seen: { kind: "showing" } },
    {
      id: "station-kitchen",
      name: "טאבלט המטבח",
      seen: { kind: "seen", date: "2026-11-05", time: "23:12" },
    },
    { id: "station-office", name: "עמדת שעון 3", seen: { kind: "never" } },
  ],
  howTo: true,
  // The demo asks for the code (`required` below).
  shownEmpty: true,
  today: TODAY,
};

export const demoTeamHours: TeamHoursData = {
  month: MONTH,
  currentMonth: MONTH,
  minutes: people.reduce((total, person) => total + person.minutes, 0),
  shifts: people.reduce((total, person) => total + person.shifts, 0),
  required: true,
  showCode: true,
  viewOnly: false,
  payroll: true,
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
  stations: demoStations,
  awayToday: [],
};

/**
 * Who is away today on the team's hours (`?away=1`, known issue 19): Noa
 * sick until tomorrow, and Yoav recorded away today though he clocked in,
 * which his row at work says.
 */
export const demoAwayToday: AwayTodayRow[] = [
  { userId: NOA, name: "נועה כהן", kind: "sick", until: "2026-11-07" },
  { userId: YOAV, name: "יואב לוי", kind: "other", until: TODAY },
];

/**
 * Noa's days away in the month (`?absences=1`): a vacation of three days
 * with a note, and reserve duty that runs into next month, with two of her
 * shifts still on the schedule on its days.
 */
export const demoNoaAbsences: AbsenceRow[] = [
  {
    id: "ab5e0000-0000-4000-d000-000000000001",
    kind: "vacation",
    from: "2026-11-09",
    to: "2026-11-11",
    note: "אושר מראש",
    days: 3,
    inMonth: 3,
    recordedBy: "שירן הדגמה",
    recordedOn: "2026-11-02",
    shifts: 0,
    shiftsWeek: null,
  },
  {
    id: "ab5e0000-0000-4000-d000-000000000002",
    kind: "reserve",
    from: "2026-11-26",
    to: "2026-12-03",
    note: null,
    days: 8,
    inMonth: 5,
    recordedBy: "שירן הדגמה",
    recordedOn: "2026-11-05",
    shifts: 2,
    // "לבניית הסידור" opens the week of the first of them.
    shiftsWeek: "2026-11-22",
  },
];

/** The refusal a demo state opens the days away sheet with, if any. */
export function demoAbsenceRefusal(
  state: string | undefined,
): { failure: AbsenceFailure; month?: string } | undefined {
  switch (state) {
    case "absenceOverlap":
      return { failure: "overlap" };
    case "absenceClosed":
      return { failure: "monthClosed", month: "2026-10" };
    default:
      return undefined;
  }
}

/**
 * The sheet a demo person's page opens on (`?state=`): `edit` and `cancel` on
 * their newest shift that ended, fixing it (with its breaks) and the step
 * that cancels it; `cancelled` on their cancelled one, to bring it back;
 * `break` the step that fixes the first break of their newest shift with one
 * that ended, `addBreak` the step that adds one to their newest shift that
 * ended, and `openBreak` fixing the shift whose break still runs.
 */
export function demoPersonSheet(
  userId: string,
  state: string | undefined,
): EntryTarget | undefined {
  const records = demoPeople.find((row) => row.userId === userId)?.records;
  const live = records?.filter((record) => record.cancelled === null) ?? [];
  const ended = live.find((record) => record.out !== null);
  const cancelled = records?.find((record) => record.cancelled !== null);
  const withBreak = live.find((record) =>
    record.breaks.some((one) => one.end !== null),
  );
  const running = live.find((record) =>
    record.breaks.some((one) => one.end === null),
  );
  switch (state) {
    // Days away (known issue 19): recording, a record of Noa's, and the
    // record sheet with the overlap's or a closed month's refusal.
    case "absenceAdd":
    case "absenceOverlap":
    case "absenceClosed":
      return { kind: "absenceAdd" };
    case "absenceEdit": {
      const [first] = demoNoaAbsences;
      return first ? { kind: "absenceEdit", absence: first } : undefined;
    }
    case "edit":
    case "cancel":
      return ended ? { kind: state, record: ended } : undefined;
    case "cancelled":
      return cancelled ? { kind: "cancelled", record: cancelled } : undefined;
    case "break": {
      const first = withBreak?.breaks.find((one) => one.end !== null);
      return withBreak && first
        ? { kind: "break", record: withBreak, pause: first }
        : undefined;
    }
    case "addBreak":
      return ended ? { kind: "break", record: ended, pause: null } : undefined;
    case "openBreak":
      return running ? { kind: "edit", record: running } : undefined;
    default:
      return undefined;
  }
}

/** A demo shift by its id, for the stand-ins to check what was typed against. */
export function demoShiftOf(entryId: string): ShiftRecord | undefined {
  for (const person of demoPeople) {
    const found = person.records.find((record) => record.id === entryId);
    if (found) return found;
  }
  return undefined;
}

/**
 * One person's month, from the same shifts as their row in the team list.
 * With `absences`, Noa's days away of the month (`?absences=1`).
 */
export function demoPersonHours(
  userId: string,
  absences = false,
): PersonHoursData | null {
  const person = demoPeople.find((row) => row.userId === userId);
  if (!person) return null;
  return {
    person: { userId: person.userId, name: person.name },
    month: MONTH,
    currentMonth: MONTH,
    minutes: sum(person.records, "minutes"),
    records: person.records,
    today: TODAY,
    // The demo restaurant's breaks come off the hours.
    unpaidBreaks: true,
    viewOnly: false,
    absences: absences && userId === NOA ? demoNoaAbsences : [],
    // Shiran, the demo's manager, records no days away for herself.
    canRecord: userId !== SHIRAN,
    builds: true,
  };
}
