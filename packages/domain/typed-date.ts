import { cleanTyped } from "./typed-text";

/**
 * A day typed as three numbers, day, month and year, never picked from a
 * wheel (profile design §2.12, §3.5): `@ui/date-field` draws the fields, and
 * this reads them, the same in the browser and on the server. Digits may come
 * from any keyboard (`cleanTyped`).
 */

export type DateParts = { day: string; month: string; year: string };

export const EMPTY_DATE: DateParts = { day: "", month: "", year: "" };

export type TypedDate =
  | { ok: true; date: string }
  /** `empty`: nothing typed; `invalid`: not a day of the calendar. */
  | { ok: false; error: "empty" | "invalid" };

const digits = (value: string) => cleanTyped(value).trim();

/** Whether nothing was typed in any of the three. */
export function isEmptyDate(parts: DateParts): boolean {
  return (
    digits(parts.day) === "" &&
    digits(parts.month) === "" &&
    digits(parts.year) === ""
  );
}

/**
 * The day the three fields name, `YYYY-MM-DD`: a day of 1–2 digits, a month of
 * 1–2 and a year of 4, that the calendar has (no 30 February, 29 February only
 * in a leap year).
 */
export function parseTypedDate(parts: DateParts): TypedDate {
  if (isEmptyDate(parts)) return { ok: false, error: "empty" };
  const day = digits(parts.day);
  const month = digits(parts.month);
  const year = digits(parts.year);
  if (
    !/^\d{1,2}$/.test(day) ||
    !/^\d{1,2}$/.test(month) ||
    !/^\d{4}$/.test(year)
  ) {
    return { ok: false, error: "invalid" };
  }
  const d = Number(day);
  const m = Number(month);
  const y = Number(year);
  if (y < 1900 || m < 1 || m > 12 || d < 1) {
    return { ok: false, error: "invalid" };
  }
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  if (d > last) return { ok: false, error: "invalid" };
  return {
    ok: true,
    date: `${year}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`,
  };
}

/** A day (`YYYY-MM-DD`) as the three fields show it, or empty ones for null. */
export function datePartsOf(date: string | null): DateParts {
  if (!date) return EMPTY_DATE;
  const [year = "", month = "", day = ""] = date.split("-");
  return { day: String(Number(day)), month: String(Number(month)), year };
}
