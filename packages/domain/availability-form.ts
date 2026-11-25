import {
  type AvailabilityRange,
  availabilitySubmission,
  weekDates,
  weekdayOf,
} from "./availability";
import { minutesOf, rangeMinutes } from "./hours";
import { type ShabbatTimes, timeIn } from "./shabbat";
import { type ShiftPattern, shiftsOn } from "./staffing";

/**
 * The worker's availability form, free of React and the database: the
 * Friday and Saturday rules and the checks behind each error the form
 * shows. The server runs the same checks before it saves.
 */

/**
 * Where Shabbat cuts the week for a business closed on Shabbat: Friday's
 * availability ends by candle lighting, Saturday's starts from havdalah.
 * Times are "HH:MM" in the business's zone.
 */
export type ShabbatLimits = {
  friday: string;
  candleLighting: string;
  saturday: string;
  havdalah: string;
};

export function shabbatLimits(
  times: ShabbatTimes,
  timeZone: string,
): ShabbatLimits {
  const [year = 0, month = 1, day = 1] = times.friday.split("-").map(Number);
  const saturday = new Date(Date.UTC(year, month - 1, day + 1));
  return {
    friday: times.friday,
    candleLighting: timeIn(times.candleLighting, timeZone),
    saturday: saturday.toISOString().slice(0, 10),
    havdalah: timeIn(times.havdalah, timeZone),
  };
}

/** The Friday of the week starting on `weekStart`. */
export function fridayOf(weekStart: string): string {
  const friday = weekDates(weekStart).find((date) => weekdayOf(date) === 5);
  // Every run of seven days has one.
  return friday ?? weekStart;
}

export type ShabbatConflict = "friday" | "saturday";

/**
 * Whether a range reaches into Shabbat: on Friday it must end by candle
 * lighting (and so not run past midnight); on Saturday it must start from
 * havdalah. Other days are free.
 */
export function shabbatConflict(
  range: AvailabilityRange,
  limits: ShabbatLimits,
): ShabbatConflict | null {
  if (range.day === limits.friday) {
    const end = minutesOf(range.start) + rangeMinutes(range.start, range.end);
    return end > minutesOf(limits.candleLighting) ? "friday" : null;
  }
  if (range.day === limits.saturday) {
    return minutesOf(range.start) < minutesOf(limits.havdalah)
      ? "saturday"
      : null;
  }
  return null;
}

export const AVAILABILITY_NOTE_MAX = 300;

export type RangeProblem =
  | "time"
  | "same"
  | "outside"
  | "overlap"
  | ShabbatConflict;

export type AvailabilityFormErrors = {
  /** By the range's index in the list sent. */
  ranges?: Record<number, RangeProblem>;
  note?: "tooLong";
  form?: "invalid";
};

type Parsed =
  | { ok: true; value: { ranges: AvailabilityRange[]; note?: string } }
  | { ok: false; errors: AvailabilityFormErrors };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Checks the form for the week starting on `weekStart`. `shabbat` is set
 * when the business is closed on Shabbat. Each range gets at most one
 * error, the first that applies; the database checks the same rules again,
 * except Shabbat, which needs the business's location.
 */
