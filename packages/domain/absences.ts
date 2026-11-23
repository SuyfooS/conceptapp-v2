import { z } from "zod";
import { addDays } from "./availability";
import type { Viewer } from "./modules";
import { editsClock } from "./time-clock";
import { lastDayOf } from "./wages";

/*
 * Days away: vacation, sick leave, reserve duty or another absence
 * (known issue 19; 20261127000600_absences.sql). Whole days, from one to
 * another, recorded by whoever edits the clock for someone on the staff.
 * The app counts the days by kind and never what they come to in pay: that
 * stays with the accountant (known issue 18). The database holds the same
 * rules; these say them first, so a form can answer before it sends.
 */

export const ABSENCE_KINDS = ["vacation", "sick", "reserve", "other"] as const;
export type AbsenceKind = (typeof ABSENCE_KINDS)[number];

/** A note's length, in characters, as Postgres counts them. */
export const ABSENCE_NOTE_MAX = 200;
/** Days in one record at most: a year, a leap year's too. */
export const ABSENCE_MAX_DAYS = 366;
/** How far back and ahead of the business's day a record reaches. */
export const ABSENCE_REACH_DAYS = 366;
/** A removal is taken back within this many minutes, by whoever removed it. */
export const ABSENCE_RESTORE_MINUTES = 10;

const isoDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** A record as the screens read it (`@db/absences`). */
export const absence = z.object({
  id: z.string(),
  userId: z.string(),
  kind: z.enum(ABSENCE_KINDS),
  from: isoDay,
  to: isoDay,
  note: z.string().nullable(),
  recordedBy: z.string().nullable(),
  recordedAt: z.string(),
  changedAt: z.string().nullable(),
  removedBy: z.string().nullable(),
  removedAt: z.string().nullable(),
});
export type Absence = z.infer<typeof absence>;

/** Who is away and when, without the kind: what the schedule's builders read. */
export type AwaySpan = { userId: string; from: string; to: string };
/** The same with its kind, for the hours engine and the pay screens. */
export type KindSpan = AwaySpan & { kind: AbsenceKind };

/** A record as the form holds it, before it is read. */
export type AbsenceValues = {
  kind: string;
  from: string;
  to: string;
  note: string;
};

/** What a record must be, each refused with its own words. */
export type AbsenceProblem =
  | "kind"
  | "dates"
  | "order"
  | "tooLong"
  | "tooFar"
  | "note";

export type ParsedAbsence = {
  kind: AbsenceKind;
  from: string;
  to: string;
  /** Trimmed; null when empty. */
  note: string | null;
};

const dayMs = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Whole days from `from` to `to`: 0 for the same day, negative before it. */
export function daysApart(from: string, to: string): number {
  return Math.round((dayMs(to) - dayMs(from)) / 86_400_000);
}

const realDay = (value: string) =>
  isoDay.safeParse(value).success &&
  new Date(dayMs(value)).toISOString().slice(0, 10) === value;

/**
 * A record from the form's values, at the business's `today`, with the
 * database's edges (private.absence_note_of): one of the four kinds, both
 * days, the last on or after the first, at most 366 days, from a year back to
 * a year ahead of today, and a note of at most 200 characters.
 */
export function parseAbsence(
  values: AbsenceValues,
  today: string,
): { ok: true; value: ParsedAbsence } | { ok: false; problem: AbsenceProblem } {
  const kind = z.enum(ABSENCE_KINDS).safeParse(values.kind);
  if (!kind.success) return { ok: false, problem: "kind" };
  const from = values.from.trim();
  const to = values.to.trim();
  if (!realDay(from) || !realDay(to)) return { ok: false, problem: "dates" };
  const length = daysApart(from, to);
  if (length < 0) return { ok: false, problem: "order" };
  if (length >= ABSENCE_MAX_DAYS) return { ok: false, problem: "tooLong" };
  if (
    from < addDays(today, -ABSENCE_REACH_DAYS) ||
    to > addDays(today, ABSENCE_REACH_DAYS)
  ) {
    return { ok: false, problem: "tooFar" };
  }
  const note = values.note.trim();
  // Postgres counts characters, not UTF-16 units: an emoji is one.
  if ([...note].length > ABSENCE_NOTE_MAX) {
    return { ok: false, problem: "note" };
  }
  return {
    ok: true,
    value: { kind: kind.data, from, to, note: note === "" ? null : note },
  };
}

/** A month's first and last day (`YYYY-MM`). */
export function monthSpan(month: string): { from: string; to: string } {
  return { from: `${month}-01`, to: lastDayOf(month) };
}

/**
 * Calendar days of a record, rest days and holidays inside it included;
 * with `within`, only those inside it (a month's), 0 when none are.
 */
export function absenceDays(
  span: { from: string; to: string },
  within?: { from: string; to: string },
): number {
  const from = within && within.from > span.from ? within.from : span.from;
  const to = within && within.to < span.to ? within.to : span.to;
  return Math.max(0, daysApart(from, to) + 1);
}

