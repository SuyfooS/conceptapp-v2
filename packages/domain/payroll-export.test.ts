import { describe, expect, it } from "vitest";
import { instantIn } from "./availability";
import { payrollHistory } from "./holiday-pay";
import {
  BUCKETS,
  type PayrollInput,
  type PayrollPerson,
  type PayrollSettings,
  payrollMonth,
  payrollRange,
  withoutAmounts,
} from "./payroll";
import { payrollCalendar } from "./payroll-calendar";
import {
  attachmentHeader,
  type Cell,
  changedSinceExport,
  cleanFileName,
  type ExportMeta,
  type ExportPerson,
  type ExportWords,
  entriesOfMonth,
  escapeCellText,
  exportFileName,
  exportSheets,
  exportShiftsOf,
  localDateTime,
  type Sheet,
} from "./payroll-export";
import { ISRAELI_CITIES } from "./shabbat";
import type { TimeEntry } from "./time-clock";

const TZ = "Asia/Jerusalem";
const NOA = "11111111-1111-4111-a111-111111111111";
const YOAV = "22222222-2222-4222-a222-222222222222";
const BOSS = "33333333-3333-4333-a333-333333333333";
const IDLE = "44444444-4444-4444-a444-444444444444";
const NOW = new Date("2026-11-10T10:00:00Z");

const SIX: PayrollSettings = {
  workWeek: "six",
  shortDay: 4,
  restStart: "candleLighting",
  restStartTime: "14:00",
  roundToMinutes: 0,
};

const at = (local: string): string => {
  const [date = "", time = ""] = local.split(" ");
  return instantIn(date, time, TZ).toISOString();
};

let next = 0;
function entry(
  userId: string,
  from: string,
  to: string | null,
  more: Partial<TimeEntry> = {},
): TimeEntry {
  next += 1;
  const id = `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`;
  return {
    id,
    userId,
    clockIn: at(from),
    clockOut: to === null ? null : at(to),
    source: "punch",
    breaks: [],
    inProof: null,
    outProof: null,
    confirmedAt: null,
    note: null,
    editedBy: null,
    editedAt: null,
    createdAt: null,
    ...more,
  };
}

function person(
  userId: string,
  overrides: Partial<PayrollPerson> = {},
): PayrollPerson {
  return {
    userId,
    payrollNumber: "101",
    restDay: 6,
    hoursLaw: "applies",
    youthUntil: null,
    compulsoryEducation: true,
    periods: [{ startedOn: "2026-01-01", endedOn: null }],
    wages: [
      { agorot: 3800, from: "2026-01-01", setAt: "2026-01-01T08:00:00Z" },
    ],
    ...overrides,
  };
}

const range = payrollRange("2026-10");
const CALENDAR = payrollCalendar(
  { ...ISRAELI_CITIES.telAviv, timeZone: TZ },
  range.from,
  range.to,
  SIX,
);

function monthOf(entries: TimeEntry[], people: PayrollPerson[]) {
  const input: PayrollInput = {
    month: "2026-10",
    timeZone: TZ,
    now: NOW,
    entries,
    people,
    settings: SIX,
    calendar: CALENDAR,
    history: payrollHistory(entries, "2026-10", TZ, NOW),
  };
  return payrollMonth(input);
}