export function parseAvailabilityForm(
  input: { ranges: unknown; note: unknown },
  weekStart: string,
  shabbat: ShabbatLimits | null,
): Parsed {
  const errors: AvailabilityFormErrors = {};
  const note = typeof input.note === "string" ? input.note.trim() : "";
  if (note.length > AVAILABILITY_NOTE_MAX) errors.note = "tooLong";

  if (!Array.isArray(input.ranges) || input.ranges.length > 21) {
    return { ok: false, errors: { ...errors, form: "invalid" } };
  }
  const days = new Set(weekDates(weekStart));
  const rangeErrors: Record<number, RangeProblem> = {};
  const ranges: AvailabilityRange[] = [];
  input.ranges.forEach((raw: unknown, i) => {
    const r = (typeof raw === "object" && raw !== null ? raw : {}) as Record<
      string,
      unknown
    >;
    const range = {
      day: String(r.day ?? ""),
      start: String(r.start ?? ""),
      end: String(r.end ?? ""),
    };
    ranges.push(range);
    if (!TIME.test(range.start) || !TIME.test(range.end)) {
      rangeErrors[i] = "time";
    } else if (range.start === range.end) {
      rangeErrors[i] = "same";
    } else if (!days.has(range.day)) {
      rangeErrors[i] = "outside";
    } else {
      const conflict = shabbat ? shabbatConflict(range, shabbat) : null;
      if (conflict) rangeErrors[i] = conflict;
    }
  });

  if (Object.keys(rangeErrors).length === 0) {
    // Overlaps, in the same words the submission schema uses.
    const result = availabilitySubmission(weekStart).safeParse({
      ranges,
      note,
    });
    if (!result.success) {
      for (const issue of result.error.issues) {
        const [field, index] = issue.path;
        if (field === "ranges" && typeof index === "number") {
          rangeErrors[index] ??= "overlap";
        }
      }
    }
  }
  if (Object.keys(rangeErrors).length > 0) errors.ranges = rangeErrors;
  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: note ? { ranges, note } : { ranges } };
}

/**
 * The problems of one day's hours, by their index, for checking a day on its
 * own while it is being edited. The rules never look across days, so another
 * day's problem cannot hide one here, as it can when checking the whole form.
 */
export function dayProblems(
  ranges: readonly { start: string; end: string }[],
  day: string,
  weekStart: string,
  shabbat: ShabbatLimits | null,
): Record<number, RangeProblem> {
  const parsed = parseAvailabilityForm(
    { ranges: ranges.map(({ start, end }) => ({ day, start, end })), note: "" },
    weekStart,
    shabbat,
  );
  return parsed.ok ? {} : (parsed.errors.ranges ?? {});
}

/**
 * A regular shift's hours and the days it runs: all the form needs of the
 * business's shift pattern (`ShiftPattern`, the scheduling settings' `shifts`,
 * which the builder draws a week from), never its name or how many it needs.
 * An end at or before the start ends on the next day.
 */
export type ShiftHours = Pick<ShiftPattern, "days" | "start" | "end">;

/** The hours of a shift pattern, for the form (`AvailabilityWeek.shiftHours`). */
export function shiftHoursOf(patterns: readonly ShiftPattern[]): ShiftHours[] {
  return patterns.map(({ days, start, end }) => ({ days, start, end }));
}

type Hours = { start: string; end: string };

const DAY_MINUTES = 24 * 60;

