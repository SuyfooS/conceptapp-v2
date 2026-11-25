/**
 * What the fill's sheet says: the line above its button (`fillLine`), of the
 * shifts that had an open place, the days in the fill's order and for a
 * place left open its one reason, and its people, each with their week
 * after the fill (`fillPeople`). Without React, so the tests stand in for
 * the sheet, which puts these into words (`app.build.fill.*`).
 */

import type { ShabbatConflict } from "@domain/availability-form";
import type { FillPerson, FillShift, WeekFill } from "@domain/fill-week";

/** Candle lighting or havdalah, on the side of Shabbat the shift reaches. */
type ShabbatSide = { side: ShabbatConflict; time: string };

/**
 * Why a place stays open, as the sheet says it:
 * - `shabbat`: the shift reaches into Shabbat and no answer covers it, with
 *   the time and what to do (`why.friday`, `why.saturday`);
 * - `nobody`: nobody covers it whole; `others` once anyone is on it after
 *   the fill, whoever put them there, so it says nobody else does
 *   (`why.nobodyElse`), with how many cover only a part (`why.partial`);
 * - `blocked`: everyone who covers it, each with the first rule that
 *   stopped them (`why.blocked`).
 * Beside the last two, a shift that reaches into Shabbat says its time
 * (`why.fridayToo`, `why.saturdayToo`): an answer covers it, so it never
 * says it has none.
 */
export type FillReason =
  | ({ why: "shabbat" } & ShabbatSide)
  | {
      why: "nobody";
      others: boolean;
      partial: number;
      shabbat: ShabbatSide | null;
    }
  | {
      why: "blocked";
      blocked: FillShift["blocked"];
      shabbat: ShabbatSide | null;
    };

/**
 * The reason a shift keeps an open place after the fill, with `assigned`
 * the people on it after the fill (`WeekFill.week[index].assignees`); null
 * once nothing is left open on it.
 */
export function fillReason(
  shift: FillShift,
  assigned: number,
): FillReason | null {
  if (shift.open === 0 || shift.why === null) return null;
  if (shift.why === "shabbat" && shift.shabbat) {
    return { why: "shabbat", ...shift.shabbat };
  }
  if (shift.why === "blocked") {
    return { why: "blocked", blocked: shift.blocked, shabbat: shift.shabbat };
  }
  return {
    why: "nobody",
    others: assigned > 0,
    partial: shift.partial,
    shabbat: shift.shabbat,
  };
}

/** The line in the sheet's footer, as a key under `app.build.fill`. */
export type FillLine =
  | "note"
  | "nothing.full"
  | "nothing.noAnswers"
  | "nothing.noAnswersRunning"
  | "nothing.none";

/**
 * The line above the sheet's button, or in its place: while the fill places
 * anyone, that nothing is saved or sent yet (`note`). Else why nobody is
 * placed: no open place left in a shift still to start (`nothing.full`, once
 * the clock has begun the last one while the sheet was open); nobody sent
 * availability, while they still can (`nothing.noAnswers`, next week, which
 * the reminder's link is for: `remindable`), or with the way to place people
 * by hand once nobody can (`nothing.noAnswersRunning`, the week running
 * now, whose answers were all sent before it began); or each shift says why
 * (`nothing.none`).
 */
export function fillLine(
  fill: Pick<WeekFill, "places" | "openBefore" | "answered">,
  remindable: boolean,
): FillLine {
  if (fill.places > 0) return "note";
  if (fill.openBefore === 0) return "nothing.full";
  if (fill.answered === 0) {
    return remindable ? "nothing.noAnswers" : "nothing.noAnswersRunning";
  }
  return "nothing.none";
}

/** A day of the sheet: its date, and its shifts that had an open place. */
export type FillDay = { date: string; shifts: FillShift[] };

/**
 * The shifts that had an open place, a group for each day that has one, in
 * the fill's order (by day, then start): each shift's day as the week after
 * the fill has it.
 */
export function fillDays(fill: Pick<WeekFill, "week" | "shifts">): FillDay[] {
  const days: FillDay[] = [];
  for (const shift of fill.shifts) {
    const date = fill.week[shift.index]?.day;
    if (date === undefined) continue;
    const last = days.at(-1);
    if (last?.date === date) last.shifts.push(shift);
    else days.push({ date, shifts: [shift] });
  }
  return days;
}

/** A row of "לפי אנשים": someone who answered, and their week after the fill. */
export type FillPersonRow = {
  user: string;
  /** Their name on the team, as the sheet's other lines write it. */
  name: string;
  /** Shifts in the week after the fill, the fill's own included. */
  shifts: number;
  /** Their hours in the week after the fill, to a tenth: 21.5, never 21.53. */
  hours: number;
  /** How many of those shifts the fill gave them. */
  added: number;
};

/**
 * "לפי אנשים": everyone who answered for the week (`WeekFill.byPerson`, an
 * answer with no hours in it included: they answered, and the manager may
 * still have put them on by hand), each with the shifts and hours they have
 * after the fill and how many of them the fill gave, the three in one line
 * (`app.build.fill.person`). Fewest shifts first, so who gets least is seen
 * first; then by name, as the screens sort names (`locale`); then by id, so
 * two of the same name keep one order.
 */
export function fillPeople(
  people: readonly FillPerson[],
  nameOf: (userId: string) => string,
  locale: string,
): FillPersonRow[] {
  return people
    .map(({ user, shifts, minutes, added }) => ({
      user,
      name: nameOf(user),
      shifts,
      hours: Math.round(minutes / 6) / 10,
      added,
    }))
    .sort(
      (a, b) =>
        a.shifts - b.shifts ||
        a.name.localeCompare(b.name, locale) ||
        (a.user < b.user ? -1 : a.user > b.user ? 1 : 0),
    );
}