/** Words that say what they are, so a test reads which ones a cell took. */
const WORDS: ExportWords = {
  sheets: {
    summary: "Summary",
    daily: "Daily",
    check: "Check",
    about: "About",
  },
  columns: {
    summary: {
      name: "name",
      number: "number",
      wage: "wage",
      from: "from",
      to: "to",
      days: "days",
      hours: "hours",
      nights: "nights",
      unpaidBreaks: "unpaidBreaks",
      corrected: "corrected",
      open: "open",
      waiting: "waiting",
      hoursLaw: "hoursLaw",
      daysNotWorked: "daysNotWorked",
      toCheck: "toCheck",
    },
    daily: {
      name: "name",
      number: "number",
      date: "date",
      weekday: "weekday",
      in: "in",
      out: "out",
      originalIn: "originalIn",
      originalOut: "originalOut",
      paidBreaks: "paidBreaks",
      unpaidBreaks: "unpaidBreaks",
      hours: "hours",
      night: "night",
      eve: "eve",
      holidayOrRest: "holidayOrRest",
      oneOff: "oneOff",
      source: "source",
      status: "status",
      correctedBy: "correctedBy",
      correctedAt: "correctedAt",
      reason: "reason",
    },
    check: {
      name: "name",
      number: "number",
      date: "date",
      what: "what",
      rule: "rule",
      unchanged: "unchanged",
    },
    about: { topic: "topic", details: "details" },
  },
  rate: (bucket, rest) => `${bucket}:${rest}`,
  weekday: (day) => `day${day}`,
  source: (source) => `source:${source}`,
  status: (status) => `status:${status}`,
  hoursLaw: (law) => `law:${law}`,
  rest: (rest) => `rest:${rest}`,
  holiday: (key) => `holiday:${key}`,
  oneOff: (key) => `oneOff:${key}`,
  yes: "yes",
  noName: "no name",
  someone: "someone",
  flag: (flag) => `flag:${flag.code}`,
  rule: (code) => `rule:${code}`,
  dayNotWorked: (line) => `notWorked:${line.date}:${line.averageMinutes}`,
  dayNotWorkedCheck: (line, form) => `notWorkedCheck:${line.date}:${form}`,
  dayNotWorkedRule: (line) => `notWorkedRule:${line.holiday ?? "oneOff"}`,
  note: (note) => `note:${note.code}`,
  workWeekRule: "workWeekRule",
  unchanged: "unchanged",
  about: {
    business: "business",
    month: "month",
    madeAt: "madeAt",
    madeBy: "madeBy",
    engine: "engine",
    minimumWage: "minimumWage",
    note: "note",
    monthName: (month) => `month:${month}`,
    madeByTeam: (name) => `team:${name}`,
    settings: (settings) => [
      { label: "workWeek", value: settings.workWeek },
      { label: "city", value: settings.city },
    ],
    lines: {
      minutes: "line:minutes",
      proposal: "line:proposal",
      firstShift: "line:firstShift",
      open: "line:open",
      daysNotWorked: "line:daysNotWorked",
      nothingElse: "line:nothingElse",
    },
  },
};

const META: ExportMeta = {
  business: "Demo",
  month: "2026-10",
  madeAt: "2026-11-10T12:00",
  madeBy: "Galit",
  viewing: false,
  settings: { ...SIX, unpaidBreaks: true, city: "telAviv" },
  minimumWageFrom: "2026-04-01",
};

/** A sheet's rows as objects by header, for reading a test. */
function rowsOf(sheet: Sheet | undefined): Record<string, Cell>[] {
  if (!sheet) return [];
  return sheet.rows.map((row) =>
    Object.fromEntries(
      sheet.columns.map((column, index) => [column.header, row[index] ?? null]),
    ),
  );
}

const text = (v: string): Cell => ({ t: "s", v });
const hours = (v: number): Cell => ({ t: "n", v });
/** A daily cell: minutes as hours, exactly. */
const exact = (minutes: number): Cell => ({ t: "n", v: minutes / 60 });
const whole = (v: number): Cell => ({ t: "n", v, whole: true });

