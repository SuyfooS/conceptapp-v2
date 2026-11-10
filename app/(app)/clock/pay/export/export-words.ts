import "server-only";
import type { HolidayPayLine } from "@domain/holiday-pay";
import { formatShekels } from "@domain/money";
import { type FlagFormat, flagValues } from "@domain/pay-rates";
import { decimalHours } from "@domain/payroll-access";
import type { OneOffRestDayKey } from "@domain/payroll-calendar";
import {
  ABOUT_COLUMNS,
  ABOUT_LINES,
  CHECK_COLUMNS,
  DAILY_COLUMNS,
  type DailyColumn,
  EXPORT_SHEETS,
  type ExportSettings,
  type ExportWords,
  SUMMARY_COLUMNS,
  type SummaryColumn,
} from "@domain/payroll-export";
import { defaultLocale } from "@/i18n/config";
import { type AppWording, translator } from "../../../wording";

/** A rich message as plain text: its `<ltr>` spans keep only their words. */
const ltr = (chunks: string) => chunks;

/** A day as the file's words write it: `2026-10-13` as "13/10/2026". */
export function fileDate(date: string): string {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

/** A month in words: `2026-10` as "אוקטובר 2026". */
export function fileMonth(month: string): string {
  return new Intl.DateTimeFormat(defaultLocale, {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-15T12:00:00Z`));
}

/** Each key of a list, with its words. */
function wordsOf<K extends string>(
  keys: readonly K[],
  word: (key: K) => string,
): Record<K, string> {
  return Object.fromEntries(keys.map((key) => [key, word(key)])) as Record<
    K,
    string
  >;
}

/**
 * The file's words (`app.pay.file`, with the screens' own for rates, rest
 * days, holidays, flags and notes), in the business's words, as plain text.
 */
export function exportWords(wording: AppWording): ExportWords {
  const t = translator(wording, "app.pay");
  const tf = translator(wording, "app.pay.file");
  const tc = translator(wording, "modules.time_clock");
  const ts = translator(wording, "modules.time_clock.settings");
  const cities = translator(wording, "cities");

  const flagFormat: FlagFormat = {
    date: fileDate,
    hours: decimalHours,
    shekels: (agorot) => formatShekels(agorot, "he"),
    holiday: (key) => tc(`holidays.${key}`),
    oneOff: (key) => tc(`oneOffRestDays.${key as OneOffRestDayKey}`),
  };
  const nameOfLine = (line: HolidayPayLine) =>
    line.holiday !== null
      ? tc(`holidays.${line.holiday}`)
      : tc(`oneOffRestDays.${(line.oneOffRestDay ?? "") as OneOffRestDayKey}`);
  const lineValues = (line: HolidayPayLine) => ({
    ltr,
    kind: line.holiday !== null ? "holiday" : "oneOff",
    name: nameOfLine(line),
    date: fileDate(line.date),
    average:
      line.averageMinutes === null ? "none" : decimalHours(line.averageMinutes),
  });
  const yesNo = (value: boolean) => (value ? tf("yes") : tf("no"));

  const settings = (value: ExportSettings) => [
    {
      label: ts("workWeek.label"),
      value: ts(`workWeek.options.${value.workWeek}`),
    },
    // The short day matters only in a five-day week.
    ...(value.workWeek === "five"
      ? [
          {
            label: ts("shortDay.label"),
            value: ts(`shortDay.options.${value.shortDay}`),
          },
        ]
      : []),
    {
      label: ts("restStart.label"),
      value: ts(`restStart.options.${value.restStart}`),
    },
    ...(value.restStart === "fixed"
      ? [{ label: ts("restStartTime.label"), value: value.restStartTime }]
      : []),
    { label: tf("about.city"), value: cities(value.city) },
    { label: ts("unpaidBreaks.label"), value: yesNo(value.unpaidBreaks) },
    {
      label: ts("roundToMinutes.label"),
      value: ts(`roundToMinutes.options.${value.roundToMinutes}`),
    },
  ];

  return {
    sheets: wordsOf(EXPORT_SHEETS, (key) => tf(`sheets.${key}`)),
    columns: {
      summary: wordsOf(
        SUMMARY_COLUMNS.filter((key): key is SummaryColumn => key !== "rates"),
        (key) => tf(`columns.summary.${key}`),
      ),
      daily: wordsOf(
        DAILY_COLUMNS.filter((key): key is DailyColumn => key !== "rates"),
        (key) => tf(`columns.daily.${key}`),
      ),
      check: wordsOf(CHECK_COLUMNS, (key) => tf(`columns.check.${key}`)),
      about: wordsOf(ABOUT_COLUMNS, (key) => tf(`columns.about.${key}`)),
    },
    rate: (bucket, rest) => t(`rateColumns.${bucket}`, { rest }),
    weekday: (day) =>
      tf(`weekdays.${String(day) as "0" | "1" | "2" | "3" | "4" | "5" | "6"}`),
    source: (source) => tf(`source.${source}`),
    status: (status) => tf(`status.${status}`),
    hoursLaw: (law) => tf(`hoursLaw.${law}`),
    rest: (rest) => t("tags.rest", { rest }),
    holiday: (key) => tc(`holidays.${key}`),
    oneOff: (key) => tc(`oneOffRestDays.${key as OneOffRestDayKey}`),
    yes: tf("yes"),
    noName: t("noName"),
    someone: tf("someone"),
    flag: (flag) =>
      tc.markup(`payroll.flags.${flag.code}`, {
        ...flagValues(flag, flagFormat),
        ltr,
      }),
    rule: (code) => tf(`rules.${code}`),
    dayNotWorked: (line) => tf.markup("dayNotWorked", lineValues(line)),
    dayNotWorkedCheck: (line, form) =>
      [
        tf.markup("dayNotWorkedCheck", lineValues(line)),
        ...line.check.map(
          (check) => `${t(`holidayPay.checks.${check}`, { form })}.`,
        ),
      ].join(" "),
    dayNotWorkedRule: (line) =>
      tf("dayNotWorkedRule", {
        kind: line.holiday !== null ? "holiday" : "oneOff",
      }),
    note: (note) => {
      switch (note.code) {
        case "workWeekUnset":
          return tc.markup("payroll.notes.workWeekUnset", {
            ltr,
            weekOf: fileDate(note.weekOf),
            used: note.used,
          });
        case "roundingIgnored":
          return tc.markup("payroll.notes.roundingIgnored", {
            ltr,
            step: note.step,
          });
        case "minimumWageTableStale":
          return tc("payroll.notes.minimumWageTableStale");
        case "paidAbsencesMissing":
          return tc("payroll.notes.paidAbsencesMissing");
        default:
          return note satisfies never;
      }
    },
    workWeekRule: tf("workWeekRule"),
    unchanged: tf("unchanged"),
    about: {
      business: tf("about.business"),
      month: tf("about.month"),
      madeAt: tf("about.madeAt"),
      madeBy: tf("about.madeBy"),
      engine: tf("about.engine"),
      minimumWage: tf("about.minimumWage"),
      note: tf("about.note"),
      monthName: fileMonth,
      madeByTeam: (name) =>
        name === null
          ? tf("about.madeByTeamNoName")
          : tf("about.madeByTeam", { name }),
      settings,
      lines: wordsOf(ABOUT_LINES, (line) => tf(`about.lines.${line}`)),
    },
  };
}

/** The file's name in words, without its extension. */
export function fileTitle(
  wording: AppWording,
  business: string,
  month: string,
): string {
  return translator(wording, "app.pay.file")("name", {
    business,
    month: fileMonth(month),
  });
}