/** "HH:MM" for minutes after the day's midnight, past midnight included. */
function clockOf(minutes: number): string {
  const m = minutes % DAY_MINUTES;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * The usual hours, as the form suggested them before it read the business's
 * shifts: the usual day on an empty day, the usual evening after that. On
 * Shabbat's days it stays inside the limits: Friday ends by candle lighting
 * (15:00 at the latest), Saturday starts at havdalah.
 */
function usualRange(
  day: string,
  hasHours: boolean,
  shabbat: ShabbatLimits | null,
): Hours {
  if (shabbat && day === shabbat.saturday) {
    return { start: shabbat.havdalah, end: "23:30" };
  }
  if (shabbat && day === shabbat.friday) {
    const end =
      shabbat.candleLighting < "15:00" ? shabbat.candleLighting : "15:00";
    return { start: "08:00", end };
  }
  return hasHours
    ? { start: "18:00", end: "23:00" }
    : { start: "09:00", end: "17:00" };
}

/**
 * The business's shifts on `day` (`shiftsOn`, as the builder draws them), each
 * cut where Shabbat cuts the day's hours (`shabbatConflict`): on Friday ending
 * by candle lighting, on Saturday starting from havdalah. A shift wholly inside
 * Shabbat is left out. In minutes after the day's midnight; an end past 1440
 * is on the next day.
 */
function shiftSpans(
  day: string,
  shabbat: ShabbatLimits | null,
  shifts: readonly ShiftHours[],
): { from: number; to: number }[] {
  return shiftsOn(shifts, weekdayOf(day)).flatMap((shift) => {
    let from = minutesOf(shift.start);
    let to = from + rangeMinutes(shift.start, shift.end);
    if (shabbat && day === shabbat.friday) {
      to = Math.min(to, minutesOf(shabbat.candleLighting));
    }
    if (shabbat && day === shabbat.saturday) {
      from = Math.max(from, minutesOf(shabbat.havdalah));
    }
    return from < to ? [{ from, to }] : [];
  });
}

/**
 * The hours an empty day opens with in the form. Where the business has shifts
 * that day (its shift pattern), from the earliest start to the latest end of
 * them, each cut by Shabbat as the form's own rules cut the day, so hours kept
 * as suggested cover every shift that day that Shabbat leaves whole, and the
 * fill from availability can put the person on any of them. Shifts around the
 * clock (from the earliest start to the latest end a day or more) give two
 * ranges meeting at the last shift's start, since a range is shorter than a
 * day; joined, they cover it all. Where the business has no shift that day, or
 * Shabbat leaves none of them, the usual day, as before the business had
 * shifts: 09:00–17:00, Friday 08:00 until 15:00 or candle lighting, Saturday
 * from havdalah until 23:30. The form has no rule for holidays, so neither
 * does this.
 */
export function suggestedDay(
  day: string,
  shabbat: ShabbatLimits | null,
  shifts: readonly ShiftHours[],
): [Hours, ...Hours[]] {
  const spans = shiftSpans(day, shabbat, shifts);
  if (spans.length === 0) return [usualRange(day, false, shabbat)];
  const from = Math.min(...spans.map((s) => s.from));
  const to = Math.max(...spans.map((s) => s.to));
  if (to - from < DAY_MINUTES) {
    return [{ start: clockOf(from), end: clockOf(to) }];
  }
  // A day or more: the shift that ends last starts by the last start and is
  // shorter than a day, so both halves are too.
  const last = Math.max(...spans.map((s) => s.from));
  return [
    { start: clockOf(from), end: clockOf(last) },
    { start: clockOf(last), end: clockOf(to) },
  ];
}

/**
 * The hours a new range starts with ("הוספת שעות"). On an empty day, the
 * day's first suggested range (`suggestedDay`). With hours already, the day's
 * last shift, from the latest start to the latest end, which someone who
 * narrowed the day to its first shift adds next. On a day with one shift (or
 * all starting together), whose last shift is the whole suggestion already,
 * and on a day without shifts, the usual evening: 18:00–23:00, and on Friday
 * and Saturday the usual hours there, when closed on Shabbat.
 */
export function suggestedRange(
  day: string,
  hasHours: boolean,
  shabbat: ShabbatLimits | null,
  shifts: readonly ShiftHours[],
): Hours {
  const [first] = suggestedDay(day, shabbat, shifts);
  if (!hasHours) return first;
  const spans = shiftSpans(day, shabbat, shifts);
  if (spans.length === 0) return usualRange(day, true, shabbat);
  const last = {
    start: clockOf(Math.max(...spans.map((s) => s.from))),
    end: clockOf(Math.max(...spans.map((s) => s.to))),
  };
  return last.start === first.start && last.end === first.end
    ? usualRange(day, true, shabbat)
    : last;
}

/** Message keys of the days of the week, 0 = Sunday. */
export const WEEKDAY_KEYS = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
] as const;

export type WeekdayKey = (typeof WEEKDAY_KEYS)[number];

/** "1.11" for 1 November: the short date Israeli schedules print. */
export function dayMonth(date: string): string {
  const [, month = 1, day = 1] = date.split("-").map(Number);
  return `${day}.${month}`;
}