// Noa: a raise on 15.10 (case C13) and a shift of 8:36 on the 20th, two
// shifts on the 21st and one still open on the 29th; Yoav: payroll number
// "007", a shift a manager corrected with a reason that looks like a formula;
// the owner without a wage; someone on the staff with no hours.
const corrected = entry(YOAV, "2026-10-13 08:00", "2026-10-13 16:00", {
  source: "punch",
  outProof: "manager",
  editedBy: BOSS,
  editedAt: at("2026-10-14 09:30"),
  note: "=SUM(A1:A9)",
});
const ENTRIES = [
  entry(NOA, "2026-10-14 08:00", "2026-10-14 16:00"),
  entry(NOA, "2026-10-15 08:00", "2026-10-15 16:00"),
  entry(NOA, "2026-10-20 08:00", "2026-10-20 16:36"),
  entry(NOA, "2026-10-21 08:00", "2026-10-21 12:00"),
  entry(NOA, "2026-10-21 13:00", "2026-10-21 19:00", {
    breaks: [
      {
        id: "00000000-0000-4000-9000-000000000001",
        startedAt: at("2026-10-21 15:00"),
        endedAt: at("2026-10-21 15:20"),
        unpaid: true,
      },
    ],
  }),
  entry(NOA, "2026-10-29 08:00", null),
  corrected,
  entry(BOSS, "2026-10-12 09:00", "2026-10-12 13:00"),
];
const PEOPLE: PayrollPerson[] = [
  person(NOA, {
    payrollNumber: "102",
    wages: [
      { agorot: 3800, from: "2026-10-01", setAt: "2026-10-01T08:00:00Z" },
      { agorot: 4000, from: "2026-10-15", setAt: "2026-10-01T08:00:00Z" },
    ],
  }),
  person(YOAV, { payrollNumber: "007" }),
  person(BOSS, { payrollNumber: null, wages: [] }),
  // Started after election day, so not even a day not worked to pay.
  person(IDLE, { periods: [{ startedOn: "2026-10-28", endedOn: null }] }),
];
const MONTH = monthOf(ENTRIES, PEOPLE);

const names: Record<string, string> = {
  [NOA]: "Noa",
  [YOAV]: "Yoav",
  [BOSS]: "Boss",
  [IDLE]: "Idle",
};
const SHIFTS = exportShiftsOf(
  entriesOfMonth(ENTRIES, "2026-10", TZ),
  "2026-10",
  TZ,
  NOW,
  (userId) => names[userId] ?? null,
  new Map([
    [corrected.id, { clockIn: at("2026-10-13 08:00"), clockOut: null }],
  ]),
);
const LISTED: ExportPerson[] = PEOPLE.map((one) => ({
  userId: one.userId,
  name: names[one.userId] ?? null,
  form: one.userId === NOA ? "f" : "m",
  payrollNumber: one.payrollNumber,
  hoursLaw: one.hoursLaw,
  restDay: one.restDay,
  wages: one.wages,
  shifts: SHIFTS.filter((shift) => shift.userId === one.userId),
}));

/** Someone's file of their own: the engine's month and their October shifts, as the loader gives them. */
function fileOf(entries: TimeEntry[], who: PayrollPerson, name: string) {
  const month = monthOf(entries, [who]);
  const shifts = exportShiftsOf(
    entriesOfMonth(entries, "2026-10", TZ),
    "2026-10",
    TZ,
    NOW,
    () => null,
  );
  const info: ExportPerson = {
    userId: who.userId,
    name,
    form: "f",
    payrollNumber: who.payrollNumber,
    hoursLaw: who.hoursLaw,
    restDay: who.restDay,
    wages: who.wages,
    shifts,
  };
  return { month, file: exportSheets(month, [info], META, WORDS) };
}

/** Tuesdays, 09:00 to 17:00, in some months, but for some days. */
function tuesdays(userId: string, months: string[], but: string[] = []) {
  return months.flatMap((month) =>
    Array.from({ length: 31 }, (_, index) => {
      const date = `${month}-${String(index + 1).padStart(2, "0")}`;
      const day = new Date(`${date}T12:00:00Z`);
      return day.getUTCMonth() + 1 === Number(month.slice(5)) &&
        day.getUTCDay() === 2 &&
        !but.includes(date)
        ? [entry(userId, `${date} 09:00`, `${date} 17:00`)]
        : [];
    }).flat(),
  );
}

const FILE = exportSheets(MONTH, LISTED, META, WORDS);
const sheet = (key: Sheet["key"]) => FILE.sheets.find((one) => one.key === key);