/** A month's days away by kind (`YYYY-MM`), every kind there. */
export function absenceDaysByKind(
  absences: readonly Pick<KindSpan, "kind" | "from" | "to">[],
  month: string,
): Record<AbsenceKind, number> {
  const days: Record<AbsenceKind, number> = {
    vacation: 0,
    sick: 0,
    reserve: 0,
    other: 0,
  };
  const span = monthSpan(month);
  for (const one of absences) days[one.kind] += absenceDays(one, span);
  return days;
}

/** Each date away from `from` to `to`, with its kind, in date order. */
export function absenceDates(
  absences: readonly Pick<KindSpan, "kind" | "from" | "to">[],
  from: string,
  to: string,
): { date: string; kind: AbsenceKind }[] {
  const dates: { date: string; kind: AbsenceKind }[] = [];
  for (const one of absences) {
    const first = one.from > from ? one.from : from;
    const last = one.to < to ? one.to : to;
    for (let date = first; date <= last; date = addDays(date, 1)) {
      dates.push({ date, kind: one.kind });
    }
  }
  return dates.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Whether `userId` is away on `date`. */
export function awayOn(
  spans: readonly AwaySpan[],
  userId: string,
  date: string,
): boolean {
  return spans.some(
    (span) => span.userId === userId && span.from <= date && date <= span.to,
  );
}

/** Who is away on each of `dates`, in the order the spans come. */
export function awayByDay(
  spans: readonly AwaySpan[],
  dates: readonly string[],
): Map<string, string[]> {
  const byDay = new Map<string, string[]>();
  for (const date of dates) {
    const away: string[] = [];
    for (const span of spans) {
      if (span.from <= date && date <= span.to && !away.includes(span.userId)) {
        away.push(span.userId);
      }
    }
    byDay.set(date, away);
  }
  return byDay;
}

/**
 * Who is away on `today`, each with their last day away: records that touch
 * run on (a vacation, then sick days from the day after), so the last day is
 * the run's.
 */
export function awayToday(
  spans: readonly AwaySpan[],
  today: string,
): { userId: string; until: string }[] {
  const out: { userId: string; until: string }[] = [];
  for (const span of spans) {
    if (span.from > today || span.to < today) continue;
    if (out.some((one) => one.userId === span.userId)) continue;
    const own = spans
      .filter((one) => one.userId === span.userId)
      .sort((a, b) => (a.from < b.from ? -1 : 1));
    let until = span.to;
    for (const next of own) {
      if (next.from <= addDays(until, 1) && next.to > until) until = next.to;
    }
    out.push({ userId: span.userId, until });
  }
  return out;
}

/**
 * Whether the viewer records days away for `personId`: whoever edits the
 * clock (`editsClock`), for someone else, or for themselves when an owner
 * (the rule of one's own hours). Whether the person is on the staff is the
 * database's to say.
 */
export function canRecordAbsence(
  viewer: Viewer,
  viewerId: string,
  personId: string,
): boolean {
  return (
    editsClock(viewer) && (personId !== viewerId || viewer.role === "owner")
  );
}

/** The live records: a removed one counts nowhere. */
export function liveAbsences<T extends { removedAt: string | null }>(
  rows: readonly T[],
): T[] {
  return rows.filter((row) => row.removedAt === null);
}

/**
 * Where the form's first day starts: today when the month shown is today's,
 * else that month's first day.
 */
export function absenceStartFor(month: string, today: string): string {
  return today.startsWith(month) ? today : `${month}-01`;
}

/** Why a record wasn't written, as the screen says it. */
export type AbsenceFailure =
  | AbsenceProblem
  | "overlap"
  | "monthClosed"
  | "ownAbsence"
  | "notOnStaff"
  | "removed"
  | "notRemoved"
  | "tooLate"
  | "noAccess"
  | "viewOnly"
  | "failed";

/** Hints of the database's 22023 refusals, by the problem each is. */
const VALUE_HINTS: ReadonlyMap<string, AbsenceProblem> = new Map([
  ["kind", "kind"],
  ["dates", "dates"],
  ["order", "order"],
  ["too_long", "tooLong"],
  ["too_far", "tooFar"],
  ["note", "note"],
]);

/**
 * Maps an error from the absence functions to what the screen says, by its
 * code and hint: an overlap is the constraint's, one's own the 42501 with
 * hint `own`, every other 42501 no access (an unknown record reads the same).
 */
export function absenceFailureOf(
  code: string | undefined,
  hint: string | null = null,
): AbsenceFailure {
  switch (code) {
    case "23P01":
      return "overlap";
    case "42501":
      return hint === "own" ? "ownAbsence" : "noAccess";
    case "55000":
      switch (hint) {
        case "month_closed":
          return "monthClosed";
        case "not_on_staff":
          return "notOnStaff";
        case "removed":
          return "removed";
        case "not_removed":
          return "notRemoved";
        case "too_late":
          return "tooLate";
        default:
          return "failed";
      }
    case "22023":
      return (hint && VALUE_HINTS.get(hint)) || "failed";
    default:
      return "failed";
  }
}