describe("exportSheets", () => {
  it("has the four sheets, right to left, in their order and words", () => {
    expect(FILE.sheets.map((one) => [one.key, one.name, one.rtl])).toEqual([
      ["summary", "Summary", true],
      ["daily", "Daily", true],
      ["check", "Check", true],
      ["about", "About", true],
    ]);
    // The rates' headers sit where the rates go, named by the rest day.
    expect(sheet("summary")?.columns.map((column) => column.header)).toEqual([
      "name",
      "number",
      "wage",
      "from",
      "to",
      "days",
      "hours",
      "regular:saturday",
      "ot125:saturday",
      "ot150:saturday",
      "rest150:saturday",
      "rest175:saturday",
      "rest200:saturday",
      "nights",
      "unpaidBreaks",
      "corrected",
      "open",
      "waiting",
      "hoursLaw",
      "daysNotWorked",
      "toCheck",
    ]);
  });

  it("lists who has hours, by name, and leaves out the staff with none", () => {
    const summary = rowsOf(sheet("summary"));
    expect(summary.map((row) => row.name)).toEqual([
      text("Boss"),
      text("Noa"),
      text("Noa"),
      text("Yoav"),
    ]);
    expect(FILE.people).toBe(3);
    expect(FILE.shifts).toBe(8);
  });

  it("gives a raise in the month two rows, each with its wage and days (C13)", () => {
    const [, first, second] = rowsOf(sheet("summary"));
    expect(first).toMatchObject({
      wage: hours(38),
      from: { t: "d", v: "2026-10-01" },
      to: { t: "d", v: "2026-10-14" },
      days: whole(1),
      hours: hours(8),
      "regular:saturday": hours(8),
    });
    expect(second).toMatchObject({
      wage: hours(40),
      from: { t: "d", v: "2026-10-15" },
      to: { t: "d", v: "2026-10-31" },
      days: whole(3),
      // 8 + 8:36 + 4 + 5:40 (a 20-minute unpaid break): summed minutes, then hours.
      hours: hours(26.27),
      // The open shift of the 29th is in this stretch, and not counted.
      open: whole(1),
    });
  });

  it("writes 8:36 as 8.60, from the minutes", () => {
    const shift = rowsOf(sheet("daily")).find(
      (row) =>
        row.name?.t === "s" &&
        row.name.v === "Noa" &&
        row.date?.v === "2026-10-20",
    );
    expect(shift?.hours).toEqual(hours(8.6));
    expect(shift?.in).toEqual({ t: "time", v: "08:00" });
    expect(shift?.out).toEqual({ t: "time", v: "16:36" });
    expect(shift?.weekday).toEqual(text("day2"));
  });

  it("keeps a payroll number as text, and escapes a reason that would be a formula", () => {
    const yoav = rowsOf(sheet("daily")).find(
      (row) => row.name?.t === "s" && row.name.v === "Yoav",
    );
    expect(yoav?.number).toEqual(text("007"));
    expect(yoav?.reason).toEqual(text("'=SUM(A1:A9)"));
    expect(yoav?.correctedBy).toEqual(text("Boss"));
    expect(yoav?.correctedAt).toEqual({ t: "dt", v: "2026-10-14T09:30" });
    expect(yoav?.originalIn).toEqual({ t: "time", v: "08:00" });
    expect(yoav?.originalOut).toBeNull();
    expect(yoav?.source).toEqual(text("source:manager"));
    // And the summary counts it as corrected.
    const summary = rowsOf(sheet("summary")).find(
      (row) => row.name?.t === "s" && row.name.v === "Yoav",
    );
    expect(summary?.corrected).toEqual(whole(1));
  });

  it("puts a day's rates on its first counted shift, exactly, so the columns add up to the summary", () => {
    const noa = rowsOf(sheet("daily")).filter(
      (row) => row.name?.t === "s" && row.name.v === "Noa",
    );
    const day21 = noa.filter((row) => row.date?.v === "2026-10-21");
    expect(day21).toHaveLength(2);
    // 9:40 in the day: 8 regular, 1:40 at 125%, all on the first shift's
    // row, unrounded (shown as 1.67).
    expect(day21[0]?.["regular:saturday"]).toEqual(hours(8));
    expect(day21[0]?.["ot125:saturday"]).toEqual(exact(100));
    expect(day21[1]?.["regular:saturday"]).toBeNull();
    expect(day21[1]?.["ot125:saturday"]).toBeNull();
    // Each shift keeps its own hours and breaks.
    expect(day21.map((row) => row.hours)).toEqual([hours(4), exact(340)]);
    expect(day21.map((row) => row.unpaidBreaks)).toEqual([whole(0), whole(20)]);
    // The open shift: its times, no hours, no rates, and said so.
    const open = noa.find((row) => row.date?.v === "2026-10-29");
    expect(open).toMatchObject({
      in: { t: "time", v: "08:00" },
      out: null,
      hours: null,
      "regular:saturday": null,
      status: text("status:open"),
    });
    // Each rate's column adds up to the summary's: to the minute, and to
    // within half a hundredth of the summary's two places.
    const sum = (rows: Record<string, Cell>[], key: string) =>
      rows.reduce(
        (total, row) => total + (row[key]?.t === "n" ? row[key].v : 0),
        0,
      );
    const summary = rowsOf(sheet("summary")).filter(
      (row) => row.name?.t === "s" && row.name.v === "Noa",
    );
    const engine = MONTH.people.find((one) => one.userId === NOA);
    for (const bucket of BUCKETS) {
      const key = `${bucket}:saturday`;
      expect(Math.round(sum(noa, key) * 60), key).toBe(engine?.buckets[bucket]);
      expect(Math.abs(sum(noa, key) - sum(summary, key)), key).toBeLessThan(
        0.005,
      );
    }
    // 2:16 at 125% (0:36 on the 20th, 1:40 on the 21st): 0.6 and 1.6666… on
    // the days, which Excel sums to 2.27, as the summary rounds it once.
    expect(sum(noa, "ot125:saturday")).toBeCloseTo(136 / 60, 10);
    expect(sum(summary, "ot125:saturday")).toBe(2.27);
  });

  it("marks what kind of day it was once, on its first counted shift, as its rates", () => {
    // A Friday morning, then the same Friday into Shabbat; a Wednesday
    // morning, then a night from it.
    const who = "66666666-6666-4666-a666-666666666666";
    const { file } = fileOf(
      [
        entry(who, "2026-10-16 06:00", "2026-10-16 10:00"),
        entry(who, "2026-10-16 15:00", "2026-10-16 20:00"),
        entry(who, "2026-10-14 08:00", "2026-10-14 12:00"),
        entry(who, "2026-10-14 22:00", "2026-10-15 03:00"),
      ],
      person(who),
      "Tal",
    );
    const daily = rowsOf(file.sheets[1]);
    const friday = daily.filter((row) => row.date?.v === "2026-10-16");
    expect(friday.map((row) => row.in)).toEqual([
      { t: "time", v: "06:00" },
      { t: "time", v: "15:00" },
    ]);
    expect(friday[0]).toMatchObject({
      eve: text("yes"),
      holidayOrRest: text("rest:saturday"),
    });
    expect(friday[0]?.["regular:saturday"]?.t).toBe("n");
    expect(friday[1]).toMatchObject({
      night: null,
      eve: null,
      holidayOrRest: null,
      oneOff: null,
      "regular:saturday": null,
    });
    const wednesday = daily.filter((row) => row.date?.v === "2026-10-14");
    expect(wednesday.map((row) => row.night)).toEqual([text("yes"), null]);
    // The day is one night in the summary, as on the daily sheet.
    const [summary] = rowsOf(file.sheets[0]);
    expect(summary?.nights).toEqual(whole(1));
  });

  it("says what to check, in words, with the rule, and that the hours weren't changed", () => {
    const check = rowsOf(sheet("check"));
    // The owner has no payroll number and no wage.
    const boss = check.filter(
      (row) => row.name?.t === "s" && row.name.v === "Boss",
    );
    expect(boss.map((row) => row.what)).toEqual(
      expect.arrayContaining([
        text("flag:noWage"),
        text("flag:noPayrollNumber"),
      ]),
    );
    for (const row of check) {
      expect(row.unchanged).toEqual(text("unchanged"));
      expect(row.rule?.t).toBe("s");
    }
    const noWage = boss.find(
      (row) => row.what?.t === "s" && row.what.v === "flag:noWage",
    );
    expect(noWage?.rule).toEqual(text("rule:noWage"));
    expect(noWage?.date).toEqual({ t: "d", v: "2026-10-12" });
    // The summary's count is the same things.
    const summary = rowsOf(sheet("summary")).find(
      (row) => row.name?.t === "s" && row.name.v === "Boss",
    );
    expect(summary?.toCheck).toEqual(whole(boss.length));
    expect(summary?.wage).toBeNull();
  });

  it("says what the file is, and what it doesn't hold", () => {
    const about = sheet("about")?.rows ?? [];
    expect(about.slice(0, 6)).toEqual([
      [text("business"), text("Demo")],
      [text("month"), text("month:2026-10")],
      [text("madeAt"), { t: "dt", v: "2026-11-10T12:00" }],
      [text("madeBy"), text("Galit")],
      [text("engine"), text(MONTH.engineVersion)],
      [text("minimumWage"), { t: "d", v: "2026-04-01" }],
    ]);
    const details = about.map((row) => (row[1]?.t === "s" ? row[1].v : null));
    expect(details).toEqual(
      expect.arrayContaining([
        "six",
        "telAviv",
        "note:paidAbsencesMissing",
        "line:minutes",
        "line:nothingElse",
      ]),
    );
    // A view by the team says so.
    const viewed = exportSheets(
      MONTH,
      LISTED,
      { ...META, viewing: true },
      WORDS,
    ).sheets.find((one) => one.key === "about");
    expect(viewed?.rows[3]).toEqual([text("madeBy"), text("team:Galit")]);
  });

  it("is the same with amounts and without: no estimate and no amount is ever in it", () => {
    expect(MONTH.people.some((one) => (one.estimateAgorot ?? 0) > 0)).toBe(
      true,
    );
    expect(exportSheets(withoutAmounts(MONTH), LISTED, META, WORDS)).toEqual(
      FILE,
    );
    // Not one number of the file is an estimate's, in shekels or agorot.
    const numbers = FILE.sheets.flatMap((one) =>
      one.rows.flatMap((row) =>
        row.flatMap((cell) => (cell?.t === "n" ? [cell.v] : [])),
      ),
    );
    for (const one of MONTH.people) {
      if (!one.estimateAgorot) continue;
      expect(numbers).not.toContain(one.estimateAgorot);
      expect(numbers).not.toContain(one.estimateAgorot / 100);
    }
  });

  it("lists a day not worked and paid, with its average and no amount", () => {
    // Election day, 27.10.2026, a Tuesday: Dana always worked Tuesdays, and
    // didn't that week.
    const DANA = "55555555-5555-4555-a555-555555555555";
    const { month, file } = fileOf(
      tuesdays(
        DANA,
        ["2026-07", "2026-08", "2026-09", "2026-10"],
        ["2026-10-27"],
      ),
      person(DANA),
      "Dana",
    );
    const [line] = month.people[0]?.holidayPay ?? [];
    expect(line?.date).toBe("2026-10-27");
    const [summary] = rowsOf(file.sheets[0]);
    expect(summary?.daysNotWorked).toEqual(
      text(`notWorked:2026-10-27:${line?.averageMinutes}`),
    );
    const check = rowsOf(file.sheets[2]);
    expect(check.map((row) => row.what)).toContainEqual(
      text("notWorkedCheck:2026-10-27:f"),
    );
    expect(check.map((row) => row.rule)).toContainEqual(
      text("notWorkedRule:oneOff"),
    );
  });

  it("puts a day not worked after a raise beside the wage on its day, on a row of its own", () => {
    // Dana worked Tuesdays at 38.00 to the 20th, got 40.00 from the 22nd, and
    // didn't work election day, the 27th.
    const DANA = "55555555-5555-4555-a555-555555555555";
    const { month, file } = fileOf(
      tuesdays(
        DANA,
        ["2026-07", "2026-08", "2026-09", "2026-10"],
        ["2026-10-27"],
      ),
      person(DANA, {
        wages: [
          { agorot: 3800, from: "2026-01-01", setAt: "2026-01-01T08:00:00Z" },
          { agorot: 4000, from: "2026-10-22", setAt: "2026-10-20T08:00:00Z" },
        ],
      }),
      "Dana",
    );
    const [line] = month.people[0]?.holidayPay ?? [];
    expect(line?.date).toBe("2026-10-27");
    const summary = rowsOf(file.sheets[0]);
    expect(summary).toHaveLength(2);
    expect(summary[0]).toMatchObject({
      wage: hours(38),
      from: { t: "d", v: "2026-10-01" },
      to: { t: "d", v: "2026-10-21" },
      days: whole(3),
      hours: hours(24),
      daysNotWorked: null,
    });
    expect(summary[1]).toMatchObject({
      wage: hours(40),
      from: { t: "d", v: "2026-10-22" },
      to: { t: "d", v: "2026-10-31" },
      days: whole(0),
      hours: hours(0),
      "regular:saturday": hours(0),
      nights: whole(0),
      daysNotWorked: text(`notWorked:2026-10-27:${line?.averageMinutes}`),
      // What to check about the day is counted on its row.
      toCheck: whole(1),
    });
  });

  it("lists a month with only a day not worked and paid, at the wage in force", () => {
    // Tuesdays from July to September, nothing in October.
    const DANA = "55555555-5555-4555-a555-555555555555";
    const { month, file } = fileOf(
      tuesdays(DANA, ["2026-07", "2026-08", "2026-09"]),
      person(DANA),
      "Dana",
    );
    const [line] = month.people[0]?.holidayPay ?? [];
    expect(line?.date).toBe("2026-10-27");
    expect(file.people).toBe(1);
    expect(file.shifts).toBe(0);
    expect(rowsOf(file.sheets[0])).toEqual([
      expect.objectContaining({
        name: text("Dana"),
        number: text("101"),
        wage: hours(38),
        from: { t: "d", v: "2026-10-01" },
        to: { t: "d", v: "2026-10-31" },
        days: whole(0),
        hours: hours(0),
        open: whole(0),
        daysNotWorked: text(`notWorked:2026-10-27:${line?.averageMinutes}`),
        toCheck: whole(1),
      }),
    ]);
    expect(rowsOf(file.sheets[2]).map((row) => row.what)).toEqual([
      text("notWorkedCheck:2026-10-27:f"),
    ]);
  });

  it("marks the payroll number as an identifier on every sheet that has it", () => {
    const ids = (key: Sheet["key"]) =>
      sheet(key)
        ?.columns.filter((column) => column.id)
        .map((column) => column.header);
    expect(ids("summary")).toEqual(["number"]);
    expect(ids("daily")).toEqual(["number"]);
    expect(ids("check")).toEqual(["number"]);
    expect(ids("about")).toEqual([]);
  });

  it("puts how each week was worked out, while the week isn't set, on the sheet to check", () => {
    const unset = payrollMonth({
      month: "2026-10",
      timeZone: TZ,
      now: NOW,
      entries: ENTRIES.filter((one) => one.userId === YOAV),
      people: [person(YOAV, { payrollNumber: "007" })],
      settings: { ...SIX, workWeek: "unset" },
      calendar: CALENDAR,
    });
    const file = exportSheets(
      unset,
      LISTED.filter((one) => one.userId === YOAV),
      META,
      WORDS,
    );
    const check = rowsOf(file.sheets[2]);
    expect(check).toContainEqual(
      expect.objectContaining({
        what: text("note:workWeekUnset"),
        rule: text("workWeekRule"),
        date: { t: "d", v: "2026-10-11" },
      }),
    );
    // And never on the sheet about the file.
    expect(JSON.stringify(file.sheets[3])).not.toContain("workWeekUnset");
  });
});

describe("escapeCellText", () => {
  it("puts an apostrophe before what would start a formula, once", () => {
    for (const start of ["=", "+", "-", "@", "\t", "\r", "＝"]) {
      expect(escapeCellText(`${start}1+1`)).toBe(`'${start}1+1`);
    }
    expect(escapeCellText(escapeCellText("=1"))).toBe("'=1");
    expect(escapeCellText("נועה")).toBe("נועה");
    expect(escapeCellText("007")).toBe("007");
    expect(escapeCellText("")).toBe("");
  });
});

describe("changedSinceExport", () => {
  const sent = "2026-11-03T08:00:00Z";
  const row = (more: Partial<TimeEntry>) => ({
    createdAt: "2026-10-01T08:00:00Z",
    editedAt: null,
    confirmedAt: null,
    clockOut: "2026-10-01T16:00:00Z",
    ...more,
  });

  it("is false while nothing moved since the file", () => {
    expect(changedSinceExport([row({})], [], "2026-10", sent)).toBe(false);
    // A shift still open changes nothing yet.
    expect(
      changedSinceExport([row({ clockOut: null })], [], "2026-10", sent),
    ).toBe(false);
  });

  it("is true for a shift written, corrected, confirmed or ended after it", () => {
    for (const more of [
      { createdAt: "2026-11-04T08:00:00Z" },
      { editedAt: "2026-11-03T08:00:01Z" },
      { confirmedAt: "2026-11-05T08:00:00Z" },
      { clockOut: "2026-11-03T09:00:00+00:00" },
    ]) {
      expect(changedSinceExport([row(more)], [], "2026-10", sent)).toBe(true);
    }
  });

  it("is true for a wage set after it that reaches into the month", () => {
    expect(
      changedSinceExport(
        [],
        [{ setAt: "2026-11-04T08:00:00Z", from: "2026-10-15" }],
        "2026-10",
        sent,
      ),
    ).toBe(true);
    expect(
      changedSinceExport(
        [],
        [{ setAt: "2026-11-04T08:00:00Z", from: "2026-11-01" }],
        "2026-10",
        sent,
      ),
    ).toBe(false);
  });
});

describe("the file's name", () => {
  it("is plain ASCII from the slug and the month", () => {
    expect(exportFileName("demo-shop", "2026-10")).toBe(
      "hours-demo-shop-2026-10.xlsx",
    );
    expect(exportFileName("Café & Bar!", "2026-10")).toBe(
      "hours-caf-bar-2026-10.xlsx",
    );
    expect(exportFileName("מסעדה", "2026-10")).toBe(
      "hours-business-2026-10.xlsx",
    );
  });

  it("keeps the words, without what a file system refuses", () => {
    expect(cleanFileName('שעות: "אוקטובר"/2026\u0007?.xlsx')).toBe(
      "שעות אוקטובר 2026 .xlsx",
    );
  });

  it("goes out as an attachment, in ASCII and in UTF-8", () => {
    expect(
      attachmentHeader("hours-demo-2026-10.xlsx", "שעות לשכר (אוקטובר).xlsx"),
    ).toBe(
      `attachment; filename="hours-demo-2026-10.xlsx"; filename*=UTF-8''${encodeURIComponent("שעות לשכר ")}%28${encodeURIComponent("אוקטובר")}%29.xlsx`,
    );
    expect(attachmentHeader('a"b\\cé.xlsx', "x")).toBe(
      `attachment; filename="abc.xlsx"; filename*=UTF-8''x`,
    );
  });
});

describe("localDateTime", () => {
  it("is the business's own clock, summer time or not", () => {
    expect(localDateTime("2026-10-14T06:30:00Z", TZ)).toBe("2026-10-14T09:30");
    expect(localDateTime("2026-11-14T06:30:00Z", TZ)).toBe("2026-11-14T08:30");
  });
});
